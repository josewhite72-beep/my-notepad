import { renderNoteCard } from './cards.js';
import { escapeHTML } from '../utils.js';
import { CATEGORIES } from '../blocks.js';

function chips(active, counts) {
  const all = `<button class="chip${active === 'all' ? ' active' : ''}" data-cat="all">Todo</button>`;
  const rest = Object.entries(CATEGORIES).map(([key, c]) =>
    `<button class="chip${active === key ? ' active' : ''}" data-cat="${key}">${c.icon} ${c.plural}${counts[key] ? ` <span class="chip-count">${counts[key]}</span>` : ''}</button>`
  ).join('');
  return `<div class="chips" role="toolbar" aria-label="Filtrar por categoría">${all}${rest}</div>`;
}

// notes: ya filtradas por búsqueda; category: 'all' o clave de CATEGORIES
export function renderNotas(notes, query = '', category = null) {
  const showChips = category !== null;
  const counts = {};
  notes.forEach(n => { if (n.category) counts[n.category] = (counts[n.category] || 0) + 1; });
  const list = showChips && category !== 'all' ? notes.filter(n => n.category === category) : notes;
  const bar = showChips ? chips(category, counts) : '';

  if (list.length === 0) {
    let msg = 'No hay notas todavía';
    if (query) msg = `Ninguna nota coincide con «${escapeHTML(query)}»`;
    else if (showChips && category !== 'all') msg = `Aún no hay ${CATEGORIES[category].plural.toLowerCase()}. Compártelas desde otra app con «Compartir → Cuaderno».`;
    return `${bar}<div class="empty-state"><p>${msg}</p></div>`;
  }

  // Fijadas primero, luego por fecha de edición
  const sorted = [...list].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt - a.updatedAt);
  let title = query ? `Resultados (${list.length})` : 'Todas las notas';
  if (!query && showChips && category !== 'all') title = `${CATEGORIES[category].icon} ${CATEGORIES[category].plural} (${list.length})`;

  return `${bar}<h2>${title}</h2><div class="notes-grid">${sorted.map(n => renderNoteCard(n, query)).join('')}</div>`;
}
