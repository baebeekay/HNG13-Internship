# 🎵 SonicCritic Album Review Agent

**An intelligent AI agent that scrapes the web, retrieves the top 5 album reviews, and uses Google Gemini to synthesize a critical consensus.**



## 🚀 Features

| Feature | Description |
|-------|-----------|
| **A2A Integration** | Fully compliant with Telex.im via `/.well-known/agent.json` and `/a2a/agent` |
| **Web Scraping** | Uses `axios` + `cheerio` to extract real review content |
| **LLM Synthesis** | Google Gemini (`gemini-2.5-flash`) analyzes and summarizes each review |
| **Parallel Processing** | Scrapes and synthesizes 5 reviews concurrently |
| **Health Check** | `/healthz` endpoint for deployment verification |
| **Error Resilience** | Graceful fallbacks for scraping, LLM, and parsing errors |

---

## 🏗️ Project Architecture

| Component | Responsibility | Tech |
|--------|----------------|------|
| `/.well-known/agent.json` | Public agent card for Telex.im discovery | Static JSON |
| `/a2a/agent` | Main skill endpoint (receives messages) | Express.js |
| `/healthz` | Readiness probe | Express.js |
| **Web Scraper** | Finds & extracts review text | `axios`, `cheerio` |
| **LLM Orchestrator** | Synthesizes reviews into structured summaries | `@google/genai` |

