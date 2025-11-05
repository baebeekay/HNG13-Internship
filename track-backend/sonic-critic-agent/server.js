// server.js

// 1. Setup Dependencies and Imports
import express from 'express';
import bodyParser from 'body-parser';
import * as dotenv from 'dotenv';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { GoogleGenAI } from '@google/genai';
import rateLimit from 'express-rate-limit';
import { GoogleSearch } from 'google-search-results-nodejs';

dotenv.config();

// 2. Configuration & Initialization
const app = express();
const PORT = process.env.PORT || 3000;
const AGENT_BASE_URL = process.env.AGENT_BASE_URL || `http://localhost:${PORT}`;

// --- Hardened Gemini Initialization ---
let ai;
let geminiClientError = null;

try {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY environment variable is not set.");
    }
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    console.log("[INIT] Gemini client initialized successfully.");
} catch (error) {
    geminiClientError = error.message;
    console.error(`[INIT FATAL] Failed to initialize Gemini client: ${error.message}`);
}

const model = 'gemini-1.5-flash'; // Updated to stable version

// SerpAPI Client (fallback)
const serp = process.env.SERPAPI_KEY ? new GoogleSearch(process.env.SERPAPI_KEY) : null;

// Middleware
app.use(bodyParser.json({ limit: '10mb' }));

// Rate Limiting: 15 requests per minute per IP
const limiter = rateLimit({
    windowMs: 60_000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." }
});
app.use('/a2a/agent', limiter);

// 3. Agent Configuration
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

// --- CORE LOGIC: SCRAPING (SerpAPI + Google Fallback) ---
async function scrapeReviews(album, artist) {
    console.log(`[SCRAPER] Starting scrape for: "${album}" by "${artist}"`);

    const searchQuery = `${album} ${artist} album review`;

    // Prefer SerpAPI if available
    if (serp) {
        try {
            console.log(`[SCRAPER] Using SerpAPI...`);
            const result = await new Promise((resolve, reject) => {
                serp.json({ q: searchQuery, num: 6 }, (res) => {
                    if (res.error) reject(new Error(res.error));
                    else resolve(res);
                });
            });

            const snippets = result.organic_results
                ?.filter(r => r.snippet && r.snippet.length > 60)
                ?.slice(0, 5)
                ?.map(r => `Source: ${r.title}\nSnippet: ${r.snippet}`)
                || [];

            if (snippets.length >= 2) {
                console.log(`[SCRAPER] SerpAPI success: ${snippets.length} snippets`);
                return snippets;
            }
        } catch (e) {
            console.warn(`[SCRAPER] SerpAPI failed: ${e.message}, falling back...`);
        }
    }

    // Fallback: Direct Google HTML scrape
    console.log(`[SCRAPER] Falling back to direct Google scrape...`);
    const url = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);

        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            signal: controller.signal
        });

        clearTimeout(timeout);
        const $ = cheerio.load(response.data);
        const scrapedTexts = [];

        $('div.g:lt(5) .VwiC3b, div.g:lt(5) .st, div.g:lt(5) .Uroaid').each((i, el) => {
            const snippet = $(el).text().trim();
            if (snippet && snippet.length > 60) {
                const title = $(el).closest('.g').find('h3').text() || 'Unknown Source';
                scrapedTexts.push(`Source: ${title}\nSnippet: ${snippet}`);
            }
        });

        if (scrapedTexts.length === 0) throw new Error("No substantial snippets found");
        console.log(`[SCRAPER] Google scrape success: ${scrapedTexts.length} snippets`);
        return scrapedTexts;
    } catch (error) {
        console.error(`[SCRAPER ERROR] All methods failed: ${error.message}`);
        throw new Error("Review scraping failed. Try again later.");
    }
}

// --- AI SYNTHESIS ---
async function synthesizeConsensus(album, artist, reviews) {
    console.log(`[GEMINI] Synthesizing consensus...`);
    const reviewBlock = reviews.map(r => r.replace(/`/g, '\\`')).join('\n\n---\n\n');

    const prompt = `
You are SonicCritic, a world-class music critic. 
Synthesize the following review snippets for the album "${album}" by "${artist}" into a **Critical Consensus** in rich Markdown.

- Be objective, balanced, and professional.
- Include: Overall rating (e.g., 8.7/10), key praises, criticisms, and cultural impact.
- Use **bold**, *italics*, lists, and headers.
- 300–500 words max.
- Do NOT mention sources or scraping.

${reviewBlock}
`;

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
        });
        console.log(`[GEMINI] Synthesis complete.`);
        return response.text || "No consensus generated.";
    } catch (error) {
        console.error(`[GEMINI ERROR] ${error.message}`);
        throw new Error("AI synthesis failed. Please try again.");
    }
}

// --- DEBUG ENDPOINTS ---
app.get('/debug', (req, res) => {
    res.json({
        status: "OK",
        gemini: { ready: !geminiClientError, error: geminiClientError },
        env: {
            hasGeminiKey: !!process.env.GEMINI_API_KEY,
            hasSerpKey: !!process.env.SERPAPI_KEY,
            agentUrl: AGENT_BASE_URL,
            port: PORT
        },
        timestamp: new Date().toISOString()
    });
});

app.get('/test-timeout', async (req, res) => {
    console.log('[TEST] Starting 20-second delay...');
    await new Promise(r => setTimeout(r, 20000));
    res.send('Timeout test passed after 20s');
});

// --- A2A ENDPOINTS ---
app.get('/.well-known/agent.json', (req, res) => {
    res.json(agentJson);
});

app.get('/healthz', (req, res) => {
    res.status(200).send('OK');
});

app.post('/a2a/agent', async (req, res) => {
    const { jsonrpc, id, method, params } = req.body;

    // Global init check
    if (geminiClientError) {
        return res.status(200).json({
            jsonrpc: "2.0",
            id: id || null,
            error: { code: -32603, message: `Init failed: ${geminiClientError}` }
        });
    }

    // JSON-RPC validation
    if (jsonrpc !== '2.0' || !method || !id || !params?.text) {
        return res.status(200).json({
            jsonrpc: "2.0",
            id: id || null,
            error: { code: -32600, message: "Invalid JSON-RPC request." }
        });
    }

    if (method !== 'album_review_synthesizer') {
        return res.status(200).json({
            jsonrpc: "2.0",
            id,
            error: { code: -32601, message: `Method not found: ${method}` }
        });
    }

    // --- 25-SECOND HARD TIMEOUT ---
    try {
        const result = await Promise.race([
            (async () => {
                const input = params.text.trim();
                const match = input.match(/(?:review|reviews|consensus).*\s+([^\by]+)\s+by\s+(.+)/i);
                if (!match) {
                    throw new Error("Use: 'Review [Album] by [Artist]'");
                }

                const album = match[1].trim();
                const artist = match[2].trim();

                console.log(`\n=== REQUEST: "${album}" by "${artist}" ===`);
                const reviews = await scrapeReviews(album, artist);
                const consensus = await synthesizeConsensus(album, artist, reviews);
                console.log("=== SUCCESS ===\n");
                return consensus;
            })(),

            new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Request timed out after 25s")), 25000)
            )
        ]);

        return res.status(200).json({
            jsonrpc: "2.0",
            id,
            result
        });
    } catch (error) {
        console.error(`[A2A ERROR] ${error.message}`);
        return res.status(200).json({
            jsonrpc: "2.0",
            id,
            error: { code: -32603, message: error.message }
        });
    }
});

// 5. Start Server
app.listen(PORT, () => {
    console.log(`\nSonicCritic Agent RUNNING`);
    console.log(`Port: ${PORT}`);
    console.log(`Agent URL: ${AGENT_BASE_URL}/a2a/agent`);
    console.log(`Debug: ${AGENT_BASE_URL}/debug\n`);
});