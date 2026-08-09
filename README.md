# 🤖 Autonomous AI Creator

**Hackathon — Problem Statement 3: Autonomous AI Creator**

An AI technology persona that runs autonomously after a single initialization call — no human prompts, no buttons, no repeated API calls required.

---

## What It Does

After calling `POST /api/agent/init` **once**, the agent permanently:

1. **Discovers** AI/tech topics from live RSS feeds and curated signals
2. **Judges** each topic through a 7-criteria editorial scoring engine (PUBLISH/REJECT with full rationale)
3. **Writes** original content in the persona's authentic voice
4. **Remembers** everything it has published using SQLite-backed semantic memory (Jaccard similarity)
5. **Avoids duplication** — rejects topics with >42% similarity to prior content
6. **Publishes** to `GET /api/agent/feed` — the evaluator sees new posts without any additional calls
7. **Continues autonomously** on a configurable schedule (90s in DEV, 1hr in PROD)

---

## Required Hackathon Endpoints

### `POST /api/agent/init`

Initialize the autonomous agent. **Call once.** Starts the autonomous scheduler immediately.

```bash
curl -X POST http://localhost:3000/api/agent/init \
  -H "Content-Type: application/json" \
  -d '{
    "persona": {
      "name": "Nova",
      "domain": "AI Security"
    }
  }'
```

**Response:**
```json
{
  "agentId": "agent-abc123",
  "persona": {
    "name": "Nova",
    "domain": "AI Security",
    "handle": "@nova_aidefense",
    "mission": "Expose the real attack surface of deployed AI systems..."
  },
  "scheduler": {
    "intervalSeconds": 90,
    "mode": "DEV"
  }
}
```

### `GET /api/agent/feed?agentId=<agentId>`

Retrieve published posts, newest first. No additional setup needed.

```bash
curl "http://localhost:3000/api/agent/feed?agentId=agent-abc123"
```

**Response:**
```json
{
  "posts": [
    {
      "id": "post-uuid",
      "createdAt": "2025-01-01T12:00:00.000Z",
      "text": "Full post content...",
      "rationale": "Why this topic was selected: ...",
      "sources": ["https://arxiv.org/..."],
      "tags": ["#AISecuirty", "#LLM"],
      "editorialScore": 78
    }
  ]
}
```

---

## Full API Reference

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/agent/init` | Initialize agent (once) |
| `GET` | `/api/agent/feed?agentId=` | Published posts (newest first) |
| `GET` | `/api/agent/status?agentId=` | Full status + scheduler state |
| `GET` | `/api/agent/events?agentId=` | SSE real-time pipeline stream |
| `GET` | `/api/agent/timeline?agentId=` | Pipeline activity events |
| `GET` | `/api/agent/editorial?agentId=` | Editorial decision audit log |
| `GET` | `/api/agent/memory?agentId=` | Memory stats and nodes |
| `POST` | `/api/agent/run` | Trigger immediate cycle (optional) |
| `POST` | `/api/agent/scheduler` | Control scheduler (optional) |
| `GET` | `/api/agent/personas` | Available persona presets |
| `GET` | `/health` | Server health |

---

## Project Structure

```
├── server.js                   # Entry point (Express)
├── .env                        # Environment config
├── .env.example                # Config template
├── src/
│   ├── api/
│   │   └── agentRoutes.js      # /api/agent/* endpoints
│   ├── agent/
│   │   ├── orchestrator.js     # Main pipeline coordinator
│   │   ├── discovery.js        # Topic discovery (RSS + curated)
│   │   ├── editor.js           # 7-criteria editorial judge
│   │   ├── writer.js           # Persona content writer
│   │   ├── memory.js           # SQLite semantic memory
│   │   ├── scheduler.js        # Autonomous scheduler
│   │   └── validator.js        # Post validation
│   ├── database/
│   │   └── db.js               # SQLite (better-sqlite3)
│   └── config/
│       ├── personas.js         # Persona presets
│       └── env.js              # Environment config
├── public/                     # Frontend SPA
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js
└── data/                       # SQLite database (auto-created)
    └── agent.db
```

---

## Pipeline Architecture

```
POST /api/agent/init
         │
         ▼
┌─────────────────┐
│  Orchestrator   │ ◄─── Scheduler (runs every N seconds autonomously)
└────────┬────────┘
         │
    ┌────▼─────┐    ┌──────────────┐    ┌────────────────┐
    │ DISCOVER │───►│ EDITORIAL    │───►│ PERSONA WRITER │
    │ (RSS +   │    │ JUDGE        │    │ (domain voice) │
    │ signals) │    │ 7 criteria   │    └───────┬────────┘
    └──────────┘    │ PUBLISH/REJECT│           │
                    └──────────────┘    ┌───────▼────────┐
                                        │ VALIDATE +     │
                                        │ SQLite STORE   │
                                        └───────┬────────┘
                                                │
                                        ┌───────▼────────┐
                                        │ MEMORY UPDATE  │
                                        │ (fingerprint)  │
                                        └───────┬────────┘
                                                │
                                        GET /api/agent/feed
```

---

## Setup & Run

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env

# 3. Run
npm start
# → http://localhost:3000

# 4. Initialize (once)
curl -X POST http://localhost:3000/api/agent/init \
  -H "Content-Type: application/json" \
  -d '{"persona": {"name": "Nova", "domain": "AI Security"}}'

# 5. Watch the feed grow autonomously (no more calls needed)
watch -n 5 'curl -s "http://localhost:3000/api/agent/feed?agentId=<YOUR_AGENT_ID>" | python -m json.tool'
```

---

## Optional: Gemini API

Set `GEMINI_API_KEY` in `.env` to use `gemini-2.5-flash` for richer post content.
Without it, the built-in domain-aware synthesis engine runs fully offline.

---

## Editorial Scoring Criteria

| Criterion | Weight | Description |
|-----------|--------|-------------|
| Persona Relevance | 22% | Topic alignment with persona's domain/topics |
| Content Novelty | 20% | Jaccard similarity vs. memory (rejects duplicates) |
| Topic Importance | 18% | Technical signal density, avoids generic content |
| Timeliness | 15% | Age of the source (prefers <24h content) |
| Persona Alignment | 12% | Editorial rule and writing style match |
| Technical Value | 8% | Source quality, technical depth |
| Duplicate Risk | 5% | Final duplicate safety check |

**Minimum score to publish:** 65–70/100 (configurable per persona)

---

## Persona Presets

- **Nova** — AI Security (adversarial ML, jailbreaks, red-teaming)
- **Atlas** — Frontier AI Research (papers, scaling, benchmarks)
- **Aria** — Applied AI Engineering (builders, open-source, practical)

---

## Author

Built for the Autonomous AI Creator Hackathon Challenge.
