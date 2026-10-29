import { escapeHTML, highlight, formatDate, formatTime } from '../utils.js';

export const CHECK_RE = /^(\s*[-*]\s\[)( |x|X)(\]\s?)(.*)$/;
const MAX_PREVIEW_LINES = 8;

function renderBody(body, query) {
  if (!body) return '';
  const lines = body.split('\n');
  const shown = lines.slice(0, MAX_PREVIEW_LINES);
  let html = shown.map((line, i) => {
    const m = line.match(CHECK_RE);
    if (m) {
      const done = m[2].toLowerCase() === 'x';
      return `<label class="line check-line${done ? ' done' : ''}">` +
        `<input type="checkbox" class="check-toggle" data-line="${i}"${done ? ' checked' : ''}>` +
        `<span>${highlight(m[4], query)}</span></label>`;
    }
    return `<div class="line">${highlight(line, query)}</div>`;
  }).join('');
  if (lines.length > MAX_PREVIEW_LINES) html += '<div class="line">…</div>';
  return html;
}

export function renderNoteCard(note, query = '') {
  const color = ['yellow', 'blue', 'green', 'pink', 'white'].includes(note.color) ? note.color : 'yellow';
  const id = escapeHTML(note.id);
  return `
    <div class="note-card paper-${color}" data-note-id="${id}" tabindex="0">
      <button class="delete-btn" data-delete-note="${id}" aria-label="Eliminar nota">✕</button>
      <h3>${note.pinned ? '<span class="pin-badge">📌</span>' : ''}${highlight(note.title || 'Sin título', query)}</h3>
      <div class="note-preview">${renderBody(note.body, query)}</div>
      <div class="note-meta">${formatDate(note.updatedAt)} · ${formatTime(note.updatedAt)}</div>
    </div>
  `;
}

export function renderEventItem(event, { past = false, query = '', showDate = true } = {}) {
  const when = showDate
    ? `${formatDate(event.startAt)} · ${formatTime(event.startAt)}`
    : formatTime(event.startAt);
  const bell = event.reminderAt && !past
    ? `<div class="bell">🔔 ${event.reminderSent ? 'Recordatorio enviado' : `Aviso: ${formatDate(event.reminderAt)} ${formatTime(event.reminderAt)}`}</div>`
    : '';
  return `
    <div class="agenda-item${past ? ' past' : ''}" data-event-id="${escapeHTML(event.id)}" tabindex="0">
      <div class="time">${when}</div>
      <div class="title">${highlight(event.title, query)}</div>
      ${event.detail ? `<div class="detail">${highlight(event.detail, query)}</div>` : ''}
      ${bell}
    </div>
  `;
}
