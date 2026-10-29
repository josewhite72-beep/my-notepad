import { renderNoteCard } from './cards.js';
import { escapeHTML } from '../utils.js';

export function renderNotas(notes, query = '') {
  if (notes.length === 0) {
    return query
      ? `<div class="empty-state"><p>Ninguna nota coincide con «${escapeHTML(query)}»</p></div>`
      : '<div class="empty-state"><p>No hay notas todavía</p></div>';
  }

  // Fijadas primero, luego por fecha de edición
  const sorted = [...notes].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt - a.updatedAt);
  const title = query ? `Resultados (${notes.length})` : 'Todas las notas';

  return `<h2>${title}</h2><div class="notes-grid">${sorted.map(n => renderNoteCard(n, query)).join('')}</div>`;
}
