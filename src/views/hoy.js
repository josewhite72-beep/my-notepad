import { renderNoteCard, renderEventItem } from './cards.js';

export function renderHoy(notes, events) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (notes.length === 0 && events.length === 0) {
    return '<div class="empty-state"><p>No hay nada todavía. ¡Empieza creando una nota o un evento!</p></div>';
  }

  const todayEvents = events.filter(e => e.startAt >= today.getTime() && e.startAt < tomorrow.getTime());
  const pinnedNotes = notes.filter(n => n.pinned);
  const recentNotes = notes.filter(n => !n.pinned).slice(0, 5);

  let html = '<h2>Hoy</h2>';

  html += '<h3>Eventos del día</h3>';
  html += todayEvents.length
    ? `<div class="agenda-list">${todayEvents.map(e => renderEventItem(e, { showDate: false, past: e.startAt < Date.now() })).join('')}</div>`
    : '<p class="empty-hint">Sin eventos para hoy.</p>';

  if (pinnedNotes.length) {
    html += `<h3>Notas fijadas</h3><div class="notes-grid">${pinnedNotes.map(n => renderNoteCard(n)).join('')}</div>`;
  }

  if (recentNotes.length) {
    html += `<h3>Notas recientes</h3><div class="notes-grid">${recentNotes.map(n => renderNoteCard(n)).join('')}</div>`;
  }

  return html;
}
