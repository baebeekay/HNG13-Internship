// server.js

import express from 'express';
import bodyParser from 'body-parser';
import * as dotenv from 'dotenv';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { GoogleGenAI } from '@google/genai';
import rateLimit from 'express-rate-limit';
import { GoogleSearch } from 'google-search-results-nodejs';

dotenv.config();

// === CONFIG ===
const app = express();
const PORT = process.env.PORT || 3000;
const AGENT_BASE_URL = process.env.AGENT_BASE_URL || `http://localhost:${PORT}`;

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

// SerpAPI (optional)
const serp = process.env.SERPAPI_KEY ? new GoogleSearch(process.env.SERPAPI_KEY) : null;

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

// === SCRAPING (SerpAPI + Google Fallback) ===
async function scrapeReviews(album, artist) {
    console.log(`[SCRAPER] Searching: "${album}" by "${artist}"`);
    const query = `${album} ${artist} album review`;

    // Try SerpAPI
    if (serp) {
        try {
            const result = await new Promise((res, rej) => {
                serp.json({ q: query, num: 6 }, (r) => r.error ? rej(r.error) : res(r));
            });
            const snippets = result.organic_results
                ?.filter(r => r.snippet?.length > 60)
                ?.slice(0, 5)
                ?.map(r => `Source: ${r.title}\nSnippet: ${r.snippet}`);
            if (snippets?.length >= 2) return snippets;
        } catch (e) { console.warn("[SCRAPER] SerpAPI failed:", e.message); }
    }

    // Fallback: Google HTML
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
        const { data } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: controller.signal
        });
        clearTimeout(timeout);

        const $ = cheerio.load(data);
        const texts = [];
        $('div.g:lt(5) .VwiC3b, div.g:lt(5) .st').each((i, el) => {
            const txt = $(el).text().trim();
            if (txt.length > 60) {
                const title = $(el).closest('.g').find('h3').text() || 'Unknown';
                texts.push(`Source: ${title}\nSnippet: ${txt}`);
            }
        });
        if (texts.length === 0) throw new Error("No snippets");
        return texts;
    } catch (e) {
        throw new Error("Scraping failed");
    }
}

// === AI SYNTHESIS ===
async function synthesizeConsensus(album, artist, reviews) {
    const block = reviews.map(r => r.replace(/`/g, '\\`')).join('\n\n---\n\n');
    const prompt = `
You are SonicCritic. Synthesize reviews for "${album}" by "${artist}" into a **Critical Consensus** in Markdown.
- Rating: X.X/10
- Praises, Criticisms, Impact
- 300–500 words
- No source mentions

${block}
`;

    const res = await ai.models.generateContent({
        model, contents: [{ role: "user", parts: [{ text: prompt }] }]
    });
    return res.text || "No output";
}

// === DEBUG ENDPOINTS ===
app.get('/debug', (req, res) => res.json({
    status: "OK",
    gemini: { ready: !geminiClientError, error: geminiClientError },
    env: { hasGeminiKey: !!process.env.GEMINI_API_KEY, hasSerpKey: !!process.env.SERPAPI_KEY },
    url: AGENT_BASE_URL
}));

app.get('/test-timeout', async (req, res) => {
    await new Promise(r => setTimeout(r, 20000));
    res.send('OK');
});

// === A2A ENDPOINTS ===
app.get('/.well-known/agent.json', (req, res) => res.json(agentJson));
app.get('/healthz', (req, res) => res.send('OK'));

app.post('/a2a/agent', async (req, res) => {
    const { jsonrpc, id, method, params } = req.body;

    if (geminiClientError) {
        return res.json({ jsonrpc: "2.0", id, error: { code: -32603, message: geminiClientError } });
    }

    if (jsonrpc !== '2.0' || !method || !id || !params?.text) {
        return res.json({ jsonrpc: "2.0", id, error: { code: -32600, message: "Invalid request" } });
    }

    if (method !== 'album_review_synthesizer') {
        return res.json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
    }

    try {
        const result = await Promise.race([
            (async () => {
                const input = params.text.trim();

                // FLEXIBLE REGEX: Handles B #5, review, reviews, etc.
                const match = input.match(/(?:review|reviews|consensus|analyze)[\s#0-9B]*\s*(.+?)(?:\s+(?:by|from|of)\s+(.+))?$/i);
                if (!match) throw new Error("Use: 'Review [Album] by [Artist]'");

                let album = match[1].trim();
                let artist = (match[2] || '').trim();

                // Auto-detect if no "by"
                if (!artist && album) {
                    const parts = album.split(/\s+/);
                    artist = parts.pop();