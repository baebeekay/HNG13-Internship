// server.js

import express from 'express';
import bodyParser from 'body-parser';
import * as dotenv from 'dotenv';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { GoogleGenAI } from '@google/genai';
import rateLimit from 'express-rate-limit';

dotenv.config();

// === CONFIG ===
const app = express();
const PORT = process.env.PORT || 3000;
const AGENT_BASE_URL = process.env.AGENT_BASE_URL || 'https://hng13-internship-production.up.railway.app';

// Gemini Init
let ai;
let geminiClientError = null;
try {
    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing");
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    console.log("[INIT] Gemini initialized");
} catch (e) {
    geminiClientError = e.message;
    console.error("[INIT FATAL]", e.message);
}
const model = 'gemini-1.5-flash';

// Middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use('/a2a/agent', rateLimit({ windowMs: 60_000, max: 15 }));

// === AGENT CARD ===
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

// === SCRAPING ===
async function scrapeReviews(album, artist) {
    console.log(`[SCRAPER] Searching: "${album}" by "${artist}"`);
    const query = `${album} ${artist} album review`;
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // ← INCREASED TO 15s

    try {
        const { data } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            signal: controller.signal
        });
        clearTimeout(timeout);

        const $ = cheerio.load(data);
        const texts = [];
        $('div.g').slice(0, 6).each((i, el) => {
            const snippet = $(el).find('.VwiC3b, .st').first().text().trim();
            const title = $(el).find('h3').text() || 'Review';
            if (snippet.length > 60) {
                texts.push(`Source: ${title}\nSnippet: ${snippet}`);
            }
        });

        if (texts.length === 0) throw new Error("No review snippets found");
        return texts;
    } catch (e) {
        clearTimeout(timeout);
        throw new Error("Scraping failed or timed out");
    }
}

// === AI SYNTHESIS (UPDATED PROMPT) ===
async function synthesizeConsensus(album, artist, reviews) {
    const block = reviews.map(r => r.replace(/`/g, '\\`')).join('\n\n---\n\n');

    const prompt = `
You are SonicCritic. Synthesize reviews for "${album}" by "${artist}" into a **Critical Consensus** in Markdown.
- Keep the total output to a maximum of 300 words.
- Structure: Short Rating (e.g., 8.5/10), Main Praises, Main Criticisms, Summary Verdict.
- Do NOT include any source texts in the final output.

${block}
`;

    const res = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: prompt }] }]
    });
    return res.text?.trim() || "No consensus generated.";
}

// === DEBUG ENDPOINTS ===
app.get('/debug', (req, res) => res.json({
    status: "OK",
    gemini: { ready: !geminiClientError, error: geminiClientError },
    env: { AGENT_BASE_URL, hasGeminiKey: !!process.env.GEMINI_API_KEY },
    timestamp: new Date().toISOString()
}));

app.get('/ping', (req, res) => res.send('pong'));
app.get('/healthz', (req, res) => res.send('OK'));

// === AGENT DISCOVERY (ANY SUB-PATH) ===
app.get(/\.well-known\/agent\.json$/, (req, res) => {
    console.log("[DISCOVERY] Served from:", req.originalUrl);
    res.json(agentJson);
});

// === A2A ENDPOINT ===
app.post('/a2a/agent', async (req, res) => {
    const { jsonrpc = "2.0", id, method, params } = req.body;

    if (geminiClientError) {
        return res.json({ jsonrpc, id, error: { code: -32603, message: geminiClientError } });
    }

    if (method !== 'album_review_synthesizer' || !params?.text) {
        return res.json({ jsonrpc, id, error: { code: -32601, message: "Invalid method or missing text" } });
    }

    try {
        const result = await Promise.race([
            (async () => {
                const input = params.text.trim();

                // Flexible parsing
                const match = input.match(/(?:review|reviews?|consensus)[\s#0-9B]*\s*(.+?)(?:\s+(?:by|of|from)\s+(.+))?$/i);
                if (!match) throw new Error("Use: 'Review [Album] by [Artist]'");

                let album = match[1].trim();
                let artist = (match[2] || '').trim();

                if (!artist && album) {
                    const parts = album.split(/\s+/);
                    if (parts.length > 1) {
                        artist = parts.pop();
                        album = parts.join(' ');
                    }
                }

                if (!album || !artist) throw new Error("Could not extract album/artist");

                console.log(`[PARSE] Album: "${album}" | Artist: "${artist}"`);

                const reviews = await scrapeReviews(album, artist);
                const consensus = await synthesizeConsensus(album, artist, reviews);
                return consensus;
            })(),

            new Promise((_, rej) => setTimeout(() => rej(new Error("Request timed out")), 25000))
        ]);

        res.json({ jsonrpc, id, result });
    } catch (e) {
        console.error("[A2A ERROR]", e.message);
        res.json({ jsonrpc, id, error: { code: -32000, message: e.message } });
    }
});

// === START ===
app.listen(PORT, () => {
    console.log(`\nSonicCritic Agent LIVE`);
    console.log(`URL: ${AGENT_BASE_URL}/a2a/agent`);
    console.log(`Discovery: ${AGENT_BASE_URL}/[any-path]/.well-known/agent.json`);
    console.log(`telex.im: https://telex.im/ai-coworkers/soniccritic-0bc5e3dfc0e9\n`);
});