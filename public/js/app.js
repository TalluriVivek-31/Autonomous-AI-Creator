/**
 * Autonomous AI Creator — Frontend Application Controller
 *
 * Handles: init screen → agent creation → dashboard + all views
 * SSE connection, real-time pipeline animation, data fetching
 */

// ── State ─────────────────────────────────────────────────────────────────
const state = {
  agentId: null,
  persona: null,
  posts: [],
  timeline: [],
  editorial: [],
  memory: null,
  status: null,
  schedulerStatus: null,
  startedAt: null,
  secondsUntilNext: 0,
  uptimeSeconds: 0,
};

// ── DOM Ready ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Check localStorage for existing agentId (persist across reload)
  const savedAgentId = localStorage.getItem('agentId');
  const savedPersona = localStorage.getItem('persona');
  if (savedAgentId && savedPersona) {
    state.agentId = savedAgentId;
    state.persona = JSON.parse(savedPersona);
    transitionToDashboard();
    return;
  }

  initInitScreen();
});

// ── INIT SCREEN ───────────────────────────────────────────────────────────

function initInitScreen() {
  createParticles();

  // Preset selector
  const presets = {
    'nova-ai-security': { name: 'Nova', domain: 'AI Security', mission: '' },
    'atlas-frontier-ai': { name: 'Atlas', domain: 'Frontier AI Research', mission: '' },
    'aria-indie-builder': { name: 'Aria', domain: 'Applied AI Engineering', mission: '' },
  };

  document.querySelectorAll('.preset-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.preset-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      const p = presets[card.dataset.preset];
      if (p) {
        document.getElementById('init-name').value = p.name;
        document.getElementById('init-domain').value = p.domain;
      }
    });
  });

  // Form submit
  document.getElementById('form-init').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-launch');
    btn.disabled = true;
    btn.querySelector('.btn-text').textContent = 'Initializing…';

    const persona = {
      name: document.getElementById('init-name').value.trim(),
      domain: document.getElementById('init-domain').value.trim(),
    };
    const mission = document.getElementById('init-mission').value.trim();
    if (mission) persona.mission = mission;

    const quality = document.getElementById('init-quality').value;
    if (quality) persona.minScoreToPublish = parseInt(quality, 10);

    try {
      const res = await fetch('/api/agent/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      state.agentId = data.agentId;
      state.persona = data.persona;
      state.startedAt = Date.now();

      localStorage.setItem('agentId', data.agentId);
      localStorage.setItem('persona', JSON.stringify(data.persona));

      toast('🚀 Agent initialized! Autonomous mode starting…', 'success');
      setTimeout(() => transitionToDashboard(), 800);

    } catch (err) {
      toast(`Init failed: ${err.message}`, 'error');
      btn.disabled = false;
      btn.querySelector('.btn-text').textContent = 'Initialize Autonomous Agent';
    }
  });
}

function createParticles() {
  const container = document.getElementById('init-particles');
  if (!container) return;
  for (let i = 0; i < 40; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.cssText = `
      left: ${Math.random() * 100}%;
      width: ${Math.random() * 3 + 1}px;
      height: ${Math.random() * 3 + 1}px;
      animation-duration: ${Math.random() * 15 + 8}s;
      animation-delay: ${Math.random() * 10}s;
      background: ${Math.random() > 0.5 ? '#6366f1' : '#38bdf8'};
    `;
    container.appendChild(p);
  }
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────

function transitionToDashboard() {
  document.getElementById('init-screen').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');

  populatePersonaUI();
  initTabs();
  initSSE();
  initActions();
  startUptimeClock();

  // Initial data load
  Promise.all([
    loadStatus(),
    loadFeed(),
    loadTimeline(),
    loadEditorial(),
    loadMemory(),
  ]);

  // Poll status every 10s for countdown
  setInterval(() => {
    loadStatus();
    loadFeed();
  }, 10000);
}

function populatePersonaUI() {
  const p = state.persona;
  if (!p) return;

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  setEl('dash-persona-name', p.name || 'Agent');
  setEl('dash-persona-handle', `@${(p.name || 'agent').toLowerCase()}_${(p.domain || '').replace(/\s+/g, '').toLowerCase().substring(0, 8)}`);
  setEl('dash-persona-domain', p.domain || 'AI Domain');
  setEl('dash-persona-mission', p.mission || `Autonomous ${p.domain || 'AI'} content engine.`);
  setEl('dash-agent-id', state.agentId?.substring(0, 14) || '—');

  // Initials avatar
  const initials = document.getElementById('persona-initials');
  if (initials) initials.textContent = (p.name || 'A').charAt(0).toUpperCase();

  // Set avatar based on persona name
  const avatar = document.getElementById('dash-persona-avatar');
  if (avatar && p.name === 'Nova') {
    avatar.src = '/nova_avatar.jpg';
    avatar.style.display = 'block';
    initials.style.display = 'none';
  } else if (avatar) {
    avatar.style.display = 'none';
    initials.style.display = 'flex';
  }

  document.getElementById('dash-agent-id').textContent = state.agentId?.substring(0, 16) || '—';
}

// ── TABS ──────────────────────────────────────────────────────────────────

function initTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-view').forEach(v => v.classList.add('hidden'));
      tab.classList.add('active');
      const targetId = tab.dataset.tab;
      const view = document.getElementById(targetId);
      if (view) view.classList.remove('hidden');

      // Refresh on tab open
      if (targetId === 'tab-feed') loadFeed();
      if (targetId === 'tab-timeline') loadTimeline();
      if (targetId === 'tab-editorial') loadEditorial();
      if (targetId === 'tab-memory') loadMemory();
    });
  });
}

// ── SSE ───────────────────────────────────────────────────────────────────

function initSSE() {
  if (!state.agentId) return;
  const sse = new EventSource(`/api/agent/events?agentId=${state.agentId}`);

  sse.onmessage = (ev) => {
    try {
      const event = JSON.parse(ev.data);
      handlePipelineEvent(event);
    } catch { /* ignore */ }
  };

  sse.onerror = () => {
    updateSSEBadge(false);
  };
}

function handlePipelineEvent(event) {
  const { type, payload = {}, timestamp } = event;

  // Update pipeline stage animation
  highlightPipelineStage(type);

  // Append to event stream widget
  appendEventToStream(type, payload, timestamp);

  // Auto-refresh data on key events
  if (type === 'PUBLISHED') {
    toast('📡 New post published to feed!', 'success');
    loadFeed();
    loadStatus();
    loadMemory();
  } else if (type === 'ALL_REJECTED') {
    toast('⚖️ Editorial judge rejected all candidates (quality maintained)', 'info');
    loadEditorial();
  } else if (type === 'CYCLE_END' || type === 'CYCLE_START') {
    loadStatus();
  } else if (type === 'TOPIC_EVALUATED') {
    loadEditorial();
  }
}

// ── PIPELINE STAGE ANIMATION ──────────────────────────────────────────────

const STAGE_MAP = {
  CYCLE_START:     'ps-discover',
  DISCOVERING:     'ps-discover',
  TOPICS_DISCOVERED: 'ps-discover',
  EVALUATING:      'ps-judge',
  TOPIC_EVALUATED: 'ps-judge',
  ALL_REJECTED:    'ps-judge',
  WRITING:         'ps-write',
  WRITE_RETRY:     'ps-write',
  VALIDATING:      'ps-write',
  SAVING:          'ps-remember',
  MEMORY_UPDATE:   'ps-remember',
  PUBLISHED:       'ps-publish',
  CYCLE_END:       'ps-publish',
};

let stageTimer = null;

function highlightPipelineStage(type) {
  const nodeId = STAGE_MAP[type];
  document.querySelectorAll('.ps-node').forEach(n => n.classList.remove('active', 'done'));

  if (nodeId) {
    const node = document.getElementById(nodeId);
    if (node) {
      node.classList.add('active');
      // Mark previous stages as done
      const order = ['ps-discover', 'ps-judge', 'ps-write', 'ps-remember', 'ps-publish'];
      const idx = order.indexOf(nodeId);
      order.slice(0, idx).forEach(id => {
        const n = document.getElementById(id);
        if (n) { n.classList.remove('active'); n.classList.add('done'); }
      });
    }
  }

  updatePipelineStatus(type);

  if (stageTimer) clearTimeout(stageTimer);
  stageTimer = setTimeout(() => {
    document.querySelectorAll('.ps-node').forEach(n => n.classList.remove('active'));
  }, 8000);
}

const STAGE_MESSAGES = {
  CYCLE_START: 'Autonomous cycle starting…',
  DISCOVERING: '🔍 Scanning live AI/tech sources…',
  TOPICS_DISCOVERED: '✓ Topics discovered — sending to Editorial Judge',
  EVALUATING: '⚖️ Evaluating candidates with 7-criteria scoring…',
  TOPIC_EVALUATED: '⚖️ Candidate evaluated',
  ALL_REJECTED: '⚠️ All candidates rejected — quality standard maintained',
  WRITING: '✍️ Persona writer synthesising content…',
  VALIDATING: '✓ Validating post before storage…',
  SAVING: '💾 Persisting to SQLite memory…',
  MEMORY_UPDATE: '🧠 Memory indexed — duplicate protection active',
  PUBLISHED: '📡 POST PUBLISHED — appearing in GET /api/agent/feed',
  CYCLE_END: 'Cycle complete — autonomous agent standing by',
};

function updatePipelineStatus(type) {
  const el = document.getElementById('pipeline-status-text');
  if (!el) return;
  const msg = STAGE_MESSAGES[type];
  if (msg) {
    el.innerHTML = `<strong style="color: var(--text)">${msg}</strong>`;
  }
}

// ── EVENT STREAM WIDGET ───────────────────────────────────────────────────

function appendEventToStream(type, payload, timestamp) {
  const container = document.getElementById('event-stream');
  if (!container) return;

  const placeholder = container.querySelector('.event-placeholder');
  if (placeholder) placeholder.remove();

  const cls = getEventClass(type);
  const time = timestamp ? new Date(timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
  const label = eventLabel(type);
  const msg = eventMsg(type, payload);

  const el = document.createElement('div');
  el.className = 'event-entry';
  el.innerHTML = `
    <span class="event-type ${cls}">${label}</span>
    <span class="event-msg">${esc(msg)}</span>
    <span class="event-time">${time}</span>
  `;

  container.insertBefore(el, container.firstChild);

  // Keep max 40 entries
  while (container.children.length > 40) container.removeChild(container.lastChild);
}

function getEventClass(type) {
  if (type.includes('DISCOVER') || type.includes('TOPICS')) return 'discover';
  if (type.includes('EVALUAT') || type.includes('JUDGE') || type.includes('EDITORIAL') || type.includes('REJECTED')) {
    return type.includes('ALL_REJECTED') ? 'reject' : 'judge';
  }
  if (type.includes('WRIT') || type.includes('VALIDAT')) return 'write';
  if (type.includes('MEMORY') || type.includes('SAVING')) return 'remember';
  if (type.includes('PUBLISH') || type.includes('POSTED')) return 'publish';
  if (type.includes('REJECT') || type.includes('ERROR')) return 'reject';
  return 'default';
}

function eventLabel(type) {
  const labels = {
    CYCLE_START: 'START', DISCOVERING: 'DISCOVER', TOPICS_DISCOVERED: 'TOPICS',
    EVALUATING: 'JUDGE', TOPIC_EVALUATED: 'VERDICT', ALL_REJECTED: 'REJECT',
    WRITING: 'WRITE', VALIDATING: 'VALIDATE', SAVING: 'SAVE',
    MEMORY_UPDATE: 'MEMORY', PUBLISHED: 'PUBLISH', CYCLE_END: 'END',
    WRITE_RETRY: 'RETRY', CYCLE_ERROR: 'ERROR',
  };
  return labels[type] || type.substring(0, 8);
}

function eventMsg(type, payload) {
  if (type === 'DISCOVERING') return `Scanning ${payload.message || 'live sources'}…`;
  if (type === 'TOPICS_DISCOVERED') return `${payload.count} topics found`;
  if (type === 'TOPIC_EVALUATED') return `${payload.verdict === 'PUBLISH' ? '✓' : '✗'} "${(payload.title || '').substring(0, 50)}" — Score: ${payload.score}/${payload.threshold}`;
  if (type === 'ALL_REJECTED') return `All ${payload.evaluated || ''} candidates rejected`;
  if (type === 'WRITING') return `Writing post on "${(payload.topic || '').substring(0, 50)}"`;
  if (type === 'PUBLISHED') return `✓ Published! Score ${payload.score} · ${payload.durationMs}ms`;
  if (type === 'MEMORY_UPDATE') return `Indexed: "${(payload.title || '').substring(0, 45)}"`;
  if (payload.message) return payload.message;
  return type;
}

// ── DATA LOADERS ──────────────────────────────────────────────────────────

async function loadStatus() {
  if (!state.agentId) return;
  try {
    const res = await fetch(`/api/agent/status?agentId=${state.agentId}`);
    if (!res.ok) return;
    const data = await res.json();
    state.status = data;
    state.schedulerStatus = data.scheduler;
    updateStatusUI(data);
  } catch { /* ignore */ }
}

function updateStatusUI(data) {
  const { stats, scheduler } = data;

  setVal('sv-posts', stats?.totalPosts || 0);
  setVal('sv-topics', stats?.totalTopicsDiscovered || 0);
  setVal('sv-rejected', stats?.totalRejected || 0);
  setVal('sv-cycles', stats?.totalCycles || 0);

  setVal('tab-feed-count', stats?.totalPosts || 0);
  setVal('tab-editorial-count', stats?.totalRejected || 0);
  setVal('qs-posts', stats?.totalPosts || 0);
  setVal('qs-rejected', stats?.totalRejected || 0);

  const total = (stats?.totalPosts || 0) + (stats?.totalRejected || 0);
  const rate = total > 0 ? Math.round((stats.totalPosts / total) * 100) : 0;
  setVal('qs-rate', total > 0 ? `${rate}%` : '—');

  if (stats?.lastPublishedAt) {
    const ago = timeAgo(new Date(stats.lastPublishedAt));
    setVal('dash-last-post', ago);
  }

  if (scheduler) {
    const interval = scheduler.intervalSeconds;
    setVal('dash-interval', `${interval}s`);
    setVal('dash-interval', `${interval}s`);

    const secs = scheduler.secondsUntilNextRun;
    if (secs != null) {
      state.secondsUntilNext = secs;
      const formatted = formatTime(secs);
      setVal('cycle-timer', formatted);
      setVal('pipeline-countdown', formatted);
      setVal('qs-next', formatted);
    }
  }
}

async function loadFeed() {
  if (!state.agentId) return;
  try {
    const res = await fetch(`/api/agent/feed?agentId=${state.agentId}`);
    if (!res.ok) return;
    const { posts } = await res.json();
    state.posts = posts || [];
    renderFeed(state.posts);
    setVal('tab-feed-count', state.posts.length);
    setVal('qs-posts', state.posts.length);
    setVal('sv-posts', state.posts.length);
  } catch { /* ignore */ }
}

async function loadTimeline() {
  if (!state.agentId) return;
  try {
    const res = await fetch(`/api/agent/timeline?agentId=${state.agentId}`);
    if (!res.ok) return;
    const { timeline } = await res.json();
    state.timeline = timeline || [];
    renderTimeline(state.timeline);
  } catch { /* ignore */ }
}

async function loadEditorial() {
  if (!state.agentId) return;
  try {
    const res = await fetch(`/api/agent/editorial?agentId=${state.agentId}`);
    if (!res.ok) return;
    const { logs } = await res.json();
    state.editorial = logs || [];
    renderEditorial(state.editorial);
    const rejectCount = logs.filter(l => l.verdict === 'REJECT').length;
    setVal('tab-editorial-count', logs.length);
    setVal('sv-rejected', rejectCount);
    setVal('qs-rejected', rejectCount);
  } catch { /* ignore */ }
}

async function loadMemory() {
  if (!state.agentId) return;
  try {
    const res = await fetch(`/api/agent/memory?agentId=${state.agentId}`);
    if (!res.ok) return;
    const { memory } = await res.json();
    state.memory = memory;
    renderMemory(memory);
  } catch { /* ignore */ }
}

// ── RENDER FUNCTIONS ──────────────────────────────────────────────────────

function renderFeed(posts) {
  const container = document.getElementById('feed-container');
  if (!container) return;

  if (!posts.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📡</div>
        <div class="empty-title">Waiting for first autonomous post…</div>
        <div class="empty-sub">The agent is running. First post will appear shortly.</div>
      </div>`;
    return;
  }

  const p = state.persona || {};
  const initial = (p.name || 'A').charAt(0).toUpperCase();

  container.innerHTML = posts.map(post => {
    const sourcesHtml = (post.sources || []).map(s => `
      <a href="${esc(s)}" target="_blank" rel="noopener" class="source-chip" title="${esc(s)}">🔗 ${esc(sourceLabel(s))}</a>
    `).join('');

    const tagsHtml = (post.tags || []).map(t => `<span class="source-chip">${esc(t)}</span>`).join('');

    const rationaleId = `rationale-${post.id}`;

    const avatarHtml = p.name === 'Nova'
      ? `<img src="/nova_avatar.jpg" class="post-avatar" alt="Nova" onerror="this.style.display='none'">`
      : `<div class="post-avatar-initials">${initial}</div>`;

    return `
      <article class="post-card">
        <div class="post-card-header">
          <div class="post-author">
            ${avatarHtml}
            <div>
              <div class="post-author-name">${esc(p.name || 'Agent')}</div>
              <div class="post-author-meta">${esc(p.domain || '')} · ${timeAgo(new Date(post.createdAt))}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            ${post.editorialScore ? `<div class="post-score-badge">⚖️ ${post.editorialScore}/100</div>` : ''}
            <div class="post-time">${new Date(post.createdAt).toLocaleTimeString()}</div>
          </div>
        </div>

        <div class="post-text">${esc(post.text)}</div>

        ${sourcesHtml ? `<div class="post-sources">${sourcesHtml}</div>` : ''}
        ${tagsHtml ? `<div class="post-sources">${tagsHtml}</div>` : ''}

        <div class="rationale-toggle" onclick="toggleRationale('${rationaleId}', this)">
          <span>💡 Why this topic was selected</span>
          <span>▾</span>
        </div>
        <div class="rationale-body" id="${rationaleId}">
          ${esc(post.rationale)}
        </div>
      </article>`;
  }).join('');
}

function renderTimeline(events) {
  const container = document.getElementById('timeline-container');
  if (!container) return;

  if (!events.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚡</div>
        <div class="empty-title">Pipeline events will appear here</div>
        <div class="empty-sub">Every step of the autonomous loop is logged here in real-time</div>
      </div>`;
    return;
  }

  container.innerHTML = events.map(ev => {
    const payload = ev.payload || {};
    const cls = getEventClass(ev.event_type);
    const icon = timelineIcon(ev.event_type);
    const label = eventLabel(ev.event_type);
    const msg = eventMsg(ev.event_type, payload);
    const time = new Date(ev.created_at).toLocaleTimeString();

    const detail = payload.reason || payload.error || payload.message || '';

    return `
      <div class="timeline-item">
        <div class="timeline-icon ${cls}">${icon}</div>
        <div class="timeline-content">
          <div class="timeline-type ${cls}">${label}</div>
          <div class="timeline-msg">${esc(msg)}</div>
          ${detail ? `<div class="timeline-detail">${esc(detail)}</div>` : ''}
        </div>
        <div class="timeline-time">${time}</div>
      </div>`;
  }).join('');
}

function renderEditorial(logs) {
  const container = document.getElementById('editorial-container');
  if (!container) return;

  if (!logs.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚖️</div>
        <div class="empty-title">Editorial decisions will appear here</div>
        <div class="empty-sub">The judge evaluates every discovered topic against 7 criteria</div>
      </div>`;
    return;
  }

  container.innerHTML = logs.map(log => {
    const cls = log.verdict === 'PUBLISH' ? 'publish' : 'reject';
    const criteria = log.criteria || {};

    const criteriaHtml = Object.entries(criteria).map(([key, c]) => {
      const score = c.score || 0;
      const scoreCls = score >= 70 ? 'high' : score >= 45 ? 'mid' : 'low';
      return `
        <div class="criteria-item">
          <div class="criteria-label">${esc(c.label || key)}</div>
          <div class="criteria-score ${scoreCls}">${score}/100</div>
        </div>`;
    }).join('');

    return `
      <div class="editorial-item ${cls}">
        <div class="editorial-header">
          <div class="editorial-title">${esc(log.topic_title || log.candidateTopic?.title || 'Unknown Topic')}</div>
          <div class="editorial-verdict ${cls}">
            ${log.verdict === 'PUBLISH' ? '✓ PUBLISH' : '✗ REJECT'} ${log.total_score ? `· ${log.total_score}/100` : ''}
          </div>
        </div>
        <div class="editorial-reason">${esc(log.reason || log.reasoning || '')}</div>
        ${criteriaHtml ? `<div class="editorial-criteria">${criteriaHtml}</div>` : ''}
      </div>`;
  }).join('');
}

function renderMemory(memory) {
  if (!memory) return;

  setVal('ms-total', memory.total || 0);
  setVal('ms-posts', memory.posts || 0);
  setVal('ms-rejected', memory.rejected || 0);

  // Themes
  const themesContainer = document.getElementById('memory-themes');
  if (themesContainer) {
    const nodes = memory.nodes || [];
    const allText = nodes.map(n => n.text).join(' ');
    const words = allText.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 4);
    const freq = {};
    words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
    const topWords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([w]) => w);

    themesContainer.innerHTML = topWords.length
      ? topWords.map(w => `<span class="theme-chip">#${w}</span>`).join('')
      : '<div class="empty-state-sm">No themes indexed yet</div>';
  }

  // Recent nodes
  const nodesContainer = document.getElementById('memory-nodes');
  if (nodesContainer) {
    const nodes = memory.nodes || [];
    nodesContainer.innerHTML = nodes.length
      ? nodes.map(n => `
        <div class="memory-node">
          <div class="memory-node-type ${n.type === 'POST' ? 'post' : 'rejected'}">${n.type}</div>
          <div class="memory-node-text">${esc(n.text)}</div>
          <div class="memory-node-time">${new Date(n.created_at).toLocaleString()}</div>
        </div>`).join('')
      : '<div class="empty-state-sm">Memory bank is empty</div>';
  }
}

// ── ACTIONS ───────────────────────────────────────────────────────────────

function initActions() {
  // Run Now button
  document.getElementById('btn-run-now')?.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: state.agentId }),
      });
      const data = await res.json();
      toast(`Cycle triggered: ${data.result?.status || 'running'}`, 'info');
    } catch (err) {
      toast('Failed to trigger cycle', 'error');
    }
  });

  // Inject topic
  document.getElementById('btn-inject')?.addEventListener('click', async () => {
    const topic = document.getElementById('inject-input')?.value.trim();
    if (!topic) { toast('Enter a topic first', 'info'); return; }

    try {
      const res = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: state.agentId, topic }),
      });
      const data = await res.json();
      toast(`Injected: ${data.result?.status}`, 'info');
      document.getElementById('inject-input').value = '';
    } catch {
      toast('Injection failed', 'error');
    }
  });
}

// ── HELPERS ───────────────────────────────────────────────────────────────

function startUptimeClock() {
  state.startedAt = state.startedAt || Date.now();

  setInterval(() => {
    state.uptimeSeconds++;

    // Update countdown
    if (state.secondsUntilNext > 0) {
      state.secondsUntilNext--;
    }
    const countdown = formatTime(state.secondsUntilNext);
    setVal('cycle-timer', countdown);
    setVal('pipeline-countdown', countdown);
    setVal('qs-next', countdown);

    // Uptime
    const elapsed = Math.round((Date.now() - state.startedAt) / 1000);
    setVal('sv-uptime', formatTime(elapsed));
  }, 1000);
}

function formatTime(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function timeAgo(date) {
  const secs = Math.round((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return date.toLocaleDateString();
}

function sourceLabel(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url.substring(0, 30);
  }
}

function timelineIcon(type) {
  const icons = {
    CYCLE_START: '🔄', DISCOVERING: '🔍', TOPICS_DISCOVERED: '✓',
    EVALUATING: '⚖️', TOPIC_EVALUATED: '📋', ALL_REJECTED: '✗',
    WRITING: '✍️', VALIDATING: '✓', SAVING: '💾',
    MEMORY_UPDATE: '🧠', PUBLISHED: '📡', CYCLE_END: '✓',
    CYCLE_ERROR: '⚠️', WRITE_RETRY: '🔄',
  };
  return icons[type] || '⚡';
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(val);
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function updateSSEBadge(connected = true) {
  const badge = document.querySelector('.sse-badge');
  if (badge) {
    badge.textContent = connected ? 'SSE Connected' : 'SSE Reconnecting…';
    badge.style.color = connected ? 'var(--emerald)' : 'var(--amber)';
  }
}

// ── TOAST ──────────────────────────────────────────────────────────────────

function toast(msg, type = 'info') {
  const container = document.getElementById('toasts');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ'}</span><span>${esc(msg)}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.3s';
    setTimeout(() => el.remove(), 350);
  }, 4000);
}

// ── GLOBAL ───────────────────────────────────────────────────────────────

window.toggleRationale = (id, btn) => {
  const body = document.getElementById(id);
  if (!body) return;
  const isOpen = body.classList.toggle('open');
  const arrow = btn.querySelector('span:last-child');
  if (arrow) arrow.textContent = isOpen ? '▴' : '▾';
};
