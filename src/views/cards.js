import { escapeHTML, highlight, formatDate, formatTime } from '../utils.js';
import { noteBlocks, CATEGORIES, validCategory } from '../blocks.js';

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
const MAX_CARD_IMAGES = 2;
const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

function shortUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    const path = u.pathname.replace(/\/$/, '');
    return path.length > 1 ? `${host}${path.length > 22 ? path.slice(0, 22) + '…' : path}` : host;
  } catch {
    return url;
  }
}

// Texto con enlaces tocables (y resaltado de búsqueda en lo demás)
export function richText(text, query) {
  const raw = String(text ?? '');
  return raw.split(URL_RE).map((part, i) => {
    if (i % 2 === 0) return highlight(part, query);
    // Quitar puntuación final que no es parte del enlace
    const m = part.match(/^(.*?)([.,;:!?)\]]*)$/);
    const url = m[1];
    return `<a class="note-link" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">🔗 ${highlight(shortUrl(url), query)}</a>${highlight(m[2], query)}`;
  }).join('');
}

function renderTable(rows, query) {
  if (!rows.length) return '';
  const shown = rows.slice(0, MAX_TABLE_ROWS);
  const cell = (tag, txt) => `<${tag}>${richText(txt || '', query)}</${tag}>`;
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
        `<span>${richText(m[4], query)}</span></label>`;
    } else {
      html += `<div class="line">${richText(lines[i], query)}</div>`;
    }
  }
  return { html, used, truncated: used < lines.length };
}

function renderBody(note, query) {
  const blocks = noteBlocks(note);
  let budget = MAX_PREVIEW_LINES;
  let html = '';
  let images = 0;
  for (let b = 0; b < blocks.length; b++) {
    const block = blocks[b];
    if (block.type === 'image') {
      if (images < MAX_CARD_IMAGES) html += `<img class="note-img" src="${escapeHTML(block.src)}" alt="Imagen guardada" loading="lazy">`;
      else if (images === MAX_CARD_IMAGES) html += '<div class="line more">+ más imágenes</div>';
      images++;
      budget -= 3;
      continue;
    }
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

function categoryBadge(note) {
  const cat = CATEGORIES[validCategory(note.category)];
  return cat ? `<span class="cat-badge">${cat.icon} ${cat.label}</span> · ` : '';
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
      <div class="note-meta">${categoryBadge(note)}${formatDate(note.updatedAt)} · ${formatTime(note.updatedAt)}</div>
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
