import express from 'express';
import bodyParser from 'body-parser';
import * as dotenv from 'dotenv';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { GoogleGenAI } from '@google/genai';
import rateLimit from 'express-rate-limit';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const AGENT_BASE_URL = process.env.AGENT_BASE_URL || 'https://hng13-internship-production.up.railway.app';
const cache = new Map();

let ai;
let geminiClientError = null;
try {
    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing");
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
} catch (e) {
    geminiClientError = e.message;
}
const model = 'gemini-1.5-flash';

app.use(bodyParser.json({ limit: '10mb' }));
app.use('/a2a/agent', rateLimit({ windowMs: 60_000, max: 15 }));

const agentJson = {
    "name": "SonicCritic Agent",
    "description": "Instant album reviews — like SafeLink for music.",
    "url": `${AGENT_BASE_URL}/a2a/agent`,
    "skills": [{
        "id": "album_review_synthesizer",
        "name": "Review",
        "description": "@SonicCritic Review [Album] by [Artist]"
    }]
};

async function scrapeReviews(album, artist) {
    const cacheKey = `scrape:${album.toLowerCase()}:${artist.toLowerCase()}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const query = `${album} ${artist} album review`;
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
        const { data } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            signal: controller.signal
        });
        clearTimeout(timeout);

        const $ = cheerio.load(data);
        const snippets = [];
        $('div.g').slice(0, 5).each((i, el) => {
            const text = $(el).find('.VwiC3b, .st').first().text().trim();
            if (text.length > 60) snippets.push(text);
        });

        if (snippets.length === 0) throw new Error("No reviews found");
        cache.set(cacheKey, snippets);
        return snippets;
    } catch (e) {
        clearTimeout(timeout);
        throw new Error("Scraping failed");
    }
}

async function synthesizeConsensus(album, artist, reviews) {
    const block = reviews.slice(0, 3).join('\n\n---\n\n');
    const prompt = `
SonicCritic: "${album}" by "${artist}" — 1-sentence verdict + X.X/10 rating. 3 praises, 2 criticisms. Max 120 words. No sources.

${block}
`;

    const res = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: prompt }] }]
    });
    return res.text?.trim() || "No verdict.";
}

app.get('/ping', (req, res) => res.send('pong'));
app.get('/healthz', (req, res) => res.send('OK'));
app.get('/debug', (req, res) => res.json({
    status: "OK",
    gemini: { ready: !geminiClientError },
    cacheSize: cache.size,
    timestamp: new Date().toISOString()
}));

app.get(/\.well-known\/agent\.json$/, (req, res) => res.json(agentJson));

app.post('/a2a/agent', async (req, res) => {
    const { jsonrpc = "2.0", id, method, params } = req.body;

    if (geminiClientError) {
        return res.json({ jsonrpc, id, error: { code: -32603, message: geminiClientError } });
    }

    if (method !== 'album_review_synthesizer' || !params?.text) {
        return res.json({ jsonrpc, id, error: { code: -32601, message: "Invalid" } });
    }

    try {
        const result = await Promise.race([
            (async () => {
                const input = params.text.replace(/^@?SonicCritic\s*/i, '').trim();
                const match = input.match(/(?:review|reviews?)[\s#0-9B]*\s*(.+?)(?:\s+(?:by|of)\s+(.+))?$/i);
                if (!match) throw new Error("Use: Review [Album] by [Artist]");

                let album = match[1].trim();
                let artist = (match[2] || '').trim();
                if (!artist && album) {
                    const parts = album.split(/\s+/);
                    if (parts.length > 1) { artist = parts.pop(); album = parts.join(' '); }
                }

                if (!album || !artist) throw new Error("Parse failed");

                const cacheKey = `${album.toLowerCase()}:${artist.toLowerCase()}`;
                if (cache.has(cacheKey)) return cache.get(cacheKey);

                const reviews = await scrapeReviews(album, artist);
                const consensus = await synthesizeConsensus(album, artist, reviews);

                cache.set(cacheKey, consensus);
                return consensus;
            })(),

            new Promise((_, rej) => setTimeout(() => rej(new Error("Timed out")), 25000))
        ]);

        res.json({ jsonrpc, id, result });
    } catch (e) {
        res.json({ jsonrpc, id, error: { code: -32000, message: e.message } });
    }
});

app.listen(PORT, () => {
    console.log(`SonicCritic LIVE: ${AGENT_BASE_URL}/a2a/agent`);
});