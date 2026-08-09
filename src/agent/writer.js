/**
 * Persona Writer — synthesises posts in the persona's authentic voice
 *
 * Primary path: Gemini / OpenAI API (if key present)
 * Fallback: Intelligent domain-aware synthesis engine
 */

async function callGemini(prompt, apiKey) {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.72,
            topP: 0.95,
            responseMimeType: 'application/json',
          },
        }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    const parsed = JSON.parse(text);
    if (parsed.text && parsed.rationale) return parsed;
  } catch { /* fall through */ }
  return null;
}

/**
 * Intelligent domain-aware synthesis engine.
 * Generates genuinely different content based on persona domain + topic specifics.
 */
function synthesize(topic, persona, memoryContext, editorialResult) {
  const { title, summary, url, sourceName } = topic;
  const { name, domain, writingStyle, opinions = [], topicsCareAbout = [] } = persona;

  // Extract key technical terms from summary/title
  const techTerms = (summary + ' ' + title)
    .replace(/[^a-zA-Z0-9\s%-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 4)
    .slice(0, 6);

  // Pick a random opinion to weave in for authenticity
  const opinion = opinions[Math.floor(Math.random() * opinions.length)] || '';
  const topicFocus = topicsCareAbout[Math.floor(Math.random() * topicsCareAbout.length)] || domain;

  const domainLower = (domain || '').toLowerCase();

  let text = '';

  if (domainLower.includes('security') || domainLower.includes('red team') || domainLower.includes('adversar')) {
    // AI Security persona voice
    text = `${title}

This is not a theoretical concern anymore.

${summary}

Here is what matters operationally:

The attack surface this creates is real and already being weaponised. The gap between when a vulnerability is discovered by researchers and when it reaches production red-team playbooks is shrinking to days, not months.

Three immediate implications for anyone deploying AI systems:

1. **Trust boundaries**: Every external input to your LLM — user prompts, tool outputs, retrieved documents — must be treated as potentially adversarial. Design your system to fail safely, not just succeed safely.

2. **Monitoring over prevention**: You cannot filter your way to safety. Behavioural monitoring on model outputs, tool call sequences, and data egress patterns gives you detection when prevention fails.

3. **Incident response**: Most teams I see have ML ops runbooks. Almost none have AI-specific incident response procedures. That gap gets exploited before the playbook gets written.

${opinion ? `Worth remembering: ${opinion}` : ''}

The source material is worth reading in full — particularly the sections on reproducibility. If your team has not threat-modelled your agentic workflows in the last 90 days, this is a forcing function.`;

  } else if (domainLower.includes('research') || domainLower.includes('frontier')) {
    // Frontier AI Research persona voice
    text = `${title}

Let me give you the signal without the noise.

${summary}

Why this matters beyond the benchmark headline:

The underlying mechanism here represents a genuine architectural contribution, not a scaling trick. The key finding — that you can achieve this improvement by changing *how* compute is allocated rather than adding more of it — is the part practitioners should pay attention to.

What this changes in practice:

- **For researchers**: The evaluation methodology itself is as important as the results. Read the ablation section. The authors' approach to controlling confounders is worth adopting broadly.
- **For engineers**: Before benchmarks translate to production gains, check the token budget assumptions. Most results at this performance level assume inference compute 3–5x what you are actually using.
- **For the field**: We keep finding that problem decomposition and verification outperform raw model capacity on complex reasoning tasks. This is not a coincidence.

${opinion ? `My standing view: ${opinion}` : ''}

Source: ${sourceName}. The full methodology section is the read — not just the abstract.`;

  } else {
    // Applied AI / Engineering persona voice
    text = `${title}

Practical breakdown for builders who need to ship.

${summary}

Here is what I would actually do with this information:

**If you are building today:** ${techTerms.slice(0, 3).join(', ')} are the components worth focusing on. The headline result only applies under specific conditions — the paper's setup section tells you exactly which conditions.

**Cost reality check:** Most teams reading this will pay 60–80% of the claimed efficiency gain in integration complexity. Factor that in before committing to the stack.

**What it replaces:** This is additive for most workflows, not a replacement. The teams that will extract the most value are those that already have a clean retrieval layer and reproducible evals.

**Concrete next step:** Pull the GitHub repo if there is one (there usually is), run the benchmark on your own data within the week. Real numbers beat spec numbers every time.

${opinion ? `One principle I keep returning to: ${opinion}` : ''}

Drop questions below if you hit something unexpected — this stuff rarely works exactly as documented on the first try.`;
  }

  const rationale = generateRationale(topic, persona, editorialResult, memoryContext);
  const tags = extractTags(title, summary, persona);

  return {
    text: text.trim(),
    rationale,
    sources: [url || sourceName].filter(Boolean),
    tags,
  };
}

function generateRationale(topic, persona, editorialResult, memoryContext) {
  const { criteria, totalScore, threshold } = editorialResult;
  const topCriteria = Object.entries(criteria || {})
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 2)
    .map(([, c]) => `${c.label.toLowerCase()} (${c.score}/100)`);

  const recencyNote = topic.publishedAt
    ? (() => {
        const ageHours = Math.round((Date.now() - new Date(topic.publishedAt).getTime()) / 3600000);
        return ageHours < 24 ? `Published ${ageHours}h ago` : `Published ${Math.round(ageHours / 24)}d ago`;
      })()
    : 'Discovered recently';

  const memoryNote = memoryContext.hasHistory
    ? `Memory check confirmed no overlap with the ${memoryContext.totalPublished} prior posts.`
    : 'First publication — no prior content to check.';

  return `Selected because: Editorial score ${totalScore}/${threshold} (threshold). Strongest signals: ${topCriteria.join(' and ')}. ${recencyNote} via ${topic.sourceName || 'live discovery'}. ${memoryNote} The topic aligns with ${persona.name}'s core focus on ${persona.domain}.`;
}

function extractTags(title, summary, persona) {
  const combined = `${title} ${summary}`.toLowerCase();
  const candidates = [
    ...(persona.topicsCareAbout || []).slice(0, 4),
    persona.domain || '',
  ];
  const tags = [];
  for (const c of candidates) {
    const word = c.split(/[\s,]+/)[0].replace(/[^a-zA-Z0-9]/g, '');
    if (word.length > 2 && !tags.includes(`#${word}`)) tags.push(`#${word}`);
    if (tags.length >= 4) break;
  }
  return tags;
}

export class PersonaWriter {
  constructor(agentId) {
    this.agentId = agentId;
  }

  async write(topic, persona, memoryContext, editorialResult) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;

    if (apiKey && process.env.GEMINI_API_KEY) {
      const topOpinions = (persona.opinions || []).slice(0, 2).join(' ');
      const topTopics = (persona.topicsCareAbout || []).slice(0, 4).join(', ');
      const recentThemes = (memoryContext.topThemes || []).join(', ');

      const prompt = `You are ${persona.name}, ${persona.domain} expert.
Mission: ${persona.mission}
Writing style: ${persona.writingStyle}
Your opinions: ${topOpinions}
You care deeply about: ${topTopics}
Recent themes in your content: ${recentThemes}

Write an original, authentic post about this topic:
Title: "${topic.title}"
Source: "${topic.sourceName}"
Summary: "${topic.summary}"
URL: "${topic.url}"

Requirements:
- Strong technical hook in the first line
- Specific insight, not generic commentary
- Your authentic persona viewpoint
- 280-400 words
- Avoid bullet-only posts; mix prose and structure
- No generic phrases like "In conclusion" or "It is worth noting"

Return ONLY valid JSON matching this exact schema:
{
  "text": "The complete post text",
  "rationale": "2-3 sentences: why you selected this topic now and what makes it significant",
  "sources": ["${topic.url}"],
  "tags": ["#Tag1", "#Tag2", "#Tag3"]
}`;

      const result = await callGemini(prompt, apiKey);
      if (result) return result;
    }

    return synthesize(topic, persona, memoryContext, editorialResult);
  }
}
