
// server.js

// 1. Setup Dependencies and Imports
import express from 'express';
import bodyParser from 'body-parser';
import * as dotenv from 'dotenv';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

// 2. Configuration & Initialization
const app = express();
const PORT = process.env.PORT || 3000;
const AGENT_BASE_URL = process.env.AGENT_BASE_URL;

// Initialize Google Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const model = 'gemini-2.5-flash'; // Good balance of speed and quality

// Middleware
app.use(bodyParser.json());

// 3. Agent Configuration (The Agent Card)
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

// --- CORE AGENT LOGIC FUNCTIONS ---

/**
 * Searches Google for the top 4 album reviews and scrapes content snippets.
 * @param {string} album 
 * @param {string} artist 
 * @returns {Promise<Array<string>>} An array of scraped review texts.
 */
async function scrapeReviews(album, artist) {
    // Construct search query for Google
    const searchQuery = `${album} ${artist} album review`;

    // ⚠️ NOTE: For stability, we only search for the main Google results snippet, 
    // as fetching external review URLs can be slow or blocked.
    const url = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
    
    try {
        const response = await axios.get(url, {
            // A realistic User-Agent is crucial to avoid being blocked
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 10000 // Set a 10 second timeout for fetching the search page
        });

        const $ = cheerio.load(response.data);
        const scrapedTexts = [];

        // Selectors targeting organic search result snippets (the brief descriptions)
        $('div.g:lt(4) .VwiC3b, div.g:lt(4) .st, div.g:lt(4) .Uroaid').each((i, element) => {
            const snippet = $(element).text();
            if (snippet && snippet.length > 50) {
                // Find the associated title (to give the LLM context)
                const title = $(element).closest('.g').find('h3').text();
                scrapedTexts.push(`Source Title: ${title || 'Unknown'}\nSnippet: ${snippet}`);
            }
        });

        if (scrapedTexts.length === 0) {
            throw new Error("Could not find enough substantial review snippets to synthesize.");
        }
        
        return scrapedTexts;

    } catch (error) {
        console.error("Scraping error:", error.message);
        throw new Error(`Web scraping failed: ${error.message}`);
    }
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
        You are SonicCritic, an expert music journalist. Your task is to receive multiple raw, scraped text inputs from different Google search result snippets for the album "${album}" by "${artist}".

        Analyze all provided texts. For each snippet (separated by "====================="), summarize the core sentiment and rating (if available).

        Finally, write a cohesive, overall **Critical Consensus** in rich Markdown.

        **OUTPUT FORMAT MUST BE:**
        
        **🎵 SonicCritic Consensus for "${album}" by ${artist} 🎵**
        
        ### Individual Review Summary
        
        * **Source 1:** [Core sentiment and/or argument]. **Score:** [Rating/General Sentiment]
        * ... (List all 3-4 sources found)
        
        ---
        
        ### Critical Consensus & Final Verdict
        
        [Your final 2-3 paragraph synthesis on the album's reception, highlighting common praise, criticisms, and the overall consensus.]
        
        ---
        
        **Raw Snippet Texts to Analyze:**
        
        ${reviewBlock}
    `;

    const response = await ai.models.generateContent({
        model: model,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    return response.text;
}


// 4. A2A Required Endpoints (and Protocol Handler)

// 4.1. Agent Discovery Endpoint (/.well-known/agent.json)
app.get('/.well-known/agent.json', (req, res) => {
    res.json(agentJson);
});

// 4.2. Health Check Endpoint (/healthz)
app.get('/healthz', (req, res) => {
    res.status(200).send('OK');
});

// 4.3. Main A2A Communication Endpoint (/a2a/agent)
app.post('/a2a/agent', async (req, res) => {
    const { jsonrpc, id, method, params } = req.body;

    // --- A2A Protocol Validation ---
    
    // Check 1: Basic JSON-RPC structure check
    if (jsonrpc !== '2.0' || !method || !id || !params) {
        // HNG Fix: Use HTTP 200 with JSON-RPC error code -32600
        return res.status(200).json({ 
            jsonrpc: "2.0",
            id: id || null,
            error: { code: -32600, message: "Invalid or malformed JSON-RPC 2.0 request." }
        });
    }

    // Check 2: Method (Skill) existence check
    const supportedSkill = agentJson.skills.find(skill => skill.id === method);
    if (!supportedSkill) {
        // HNG Fix: Use HTTP 200 with JSON-RPC error code -32601
        return res.status(200).json({
            jsonrpc: "2.0",
            id: id,
            error: { code: -32601, message: `Method not found: ${method}` }
        });
    }

    // --- Skill Execution ---

    if (method === 'album_review_synthesizer') {
        try {
            const input = params.text;
            
            // Regex to extract Album and Artist
            const match = input.match(/review\s+(.*?)\s+by\s+(.*)/i);
            
            if (!match) {
                // HNG Fix: Use HTTP 200 with Application Error (-32000)
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

            console.log(`Starting process for Album: ${album}, Artist: ${artist}`);
            
            // STEP 1: Scrape Reviews
            const reviews = await scrapeReviews(album, artist);
            console.log(`Successfully scraped ${reviews.length} review snippet(s).`);

            // STEP 2: Synthesize Consensus using Gemini
            const consensus = await synthesizeConsensus(album, artist, reviews);

            // Return the successful JSON-RPC response
            return res.status(200).json({
                jsonrpc: "2.0",
                id: id,
                result: consensus // The Markdown string generated by Gemini
            });

        } catch (error) {
            console.error("Agent Execution Error:", error.message);
            
            // HNG Fix: Use HTTP 200 with Internal Server Error (-32603)
            return res.status(200).json({
                jsonrpc: "2.0",
                id: id,
                error: {
                    code: -32603,
                    message: `Internal server error during skill execution. Reason: ${error.message}`
                }
            });
        }
    }
});

// 5. Start Server
app.listen(PORT, () => {
    console.log(`SonicCritic Agent listening on port ${PORT}`);
    console.log(`Base URL is: ${AGENT_BASE_URL}`);
});