/**
 * Persona Setup View Controller (POST /agent/init)
 */

export function renderPresets(presets, activeId, onSelectPreset) {
  const container = document.getElementById('presets-container');
  if (!container) return;

  container.innerHTML = presets.map(p => `
    <div class="preset-card ${p.id === activeId ? 'active' : ''}" data-id="${p.id}">
      <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
        <img src="${p.avatar}" alt="${p.name}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;">
        <div>
          <div style="font-weight: 700; font-size: 13px;">${p.name}</div>
          <div style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);">${p.handle}</div>
        </div>
      </div>
      <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.4;">${p.role}</div>
    </div>
  `).join('');

  // Attach click events
  container.querySelectorAll('.preset-card').forEach(card => {
    card.addEventListener('click', () => {
      const presetId = card.dataset.id;
      const selected = presets.find(p => p.id === presetId);
      if (selected) {
        populatePersonaForm(selected);
        onSelectPreset(selected);
      }
    });
  });
}

export function populatePersonaForm(persona) {
  if (!persona) return;
  document.getElementById('form-name').value = persona.name || '';
  document.getElementById('form-handle').value = persona.handle || '';
  document.getElementById('form-role').value = persona.role || '';
  document.getElementById('form-avatar').value = persona.avatar || '';
  document.getElementById('form-bio').value = persona.bio || '';
  document.getElementById('form-tone').value = persona.tone || '';
  document.getElementById('form-style').value = persona.styleGuide || '';
  document.getElementById('form-topics').value = Array.isArray(persona.topics) ? persona.topics.join(', ') : (persona.topics || '');
  document.getElementById('form-keywords').value = Array.isArray(persona.searchKeywords) ? persona.searchKeywords.join(', ') : (persona.searchKeywords || '');
  document.getElementById('form-interval').value = persona.scheduleMinutes || 5;
  document.getElementById('form-strictness').value = persona.editorialStrictness || 'high';
}

export function getPersonaFormData() {
  return {
    name: document.getElementById('form-name').value.trim(),
    handle: document.getElementById('form-handle').value.trim(),
    role: document.getElementById('form-role').value.trim(),
    avatar: document.getElementById('form-avatar').value.trim(),
    bio: document.getElementById('form-bio').value.trim(),
    tone: document.getElementById('form-tone').value.trim(),
    styleGuide: document.getElementById('form-style').value.trim(),
    topics: document.getElementById('form-topics').value.split(',').map(s => s.trim()).filter(Boolean),
    searchKeywords: document.getElementById('form-keywords').value.split(',').map(s => s.trim()).filter(Boolean),
    scheduleMinutes: parseInt(document.getElementById('form-interval').value, 10) || 5,
    editorialStrictness: document.getElementById('form-strictness').value,
    minScoreThreshold: document.getElementById('form-strictness').value === 'high' ? 75 : (document.getElementById('form-strictness').value === 'medium' ? 60 : 45)
  };
}
