import { renderEventItem } from './cards.js';
import { escapeHTML } from '../utils.js';

export function renderAgenda(events, query = '') {
  if (events.length === 0) {
    return query
      ? `<div class="empty-state"><p>Ningún evento coincide con «${escapeHTML(query)}»</p></div>`
      : '<div class="empty-state"><p>No hay eventos en la agenda.<br>Usa «+ Evento» para crear uno.</p></div>';
  }

  const now = Date.now();
  const upcoming = events.filter(e => e.startAt >= now);
  const past = events.filter(e => e.startAt < now);

  let html = '<h2>Próximos eventos</h2>';
  html += upcoming.length
    ? `<div class="agenda-list">${upcoming.map(e => renderEventItem(e, { query })).join('')}</div>`
    : '<p class="empty-hint">No hay eventos próximos</p>';

  if (past.length) {
    const recentPast = past.slice(-10).reverse();
    html += `<h2 class="section-gap">Eventos pasados</h2><div class="agenda-list">${recentPast.map(e => renderEventItem(e, { past: true, query })).join('')}</div>`;
  }

  return html;
}
