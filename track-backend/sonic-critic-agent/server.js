const express = require('express');
const bodyParser = require('body-parser');
const { GoogleGenAI } = require('@google/genai');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config(); // Load environment variables from .env

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Google Gemini
const ai = new GoogleGenAI(process.env.GEMINI_API_KEY);
const MODEL_NAME = 'gemini-2.5-flash';

// Middleware
app.use(bodyParser.json());

// --- 1. A2A DISCOVERY: /.well-known/agent.json (GET) ---
const agentJson = {
    "name": "SonicCritic Agent",
    "description": "Synthesizes top 5 album reviews into critical consensus using Google Gemini.",
    "url": process.env.AGENT_BASE_URL + "/a2a/agent", // Ensure AGENT_BASE_URL is set in .env
    "skills": [
        {
            "id": "album_review_synthesizer",
            "name": "Album Review Synthesizer",
            "description": "Takes an album and artist and returns a synthesized critical consensus."
        }
    ]
};

app.get('/.well-known/agent.json', (req, res) => {
    // Note: Always use the correct MIME type for JSON files
    res.setHeader('Content-Type', 'application/json');
    res.json(agentJson);
});


// --- 2. RELIABILITY: /healthz (GET) ---
// Simple endpoint to confirm the server is running.
app.get('/healthz', (req, res) => {
    res.status(200).send('OK');
});


// --- 3. CORE LOGIC FUNCTION ---
/**
 * Main function to run the SonicCritic workflow (Scrape -> Gemini -> Synthesize).
 * @param {string} messageText - The raw user message (e.g., "Review OK Computer by Radiohead").
 * @returns {Promise<string>} - The final, formatted Markdown review.
 */
async function runSonicCritic(messageText) {
    // --- 3.1. Parsing (Extract Album and Artist) ---
    const match = messageText.match(/review\s+(.*?)\s+by\s+(.*)/i);
    if (!match) {
        return "⚠️ Error: Could not parse album and artist. Please use the format: `Review [Album] by [Artist]`";
    }
    const album = match[1].trim();
    const artist = match[2].trim();
    
    // --- 3.2. Data Acquisition (Placeholder for Scraping) ---
    // NOTE: In a real deployment, you would replace this with live scraping and search.
    const mockReviews = [
        { url: "https://pitchfork.com/mock-review-1", text: `Review text for ${album} by ${artist} is great, score 9.0/10...` },
        { url: "https://rollingstone.com/mock-review-2", text: `Review text for ${album} by ${artist} is amazing, score 4.5/5...` },
    ];
    
    // --- 3.3. LLM Synthesis (Placeholder) ---
    const summaries = await Promise.all(mockReviews.map(async (review) => {
        // --- This is where the actual Gemini call goes ---
        // For simplicity, we return a mock summary here:
        return `
**Review Source:** ${review.url}
- **Core Argument:** A bold, emotional, and highly dynamic work that redefines the genre.
- **Score:** 8.8/10
`;
    }));

    // --- 3.4. Final Compilation ---
    const finalSynthesis = summaries.join('\n---\n');
    return `
**🎵 SonicCritic Consensus for "${album}" by ${artist} 🎵**

Found 2 review sources. Starting synthesis...

${finalSynthesis}

---
**Final Summary**
Consensus: **Highly Acclaimed** (Avg ~8.8/10) — This album is a creative masterpiece that will endure for decades.
`;
}


// --- 4. A2A MESSAGING: /a2a/agent (POST) ---
// THIS FIXES THE "CANNOT GET" ERROR. A2A uses POST, not GET.
app.post('/a2a/agent', async (req, res) => {
    const payload = req.body;
    
    // 4.1. Basic JSON-RPC Validation
    if (!payload || payload.jsonrpc !== '2.0' || !payload.id || !payload.params || !payload.params.text) {
        return res.status(400).json({
            jsonrpc: '2.0',
            id: payload.id || null,
            error: {
                code: -32600,
                message: "Invalid or malformed JSON-RPC 2.0 request."
            }
        });
    }

    try {
        const userMessage = payload.params.text;
        
        // Ensure it's the right skill being called
        if (payload.method !== 'album_review_synthesizer') {
            throw new Error(`Unknown method: ${payload.method}`);
        }
        
    
        const finalResponseMarkdown = await runSonicCritic(userMessage);

        
        return res.json({
            jsonrpc: '2.0',
            id: payload.id, 
            result: {
                output_mode: 'text',
                text: finalResponseMarkdown 
            }
        });

    } catch (error) {
        console.error("Agent Processing Error:", error.message);
        
        // 4.4. Send A2A Compliant Error Response
        return res.status(500).json({
            jsonrpc: '2.0',
            id: payload.id,
            error: {
                code: -32603, // Internal Error Code
                message: `SonicCritic failed: ${error.message || 'An unknown processing error occurred.'}`
            }
        });
    }
});


// Start Server
app.listen(PORT, () => {
    console.log(`SonicCritic agent is listening on port ${PORT}`);
    console.log(`Discovery: http://localhost:${PORT}/.well-known/agent.json`);
    console.log(`Health: http://localhost:${PORT}/healthz`);
    console.log(`Messaging: http://localhost:${PORT}/a2a/agent (POST)`);
});
