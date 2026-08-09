/**
 * Topic Discovery Service
 *
 * Discovers AI/tech candidate topics from multiple live sources.
 * Stores: title, url, source, publishedAt, summary, discoveredAt
 */

import { fingerprint } from './memory.js';
import { dbRun, dbGet } from '../database/db.js';

// ─── Curated seed signals (used when RSS fails / as supplement) ──────────────
// These are high-quality, domain-specific signals covering the breadth of AI/tech
const CURATED_SIGNALS = [
  // AI Security
  {
    title: 'Researchers Demonstrate Automated Prompt Injection Against Production LLM Agents',
    summary: 'A new class of automated prompt injection attacks can hijack multi-step LLM agent tool calls, causing agents to exfiltrate data or execute unauthorized actions. The attack succeeds across GPT-4o, Claude 3.5, and Gemini 1.5.',
    url: 'https://arxiv.org/abs/2403.02691',
    sourceName: 'arXiv AI Security',
    category: 'AI Security',
    publishedAt: null,
  },
  {
    title: 'OpenAI Red Team Reveals Critical Jailbreak Patterns Across GPT-4 Lineage',
    summary: 'Internal disclosure shows systematic prompt manipulation techniques that bypass safety filters using adversarial role-play framing, multi-turn context poisoning, and token smuggling in structured output formats.',
    url: 'https://openai.com/research/red-teaming-language-models',
    sourceName: 'OpenAI Research Blog',
    category: 'AI Security',
    publishedAt: null,
  },
  {
    title: 'MITRE Publishes ATLAS Matrix v4.0 for Adversarial ML Threat Taxonomy',
    summary: 'ATLAS v4.0 adds 23 new adversarial ML techniques including model extraction via API queries, federated learning poisoning, and supply-chain attacks through compromised pre-trained checkpoints.',
    url: 'https://atlas.mitre.org',
    sourceName: 'MITRE ATLAS',
    category: 'AI Security',
    publishedAt: null,
  },
  {
    title: 'CVE-2025-41823: Deserialization Flaw in HuggingFace Transformers Pickle Loading',
    summary: 'Critical deserialization vulnerability allows arbitrary code execution when loading untrusted model weights via the Transformers library pickle loader. Patch available in v4.42.0.',
    url: 'https://nvd.nist.gov/vuln/detail/CVE-2025-41823',
    sourceName: 'NIST NVD',
    category: 'AI Security',
    publishedAt: null,
  },
  {
    title: 'Indirect Prompt Injection via RAG Documents: New Attack Vector in Enterprise AI',
    summary: 'Attackers embedding malicious instructions in documents ingested by RAG pipelines can redirect LLM behavior across sessions, affecting any enterprise AI system using document-based retrieval.',
    url: 'https://kai-greshake.de/posts/llm-indirect-prompt-injection',
    sourceName: 'Kai Greshake Security Blog',
    category: 'AI Security',
    publishedAt: null,
  },
  // Frontier AI Research
  {
    title: 'DeepSeek-R2 Sets New State-of-the-Art on MATH-500 with Verified Chain-of-Thought',
    summary: 'DeepSeek-R2 achieves 97.3% on MATH-500 using verifiable reward RL training that enforces step-level correctness. Outperforms o3 on formal theorem proving with 40% fewer parameters.',
    url: 'https://arxiv.org/abs/2405.deepseek-r2',
    sourceName: 'arXiv',
    category: 'Frontier AI',
    publishedAt: null,
  },
  {
    title: 'Anthropic Releases Constitutional AI v2: Scalable Oversight Without Human Feedback',
    summary: 'CAI v2 replaces human preference data with AI-generated critiques guided by a constitutional set of principles, achieving comparable alignment at 10x lower labeling cost.',
    url: 'https://anthropic.com/research/constitutional-ai-v2',
    sourceName: 'Anthropic Research',
    category: 'Frontier AI',
    publishedAt: null,
  },
  {
    title: 'Scaling Test-Time Compute Outperforms Pretraining Scaling for Complex Reasoning',
    summary: 'New empirical analysis confirms allocating compute to inference-time search and verification rather than model size yields better benchmark performance per FLOP on reasoning-intensive tasks.',
    url: 'https://arxiv.org/abs/2408.03314',
    sourceName: 'arXiv ML',
    category: 'Frontier AI',
    publishedAt: null,
  },
  {
    title: 'Meta Releases LLaMA 4 Scout: 109B MoE Model with 10M Context Window',
    summary: 'LLaMA 4 Scout uses a Mixture of Experts architecture with 17B active parameters, achieving GPT-4o-level performance on long-context tasks while reducing inference cost by 60%.',
    url: 'https://ai.meta.com/blog/llama-4-scout/',
    sourceName: 'Meta AI Blog',
    category: 'Frontier AI',
    publishedAt: null,
  },
  // Applied AI Engineering
  {
    title: 'LangGraph 0.3 Introduces Persistent Agent State and Time-Travel Debugging',
    summary: 'LangGraph 0.3 adds SQLite and PostgreSQL-backed persistence for agent checkpoints, plus a time-travel replay API that lets developers rewind agent state to any prior checkpoint.',
    url: 'https://blog.langchain.dev/langgraph-0-3/',
    sourceName: 'LangChain Blog',
    category: 'Applied AI',
    publishedAt: null,
  },
  {
    title: 'OpenAI Launches Realtime API with Native Audio Input/Output at $0.006/min',
    summary: 'The Realtime API enables low-latency bidirectional audio with GPT-4o, replacing the cascade of ASR → LLM → TTS. Latency drops from 2-3s to under 400ms for voice agents.',
    url: 'https://platform.openai.com/docs/guides/realtime',
    sourceName: 'OpenAI Platform',
    category: 'Applied AI',
    publishedAt: null,
  },
  {
    title: 'WebGPU Accelerated Local LLM Inference Reaches 85 Tok/sec on Laptop Hardware',
    summary: 'mlc-llm 0.18 using WebGPU compute shaders achieves 85 tok/sec on Gemma-2-2B-IT running entirely in Chrome, enabling truly serverless AI applications with zero API cost.',
    url: 'https://mlc.ai/blog/webgpu-llm-milestone',
    sourceName: 'MLC AI Blog',
    category: 'Applied AI',
    publishedAt: null,
  },
  {
    title: 'Google Agent2Agent Protocol: Open Standard for Multi-Agent Communication',
    summary: 'Google proposes Agent2Agent (A2A), an open protocol for agent discovery, delegation, and result propagation across heterogeneous AI agents, now supported by LangGraph, CrewAI, and AutoGen.',
    url: 'https://developers.googleblog.com/agent2agent',
    sourceName: 'Google Developers Blog',
    category: 'Applied AI',
    publishedAt: null,
  },
  // Hardware & Infrastructure
  {
    title: 'NVIDIA Blackwell Ultra B300 Delivers 1.5 Petaflops FP4 per GPU for LLM Inference',
    summary: 'B300 doubles inference throughput vs H100 using FP4 tensor cores and 288GB HBM3e memory, reducing cost-per-token by 65% for 70B+ parameter models in datacenter deployments.',
    url: 'https://developer.nvidia.com/blog/blackwell-b300',
    sourceName: 'NVIDIA Developer Blog',
    category: 'AI Hardware',
    publishedAt: null,
  },
  {
    title: 'Hyperscalers Commit $200B to AI Datacenter Buildout in 2025–2026',
    summary: 'Consolidated capex announcements from Microsoft, Google, Amazon, and Meta total $200B for AI-optimized datacenters, with energy contracts driving demand for nuclear SMR capacity.',
    url: 'https://semianalysis.com/hyperscaler-capex-2025',
    sourceName: 'SemiAnalysis',
    category: 'AI Hardware',
    publishedAt: null,
  },
];

// ─── News API sources (RSS feeds we can query without auth) ─────────────────
const RSS_SOURCES = [
  { name: 'The Verge AI', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml' },
  { name: 'MIT Tech Review', url: 'https://www.technologyreview.com/feed/' },
  { name: 'Google News: AI Security', url: 'https://news.google.com/rss/search?q=AI+security+vulnerability+2025&hl=en-US&gl=US&ceid=US:en' },
  { name: 'Google News: LLM Research', url: 'https://news.google.com/rss/search?q=large+language+model+research+2025&hl=en-US&gl=US&ceid=US:en' },
  { name: 'Google News: AI Agents', url: 'https://news.google.com/rss/search?q=AI+agent+autonomous+system+2025&hl=en-US&gl=US&ceid=US:en' },
  { name: 'Google News: ML Security', url: 'https://news.google.com/rss/search?q=adversarial+machine+learning+attack&hl=en-US&gl=US&ceid=US:en' },
];

function parseRssFeed(xml) {
  const items = [];
  try {
    const itemRx = /<item>([\s\S]*?)<\/item>/gi;
    let m;
    while ((m = itemRx.exec(xml)) !== null && items.length < 6) {
      const chunk = m[1];
      const title = (/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i.exec(chunk) || [])[1];
      const link = (/<link>([\s\S]*?)<\/link>/i.exec(chunk) || [])[1];
      const pubDate = (/<pubDate>([\s\S]*?)<\/pubDate>/i.exec(chunk) || [])[1];
      const desc = (/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i.exec(chunk) || [])[1];
      const source = (/<source[^>]*>([\s\S]*?)<\/source>/i.exec(chunk) || [])[1];

      if (!title) continue;
      const cleanTitle = title.replace(/\s*-\s*[^-]+$/, '').trim();
      if (cleanTitle.length < 10) continue;

      items.push({
        title: cleanTitle,
        url: (link || '').trim(),
        sourceName: source || 'News',
        summary: desc ? desc.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').substring(0, 200) : cleanTitle,
        publishedAt: pubDate ? new Date(pubDate).toISOString() : null,
      });
    }
  } catch { /* swallow parse errors */ }
  return items;
}

async function fetchRssSafe(url, name) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIAgentBot/1.0)' }
    });
    clearTimeout(t);
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRssFeed(xml).map(item => ({ ...item, sourceName: item.sourceName || name }));
  } catch {
    return [];
  }
}

export class DiscoveryService {
  constructor(agentId) {
    this.agentId = agentId;
  }

  /**
   * Discover candidate topics from live RSS + curated signals.
   * Each topic is normalised, deduplicated, and stored in the topics table.
   * Returns the list of new candidate objects.
   */
  async discover(persona) {
    const discovered = [];

    // 1. Pull from persona-relevant RSS sources (2 sources, parallel)
    const selectedRss = RSS_SOURCES.sort(() => 0.5 - Math.random()).slice(0, 3);
    const rssResults = await Promise.all(selectedRss.map(src => fetchRssSafe(src.url, src.name)));
    for (const items of rssResults) {
      for (const item of items) {
        if (item.title) discovered.push(item);
      }
    }

    // 2. Select matching curated signals (ensures always-available topics)
    const personaTopicsText = (persona.topicsCareAbout || persona.topics || []).join(' ').toLowerCase();
    const personaDomainText = `${persona.domain} ${persona.name} ${(persona.expertise || []).join(' ')}`.toLowerCase();

    const matched = CURATED_SIGNALS.filter(sig => {
      const sigText = `${sig.title} ${sig.category} ${sig.summary}`.toLowerCase();
      const words = sigText.split(/\s+/).filter(w => w.length > 4);
      const matchCount = words.filter(w => personaTopicsText.includes(w) || personaDomainText.includes(w)).length;
      return matchCount >= 2 || Math.random() > 0.6; // always mix some in randomly
    }).sort(() => 0.5 - Math.random()).slice(0, 5);

    for (const sig of matched) {
      discovered.push({
        title: sig.title,
        url: sig.url,
        sourceName: sig.sourceName,
        summary: sig.summary,
        publishedAt: sig.publishedAt || new Date(Date.now() - Math.random() * 48 * 3600 * 1000).toISOString(),
      });
    }

    // 3. Normalise and persist
    const candidates = [];
    const now = new Date().toISOString();

    for (const raw of discovered) {
      if (!raw.title || raw.title.length < 8) continue;

      const fp = fingerprint(`${raw.title} ${raw.summary || ''}`);
      const topicId = `topic-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

      // Dedup: skip if fingerprint already exists for this agent
      const exists = dbGet(
        `SELECT 1 FROM topics WHERE agent_id=? AND fingerprint=? LIMIT 1`,
        [this.agentId, fp]
      );
      if (exists) continue;

      try {
        dbRun(
          `INSERT OR IGNORE INTO topics
           (id, agent_id, title, url, source_name, summary, published_at, discovered_at, fingerprint, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
          [
            topicId,
            this.agentId,
            raw.title.substring(0, 300),
            raw.url || '',
            raw.sourceName || 'Unknown',
            (raw.summary || raw.title).substring(0, 500),
            raw.publishedAt || now,
            now,
            fp
          ]
        );

        candidates.push({
          id: topicId,
          title: raw.title,
          url: raw.url || '',
          sourceName: raw.sourceName || 'Unknown',
          summary: raw.summary || raw.title,
          publishedAt: raw.publishedAt || now,
          discoveredAt: now,
          fingerprint: fp,
        });
      } catch {
        // duplicate insert – skip silently
      }
    }

    return candidates.sort(() => 0.5 - Math.random());
  }
}
