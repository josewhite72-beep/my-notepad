import { escapeHTML, highlight, formatDate, formatTime } from '../utils.js';

export const CHECK_RE = /^(\s*[-*]\s\[)( |x|X)(\]\s?)(.*)$/;
const TABLE_RE = /^\s*\|.*\|\s*$/;
const TABLE_SEP_RE = /^\s*\|(\s*:?-{2,}:?\s*\|)+\s*$/;
const MAX_PREVIEW_LINES = 12;

export const FONTS = ['sans', 'serif', 'mono', 'hand'];
export const SIZES = ['s', 'm', 'l', 'xl'];
export const INKS = ['default', 'blue', 'red', 'green', 'purple', 'brown'];

// Clases CSS del estilo guardado en la nota (sirve para tarjeta y editor)
export function styleClasses(note) {
  const font = FONTS.includes(note?.font) ? note.font : 'sans';
  const size = SIZES.includes(note?.size) ? note.size : 'm';
  const ink = INKS.includes(note?.ink) ? note.ink : 'default';
  return [
    font !== 'sans' ? `font-${font}` : '',
    `size-${size}`,
    ink !== 'default' ? `ink-${ink}` : ''
  ].filter(Boolean).join(' ');
}

function splitCells(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
}

function renderTable(rows, query) {
  const data = rows.filter(r => !TABLE_SEP_RE.test(r)).map(splitCells);
  if (!data.length) return '';
  const cols = Math.max(...data.map(r => r.length));
  const cell = (tag, txt) => `<${tag}>${highlight(txt || '', query)}</${tag}>`;
  const row = (r, tag) => `<tr>${Array.from({ length: cols }, (_, i) => cell(tag, r[i])).join('')}</tr>`;
  const [head, ...body] = data;
  return `<div class="table-wrap"><table class="note-table"><thead>${row(head, 'th')}</thead>` +
    `<tbody>${body.map(r => row(r, 'td')).join('')}</tbody></table></div>`;
}

function renderBody(body, query) {
  if (!body) return '';
  const lines = body.split('\n');
  const limit = Math.min(lines.length, MAX_PREVIEW_LINES);
  let html = '';
  let i = 0;

  while (i < limit) {
    const line = lines[i];

    // Tabla: líneas seguidas que empiezan y terminan con |
    if (TABLE_RE.test(line)) {
      const rows = [];
      while (i < lines.length && TABLE_RE.test(lines[i]) && rows.length < 10) rows.push(lines[i++]);
      html += renderTable(rows, query);
      continue;
    }

    // Casilla de lista; data-line guarda el número real de línea
    const m = line.match(CHECK_RE);
    if (m) {
      const done = m[2].toLowerCase() === 'x';
      html += `<label class="line check-line${done ? ' done' : ''}">` +
        `<input type="checkbox" class="check-toggle" data-line="${i}"${done ? ' checked' : ''}>` +
        `<span>${highlight(m[4], query)}</span></label>`;
    } else {
      html += `<div class="line">${highlight(line, query)}</div>`;
    }
    i++;
  }

  if (i < lines.length) html += '<div class="line">…</div>';
  return html;
}

export function renderNoteCard(note, query = '') {
  const color = ['yellow', 'blue', 'green', 'pink', 'white'].includes(note.color) ? note.color : 'yellow';
  const id = escapeHTML(note.id);
  const style = styleClasses(note);
  const fontClass = FONTS.includes(note.font) && note.font !== 'sans' ? `font-${note.font}` : '';
  return `
    <div class="note-card paper-${color}" data-note-id="${id}" tabindex="0">
      <button class="delete-btn" data-delete-note="${id}" aria-label="Eliminar nota">✕</button>
      <h3 class="${fontClass}">${note.pinned ? '<span class="pin-badge">📌</span>' : ''}${highlight(note.title || 'Sin título', query)}</h3>
      <div class="note-preview ${style}">${renderBody(note.body, query)}</div>
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
