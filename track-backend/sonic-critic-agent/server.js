// server.js

// 1. Setup Dependencies and Imports
import express from 'express';
import bodyParser from 'body-parser';
import * as dotenv from 'dotenv';
// TEMPORARILY COMMENTING OUT COMPLEX EXTERNAL LIBRARIES FOR STABILITY TEST
// import axios from 'axios';
// import * as cheerio from 'cheerio';
// import { GoogleGenAI } from '@google/genai';

dotenv.config();

// 2. Configuration & Initialization
const app = express();
const PORT = process.env.PORT || 3000;
const AGENT_BASE_URL = process.env.AGENT_BASE_URL;

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
// 🛑 WARNING: Functions are defined but not called in this test version.
// They will be re-enabled after testing.

async function scrapeReviews(album, artist) { /* ... original code here ... */ }
async function synthesizeConsensus(album, artist, reviews) { /* ... original code here ... */ }


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

    // ... (A2A Protocol Validation as before) ...
    // Note: This part handles the initial A2A protocol structure checks correctly.

    // Check 1: Basic JSON-RPC structure check
    if (jsonrpc !== '2.0' || !method || !id || !params) {
        return res.status(200).json({ 
            jsonrpc: "2.0",
            id: id || null,
            error: { code: -32600, message: "Invalid or malformed JSON-RPC 2.0 request." }
        });
    }

    // Check 2: Method (Skill) existence check
    const supportedSkill = agentJson.skills.find(skill => skill.id === method);
    if (!supportedSkill) {
        return res.status(200).json({
            jsonrpc: "2.0",
            id: id,
            error: { code: -32601, message: `Method not found: ${method}` }
        });
    }

    // --- Skill Execution (STABILITY TEST VERSION) ---

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

            console.log(`[DEBUG LOG] Received valid request for Album: ${album}, Artist: ${artist}. Returning MOCK data.`);
            
            // 🛑 MOCK DATA RESPONSE - THIS REPLACES THE COMPLEX LOGIC
            const mockResponse = `
**🎵 SonicCritic Agent - STABILITY TEST SUCCESS! 🎵**
\nI successfully parsed your request for "${album}" by ${artist}. 
\nThe issue is NOT in the A2A protocol or basic routing. 
\nNext, we will re-enable the complex web scraping and Gemini logic.
`;

            // Return the successful JSON-RPC response
            return res.status(200).json({
                jsonrpc: "2.0",
                id: id,
                result: mockResponse 
            });

        } catch (error) {
            console.error("Agent Execution Error:", error.message);
            // Handling internal server error
            return res.status(200).json({
                jsonrpc: "2.0",
                id: id,
                error: { code: -32603, message: `Internal server error during skill execution: ${error.message}` }
            });
        }
    }
});

// 5. Start Server
app.listen(PORT, () => {
    console.log(`SonicCritic Agent listening on port ${PORT}`);
    console.log(`Base URL is: ${AGENT_BASE_URL}`);
});