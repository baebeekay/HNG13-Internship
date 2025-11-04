
import express from 'express';
import bodyParser from 'body-parser';
import * as dotenv from 'dotenv';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const AGENT_BASE_URL = process.env.AGENT_BASE_URL; 

// Initialize Google Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const model = 'gemini-2.5-flash'; 

app.use(bodyParser.json());

const agentJson = {
    "name": "SonicCritic Agent",
    "description": "Synthesizes top 5 album reviews into critical consensus using Google Gemini.",
    "url": `${AGENT_BASE_URL}/a2a/agent`,
    "skills": [{
        "id": "album_review_synthesizer",
        "name": "Album Review Synthesizer",
        "description": "Takes an album and artist and returns a synthesized critical consensus."
    }]
};


/**
 * Searches Google for the top 5 album reviews and scrapes their content.
 * @param {string} album 
 * @param {string} artist 
 * @returns {Promise<Array<string>>} An array of scraped review texts.
 */
async function scrapeReviews(album, artist) {
    
    const reviewTargets = [
        `https://www.google.com/search?q=${encodeURIComponent(`${album} ${artist} review pitchfork`)}`,
        `https://www.google.com/search?q=${encodeURIComponent(`${album} ${artist} review nme`)}`,
        `https://www.google.com/search?q=${encodeURIComponent(`${album} ${artist} review rolling stone`)}`,
        `https://www.google.com/search?q=${encodeURIComponent(`${album} ${artist} review allmusic`)}`,
    ];

    const scrapedTexts = [];
    const scrapePromises = reviewTargets.map(async (url, index) => {
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                },
                responseType: 'text' 
            });

            const $ = cheerio.load(response.data);
            
            const firstLink = $('div.yuRUbf a').first().attr('href');
            
            if (firstLink) {
                const reviewResponse = await axios.get(firstLink, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });
                const $$ = cheerio.load(reviewResponse.data);

                // 💡 Generic content selectors for common blog/article structure
                const articleBody = $$('article, .entry-content, .post-content').first().text();
                
                // Keep only the first 5000 characters to manage LLM token limits and relevance
                const cleanedText = articleBody.replace(/\s\s+/g, ' ').trim().substring(0, 5000);

                if (cleanedText.length > 500) { // Only keep reviews with substantial content
                    scrapedTexts.push(`--- Review from ${firstLink} ---\n${cleanedText}`);
                }
            }

        } catch (error) {
            console.warn(`Could not scrape or fetch review target ${index}: ${url}`, error.message);
        }
    });

    await Promise.all(scrapePromises);
    
    if (scrapedTexts.length === 0) {
        throw new Error("Could not find enough substantial reviews to synthesize.");
    }
    
    return scrapedTexts;
}


/**
 * Uses Google Gemini to synthesize the scraped review texts into a consensus.
 * @param {string} album 
 * @param {string} artist 
 * @param {Array<string>} reviews 
 * @returns {Promise<string>} The synthesized critical consensus.
 */
async function synthesizeConsensus(album, artist, reviews) {
    const reviewBlock = reviews.join('\n\n====================\n\n');
    
    const prompt = `
        You are SonicCritic, an expert music journalist. Your task is to receive multiple raw, scraped text inputs from different music reviews for the album "${album}" by "${artist}".

        Analyze all provided texts. For each review (separated by "====================="), try to extract:
        1. The source/website (if discernible from the text/URL hint).
        2. The core argument or central theme of the review.
        3. The final score, rating, or general sentiment (e.g., 9/10, A-, Essential).

        Finally, write a cohesive, overall **Critical Consensus** in Markdown.

        **OUTPUT FORMAT MUST BE:**
        
        **🎵 SonicCritic Consensus for "${album}" by ${artist} 🎵**
        
        ### Individual Review Summary
        
        * **Source 1:** [Core argument]. **Score:** [Rating]
        * **Source 2:** [Core argument]. **Score:** [Rating]
        * ... (List all reviews)
        
        ---
        
        ### Critical Consensus & Final Verdict
        
        [Your final 2-3 paragraph synthesis on the album's reception, highlighting common praise, criticisms, and the overall consensus.]
        
        ---
        
        **Raw Review Texts to Analyze:**
        
        ${reviewBlock}
    `;

    const response = await ai.models.generateContent({
        model: model,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    return response.text;
}



app.get('/.well-known/agent.json', (req, res) => {
    res.json(agentJson);
});

app.get('/healthz', (req, res) => {
    res.status(200).send('OK');
});

app.post('/a2a/agent', async (req, res) => {
    const { jsonrpc, id, method, params } = req.body;

    // --- A2A Protocol Validation ---
    
  
    if (jsonrpc !== '2.0' || !method || !id || !params) {
        return res.status(200).json({ 
            jsonrpc: "2.0",
            id: id || null,
            error: {
                code: -32600,
                message: "Invalid or malformed JSON-RPC 2.0 request."
            }
        });
    }

    const supportedSkill = agentJson.skills.find(skill => skill.id === method);
    if (!supportedSkill) {
        return res.status(200).json({
            jsonrpc: "2.0",
            id: id,
            error: {
                code: -32601,
                message: `Method not found: ${method}`
            }
        });
    }

    // --- Skill Execution ---

    if (method === 'album_review_synthesizer') {
        try {
            const input = params.text;
            
            // Regex to extract Album and Artist
            const match = input.match(/review\s+(.*?)\s+by\s+(.*)/i);
            
            if (!match) {
                return res.status(200).json({
                    jsonrpc: "2.0",
                    id: id,
                    error: {
                        code: -32000,
                        message: "Invalid command format. Please use: Review [Album Name] by [Artist Name]."
                    }
                });
            }

            const album = match[1].trim();
            const artist = match[2].trim();

            console.log(`Starting real process for Album: ${album}, Artist: ${artist}`);
            

            const reviews = await scrapeReviews(album, artist);
            console.log(`Successfully scraped ${reviews.length} review(s).`);

            const consensus = await synthesizeConsensus(album, artist, reviews);

          
            return res.status(200).json({
                jsonrpc: "2.0",
                id: id,
                result: consensus 
            });

        } catch (error) {
            console.error("Agent Execution Error:", error.message);
            
          
            return res.status(200).json({
                jsonrpc: "2.0",
                id: id,
                error: {
                    code: -32603,
                    message: `Internal server error during skill execution: ${error.message}`
                }
            });
        }
    }
});


app.listen(PORT, () => {
    console.log(`SonicCritic Agent listening on port ${PORT}`);
    console.log(`Base URL is: ${AGENT_BASE_URL}`);
});
