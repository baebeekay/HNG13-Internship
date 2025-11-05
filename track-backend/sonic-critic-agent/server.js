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

// --- STEP 1: Hardened Gemini Initialization ---
let ai;
let geminiClientError = null;

try {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY environment variable is not set.");
    }
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    console.log("[INIT DEBUG] Gemini client initialized successfully.");
} catch (error) {
    geminiClientError = error.message;
    console.error(`[INIT FATAL] Failed to initialize Gemini client: ${error.message}`);
}
const model = 'gemini-2.5-flash'; 
// ---------------------------------------------

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
// (scrapeReviews and synthesizeConsensus functions remain unchanged from the previous robust version)

async function scrapeReviews(album, artist) {
    console.log(`[SCRAPER DEBUG] Starting scraping for: ${album} by ${artist}`); 

    const searchQuery = `${album} ${artist} album review`;
    const url = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
    
    try {
        console.log(`[SCRAPER DEBUG] Attempting to fetch URL: ${url}`); 
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 10000
        });

        console.log(`[SCRAPER DEBUG] Successfully fetched response. Status: ${response.status}`); 
        const $ = cheerio.load(response.data);
        const scrapedTexts = [];

        $('div.g:lt(4) .VwiC3b, div.g:lt(4) .st, div.g:lt(4) .Uroaid').each((i, element) => {
            const snippet = $(element).text();
            if (snippet && snippet.length > 50) {
                const title = $(element).closest('.g').find('h3').text();
                scrapedTexts.push(`Source Title: ${title || 'Unknown'}\nSnippet: ${snippet}`);
            }
        });

        console.log(`[SCRAPER DEBUG] Found ${scrapedTexts.length} snippets.`); 
        if (scrapedTexts.length === 0) {
            throw new Error("Could not find enough substantial review snippets to synthesize.");
        }
        return scrapedTexts;
    } catch (error) {
        const errorMessage = error.code ? `${error.code}: ${error.message}` : error.message;
        console.error(`[SCRAPER ERROR] Web scraping failed: ${errorMessage}`);
        throw new Error(`Web scraping failed (Network/Scrape Error): ${errorMessage}`);
    }
}

async function synthesizeConsensus(album, artist, reviews) {
    console.log(`[GEMINI DEBUG] Starting synthesis.`); 
    const reviewBlock = reviews.join('\n\n====================\n\n');
    
    const prompt = `
        You are SonicCritic, an expert music journalist. Your task is to receive multiple raw, scraped text inputs from different Google search result snippets for the album "${album}" by "${artist}".
        Analyze all provided texts. Write a cohesive, overall **Critical Consensus** in rich Markdown.
        
        ... (omitted prompt details for brevity) ...

        ${reviewBlock}
    `;

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
        });
        
        console.log(`[GEMINI DEBUG] Synthesis complete.`); 
        return response.text;
    } catch (error) {
        console.error(`[GEMINI ERROR] Synthesis failed: ${error.message}`);
        throw new Error(`AI Synthesis failed (Gemini Error): ${error.message}`);
    }
}


// 4. A2A Required Endpoints

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

    // --- STEP 2: Global Initialization Error Check ---
    if (geminiClientError) {
        console.error(`[A2A ERROR] Blocking request due to fatal init error.`);
        return res.status(200).json({
            jsonrpc: "2.0",
            id: id || null,
            error: { 
                code: -32603, 
                message: `Server initialization failed. Check logs for GEMINI_API_KEY issue. Reason: ${geminiClientError}` 
            }
        });
    }
    // ---------------------------------------------------

    // --- A2A Protocol Validation ---
    if (jsonrpc !== '2.0' || !method || !id || !params) {
        return res.status(200).json({ 
            jsonrpc: "2.0",
            id: id || null,
            error: { code: -32600, message: "Invalid or malformed JSON-RPC 2.0 request." }
        });
    }

    const supportedSkill = agentJson.skills.find(skill => skill.id === method);
    if (!supportedSkill) {
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
            const match = input.match(/review\s+(.*?)\s+by\s+(.*)/i);
            
            if (!match) {
                return res.status(200).json({
                    jsonrpc: "2.0",
                    id: id,
                    error: { code: -32000, message: "Invalid command format. Please use: Review [Album Name] by [Artist Name]." }
                });
            }

            const album = match[1].trim();
            const artist = match[2].trim();

            console.log(`\n--- New Request: ${album} by ${artist} ---`);
            
            // STEP 1: Scrape Reviews
            const reviews = await scrapeReviews(album, artist);
            
            // STEP 2: Synthesize Consensus using Gemini
            const consensus = await synthesizeConsensus(album, artist, reviews);

            // Return the successful JSON-RPC response
            console.log("--- Request Complete (Success) ---\n");
            return res.status(200).json({
                jsonrpc: "2.0",
                id: id,
                result: consensus
            });

        } catch (error) {
            console.error("Agent Execution Failed:", error.message);
            
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