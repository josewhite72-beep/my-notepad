import { escapeHTML, highlight, formatDate, formatTime } from '../utils.js';
import { noteBlocks } from '../blocks.js';

export const CHECK_RE = /^(\s*[-*]\s\[)( |x|X)(\]\s?)(.*)$/;
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

const MAX_TABLE_ROWS = 8;

function renderTable(rows, query) {
  if (!rows.length) return '';
  const shown = rows.slice(0, MAX_TABLE_ROWS);
  const cell = (tag, txt) => `<${tag}>${highlight(txt || '', query)}</${tag}>`;
  const [head, ...body] = shown;
  let html = `<div class="table-wrap"><table class="note-table">` +
    `<thead><tr>${head.map(c => cell('th', c)).join('')}</tr></thead>` +
    `<tbody>${body.map(r => `<tr>${r.map(c => cell('td', c)).join('')}</tr>`).join('')}</tbody></table></div>`;
  if (rows.length > MAX_TABLE_ROWS) html += `<div class="line more">… ${rows.length - MAX_TABLE_ROWS} filas más</div>`;
  return html;
}

function renderText(block, blockIdx, query, budget) {
  const lines = block.text.split('\n');
  let html = '';
  let used = 0;
  for (let i = 0; i < lines.length && used < budget; i++, used++) {
    const m = lines[i].match(CHECK_RE);
    if (m) {
      const done = m[2].toLowerCase() === 'x';
      html += `<label class="line check-line${done ? ' done' : ''}">` +
        `<input type="checkbox" class="check-toggle" data-block="${blockIdx}" data-line="${i}"${done ? ' checked' : ''}>` +
        `<span>${highlight(m[4], query)}</span></label>`;
    } else {
      html += `<div class="line">${highlight(lines[i], query)}</div>`;
    }
  }
  return { html, used, truncated: used < lines.length };
}

function renderBody(note, query) {
  const blocks = noteBlocks(note);
  let budget = MAX_PREVIEW_LINES;
  let html = '';
  for (let b = 0; b < blocks.length; b++) {
    const block = blocks[b];
    if (block.type === 'table') {
      html += renderTable(block.rows, query);
      budget -= 2;
      continue;
    }
    // Saltar renglones vacíos sobrantes al final de un bloque
    const trimmed = { ...block, text: block.text.replace(/\n+$/, '') };
    if (!trimmed.text) continue;
    if (budget <= 0) { html += '<div class="line">…</div>'; break; }
    const r = renderText(trimmed, b, query, budget);
    html += r.html;
    budget -= r.used;
    if (r.truncated) { html += '<div class="line">…</div>'; break; }
  }
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
      <div class="note-preview ${style}">${renderBody(note, query)}</div>
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
