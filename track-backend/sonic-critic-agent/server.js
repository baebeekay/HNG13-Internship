const express = require('express');
const bodyParser = require('body-parser');
const { GoogleGenAI } = require('@google/genai');




const app = express();
// Ensure PORT is set by the environment (Railway)
const PORT = process.env.PORT || 3000; 

// Initialize Google Gemini
const ai = new GoogleGenAI(process.env.GEMINI_API_KEY);
const MODEL_NAME = 'gemini-2.5-flash';

// --- MIDDLEWARE ---
app.use(bodyParser.json()); 


// --- 1. A2A DISCOVERY: /.well-known/agent.json (GET) ---
const agentJson = {
    "name": "SonicCritic Agent",
    "description": "Synthesizes top 5 album reviews into critical consensus using Google Gemini.",
    "url": process.env.AGENT_BASE_URL + "/a2a/agent", 
    "skills": [
        {
            "id": "album_review_synthesizer",
            "name": "Album Review Synthesizer",
            "description": "Takes an album and artist and returns a synthesized critical consensus."
        }
    ]
};

app.get('/.well-known/agent.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.json(agentJson);
});


// --- 2. RELIABILITY: /healthz (GET) ---
app.get('/healthz', (req, res) => {
    res.status(200).send('OK');
});


// --- 3. CORE LOGIC FUNCTION ---
async function runSonicCritic(messageText) {
    const match = messageText.match(/review\s+(.*?)\s+by\s+(.*)/i);
    if (!match) {
        return "⚠️ Error: Could not parse album and artist. Please use the format: `Review [Album] by [Artist]`";
    }
    const album = match[1].trim();
    const artist = match[2].trim();
    
   
    const mockReviewText = `
        Source 1 says: The album ${album} by ${artist} is a masterpiece, score 9.5/10.
        Source 2 says: It's a challenging but rewarding listen, score 8.0/10.
        Source 3 says: Critics are calling it genre-defining, score 9/10.
    `;

    const systemPrompt = "You are SonicCritic, an expert music journalist. Your task is to synthesize the provided review text into a final, coherent critical summary in clean Markdown format.";
    
    const userPrompt = `
        ${systemPrompt}
        
        Synthesize the critical consensus for the album: **${album}** by **${artist}**.
        
        Analyze the following texts and generate a final verdict summarizing the overall sentiment and average score:
        
        --- REVIEW TEXTS ---
        ${mockReviewText}
        --- END ---
    `;
    
    try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: userPrompt, 
        });
        
        return response.text; 

    } catch (error) {
        console.error("Gemini API Error:", error);
        return `❌ **Synthesis Error:** I failed to contact the Gemini API to process the reviews. (Details: ${error.message})`;
    }
}


// --- 4. A2A MESSAGING: /a2a/agent (POST) ---
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
             return res.status(400).json({
                jsonrpc: '2.0',
                id: payload.id,
                error: { code: -32601, message: `Method not found: ${payload.method}` }
            });
        }
        
        // 4.2. Run the Core Logic
        const finalResponseMarkdown = await runSonicCritic(userMessage);

        // 4.3. Send A2A Compliant Success Response
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
                code: -32603,
                message: `SonicCritic failed due to an unhandled exception: ${error.message}`
            }
        });
    }
});


// --- START SERVER ---
app.listen(PORT, () => {
    console.log(`SonicCritic agent is listening on port ${PORT}`);
});
