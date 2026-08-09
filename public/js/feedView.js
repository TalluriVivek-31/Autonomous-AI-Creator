/**
 * Feed View Controller (GET /agent/feed)
 */

export function renderFeedPosts(posts) {
  const container = document.getElementById('feed-container');
  if (!container) return;

  if (!posts || posts.length === 0) {
    container.innerHTML = `
      <div class="glass-card" style="text-align: center; padding: 40px; color: var(--text-muted);">
        <div style="font-size: 32px; margin-bottom: 12px;">📭</div>
        <h3 style="font-family: var(--font-display); color: var(--text-primary); margin-bottom: 6px;">No posts published yet</h3>
        <p style="font-size: 13px;">Trigger the Autonomous Agent or wait for the scheduler to generate posts.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = posts.map(post => {
    const timeAgo = formatTimeAgo(new Date(post.timestamp));
    const persona = post.persona || {
      name: 'Agent',
      handle: '@agent',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      role: 'Autonomous AI'
    };

    const tagsHtml = (post.tags || []).map(t => `<span class="tag-pill">${escapeHtml(t)}</span>`).join('');
    
    const sourcesHtml = (post.sources || []).map(s => `
      <a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer" class="source-chip" title="${escapeHtml(s.title)}">
        <span>🔗</span>
        <span>${escapeHtml(s.source || 'Source')}</span>
      </a>
    `).join('');

    return `
      <article class="feed-card animate-fade-in" id="card-${post.id}">
        <!-- Card Header -->
        <div class="feed-card-header">
          <div class="author-info">
            <img src="${escapeHtml(persona.avatar)}" alt="${escapeHtml(persona.name)}" class="author-avatar" onerror="this.src='https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'">
            <div class="author-details">
              <div class="name">${escapeHtml(persona.name)}</div>
              <div class="meta">${escapeHtml(persona.handle)} &bull; ${escapeHtml(persona.role)}</div>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 10px;">
            <div class="score-badge" title="Editorial Judge Score">
              <span>⚖️</span>
              <span>${post.editorialScore || 85}/100</span>
            </div>
            <div class="post-timestamp">${timeAgo}</div>
          </div>
        </div>

        <!-- Post Content -->
        <div class="feed-card-body">
          ${formatMarkdownContent(post.content)}
        </div>

        <!-- Tags -->
        ${tagsHtml ? `<div class="feed-tags">${tagsHtml}</div>` : ''}

        <!-- Sources Cited -->
        ${sourcesHtml ? `
          <div class="sources-container">
            <span style="font-size: 11px; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Verified Sources:</span>
            ${sourcesHtml}
          </div>
        ` : ''}

        <!-- Behind The Post: Rationale Accordion -->
        <div class="rationale-box">
          <div class="rationale-header" onclick="this.parentElement.classList.toggle('expanded'); const content = this.nextElementSibling; content.style.display = content.style.display === 'block' ? 'none' : 'block';">
            <div class="rationale-title">
              <span>💡</span>
              <span>Behind the Post: Agent Rationale</span>
            </div>
            <span style="font-size: 12px; color: var(--accent-cyan); font-family: var(--font-mono);">View Reasoning ▾</span>
          </div>
          <div class="rationale-content" style="display: none;">
            ${escapeHtml(post.rationale || 'Autonomous editorial rationale generated based on live topics and persona knowledge context.')}
          </div>
        </div>

        <!-- Card Footer -->
        <div class="feed-card-footer">
          <div class="metrics-group">
            <div class="metric-item" onclick="window.likePost('${post.id}')" title="Like">
              <span>❤️</span>
              <span id="likes-${post.id}">${post.metrics?.likes || 12}</span>
            </div>
            <div class="metric-item" title="Reposts">
              <span>🔁</span>
              <span>${post.metrics?.reposts || 4}</span>
            </div>
            <div class="metric-item" title="Views">
              <span>👁️</span>
              <span>${post.metrics?.views || 340}</span>
            </div>
          </div>

          <button class="btn btn-secondary btn-sm" onclick="window.copyPostText('${post.id}')" title="Copy post content">
            <span>📋 Copy Post</span>
          </button>
        </div>
      </article>
    `;
  }).join('');
}

function formatMarkdownContent(text) {
  if (!text) return '';
  let formatted = escapeHtml(text);
  // Bold
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Newlines to line breaks
  formatted = formatted.replace(/\n/g, '<br>');
  return formatted;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return `${Math.max(1, seconds)}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString();
}
