import { openDB } from './db/database.js';
import { getNotes, saveNote, deleteNote } from './db/notes.js';
import { getEvents, saveEvent, deleteEvent } from './db/events.js';
import { renderHoy } from './views/hoy.js';
import { renderNotas } from './views/notas.js';
import { renderAgenda } from './views/agenda.js';
import { CHECK_RE, styleClasses } from './views/cards.js';
import { setupReminders, requestNotificationPermission, notificationsSupported } from './services/reminders.js';
import { exportData, readBackup } from './services/backup.js';
import { debounce, escapeHTML, toTimestamp, toInputValues } from './utils.js';

// ============ PWA ============
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => console.error('SW:', err));
  });
}

if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : Date.now().toString(36) + Math.random().toString(36).slice(2));

const $ = id => document.getElementById(id);

// ============ ESTADO ============
const state = {
  currentView: 'hoy',
  notes: [],
  events: [],
  query: '',
  editingNote: null,   // copia de la nota abierta (null = nota nueva aún sin guardar)
  draftPinned: false,
  editingEvent: null
};

let checkReminders = () => {};

// ============ AVISOS ============
let toastTimer;
function toast(msg, ms = 3000) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
}

// ============ RENDERIZADO ============
function matches(text, q) {
  return (text || '').toLowerCase().includes(q);
}

function filtered() {
  const q = state.query.toLowerCase();
  if (!q) return { notes: state.notes, events: state.events };
  return {
    notes: state.notes.filter(n => matches(n.title, q) || matches(n.body, q)),
    events: state.events.filter(e => matches(e.title, q) || matches(e.detail, q))
  };
}

function renderSearchResults(notes, events) {
  const q = state.query;
  if (!notes.length && !events.length) {
    return `<div class="empty-state"><p>Nada coincide con «${escapeHTML(q)}»</p></div>`;
  }
  let html = '';
  if (notes.length) html += renderNotas(notes, q);
  if (events.length) html += renderAgenda(events, q).replace('<h2>', '<h2 class="section-gap">');
  return html;
}

function render() {
  const { notes, events } = filtered();
  const views = { hoy: $('view-hoy'), notas: $('view-notas'), agenda: $('view-agenda') };

  views.hoy.innerHTML = state.query ? renderSearchResults(notes, events) : renderHoy(notes, events);
  views.notas.innerHTML = renderNotas(notes, state.query);
  views.agenda.innerHTML = renderAgenda(events, state.query);

  Object.entries(views).forEach(([name, el]) => el.classList.toggle('hidden', state.currentView !== name));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === state.currentView));
}

function upsert(list, item) {
  const i = list.findIndex(x => x.id === item.id);
  if (i >= 0) list[i] = item; else list.unshift(item);
}

// ============ BOTÓN ATRÁS DE ANDROID CIERRA MODALES ============
let modalHistory = false;
function pushModalState() {
  if (!modalHistory) {
    history.pushState({ modal: true }, '');
    modalHistory = true;
  }
}
function popModalState() {
  if (modalHistory) {
    modalHistory = false;
    history.back();
  }
}
window.addEventListener('popstate', () => {
  modalHistory = false;
  if (!$('note-overlay').classList.contains('hidden')) closeNoteModal({ fromHistory: true });
  if (!$('event-overlay').classList.contains('hidden')) closeEventModal({ fromHistory: true });
});

// ============ NOTAS: MODAL CON AUTOGUARDADO ============
let saveChain = Promise.resolve();

function readNoteForm() {
  return {
    title: $('note-title').value.trim(),
    body: $('note-body').value.replace(/\s+$/, ''),
    color: $('note-color').value,
    font: $('note-font').value,
    size: $('note-size').value,
    ink: $('note-ink').value
  };
}

function persistNote() {
  saveChain = saveChain.then(async () => {
    const { title, body, color, font, size, ink } = readNoteForm();
    const base = state.editingNote;
    if (!base && !title && !body) return; // nota nueva vacía: no guardar

    const now = Date.now();
    const note = {
      ...(base || {}),
      id: base?.id || uuid(),
      title,
      body,
      color,
      font,
      size,
      ink,
      pinned: state.draftPinned,
      tags: base?.tags || [],
      createdAt: base?.createdAt || now,
      updatedAt: now
    };
    await saveNote(note);
    state.editingNote = note;
    upsert(state.notes, note);
    state.notes.sort((a, b) => b.updatedAt - a.updatedAt);
    $('note-status').textContent = 'Guardado';
    $('note-delete').hidden = false;
  }).catch(err => {
    console.error(err);
    $('note-status').textContent = '⚠️ Error al guardar';
  });
  return saveChain;
}

const autosave = debounce(persistNote, 400);

function onNoteInput() {
  $('note-status').textContent = 'Guardando…';
  autosave();
}

function setPinButton() {
  const btn = $('note-pin');
  btn.setAttribute('aria-pressed', String(state.draftPinned));
  btn.textContent = state.draftPinned ? '📌 Fijada' : '📌 Fijar';
}

// ============ BARRA DEL EDITOR ============
function applyEditorStyle() {
  const look = { font: $('note-font').value, size: $('note-size').value, ink: $('note-ink').value };
  $('note-body').className = `note-body-input ${styleClasses(look)}`;
  $('note-title').className = `note-title-input${look.font !== 'sans' ? ' font-' + look.font : ''}`;
}

function toggleStylePanel(force) {
  const open = force ?? $('style-panel').classList.contains('hidden');
  $('style-panel').classList.toggle('hidden', !open);
  $('tb-style').setAttribute('aria-expanded', String(open));
}

function lineBounds(value, pos) {
  const start = value.lastIndexOf('\n', pos - 1) + 1;
  const nl = value.indexOf('\n', pos);
  return { start, end: nl === -1 ? value.length : nl };
}

function insertList() {
  const ta = $('note-body');
  const v = ta.value;
  const s = ta.selectionStart;
  const e = ta.selectionEnd;
  const { start, end } = lineBounds(v, s);

  if (s !== e) {
    // Varias líneas seleccionadas: convertir cada una en tarea
    const blockEnd = lineBounds(v, e).end;
    const block = v.slice(start, blockEnd).split('\n')
      .map(l => (CHECK_RE.test(l) || !l.trim()) ? l : '- [ ] ' + l).join('\n');
    ta.setRangeText(block, start, blockEnd, 'end');
  } else {
    const line = v.slice(start, end);
    if (!line.trim()) {
      ta.setRangeText('- [ ] ', start, end, 'end');
    } else {
      // Línea con texto: la tarea nueva va en la línea siguiente
      ta.setRangeText('\n- [ ] ', end, end, 'end');
    }
  }
  ta.focus();
  onNoteInput();
}

function insertTable() {
  const ta = $('note-body');
  const v = ta.value;
  const s = ta.selectionEnd;
  const { start, end } = lineBounds(v, s);
  const lineHasText = v.slice(start, end).trim() !== '';
  const insertAt = lineHasText ? end : start;
  const before = lineHasText ? '\n' : '';
  const after = insertAt < v.length ? '' : '\n';
  const table = '| Columna 1 | Columna 2 |\n|  |  |\n|  |  |';
  ta.setRangeText(before + table + after, insertAt, lineHasText ? end : end, 'end');
  // Dejar seleccionado «Columna 1» para escribir encima
  const pos = insertAt + before.length + 2;
  ta.focus();
  ta.setSelectionRange(pos, pos + 'Columna 1'.length);
  onNoteInput();
}

// Enter dentro de una tarea crea la siguiente; Enter en una tarea vacía termina la lista
function handleEditorEnter(e) {
  if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
  const ta = e.target;
  if (ta.selectionStart !== ta.selectionEnd) return;
  const s = ta.selectionStart;
  const { start, end } = lineBounds(ta.value, s);
  if (s !== end) return;
  const m = ta.value.slice(start, end).match(CHECK_RE);
  if (!m) return;
  e.preventDefault();
  if (!m[4].trim()) {
    ta.setRangeText('', start, end, 'end');
  } else {
    ta.setRangeText('\n- [ ] ', s, s, 'end');
  }
  onNoteInput();
}

function openNoteModal(note = null) {
  state.editingNote = note ? { ...note } : null;
  state.draftPinned = !!note?.pinned;
  $('note-title').value = note?.title || '';
  $('note-body').value = note?.body || '';
  $('note-color').value = note?.color || 'yellow';
  $('note-font').value = note?.font || 'sans';
  $('note-size').value = note?.size || 'm';
  $('note-ink').value = note?.ink || 'default';
  applyEditorStyle();
  toggleStylePanel(false);
  $('note-modal').className = `modal paper-${note?.color || 'yellow'}`;
  $('note-status').textContent = '';
  $('note-delete').hidden = !note;
  setPinButton();
  closeMenu();
  $('note-overlay').classList.remove('hidden');
  pushModalState();
  (note ? $('note-body') : $('note-title')).focus();
}

async function closeNoteModal({ fromHistory = false } = {}) {
  if ($('note-overlay').classList.contains('hidden')) return;
  autosave.cancel();
  await persistNote();
  $('note-overlay').classList.add('hidden');
  state.editingNote = null;
  if (!fromHistory) popModalState();
  render();
}

async function deleteNoteById(id) {
  if (!confirm('¿Eliminar esta nota?')) return false;
  await deleteNote(id);
  state.notes = state.notes.filter(n => n.id !== id);
  render();
  return true;
}

async function toggleChecklistLine(noteId, lineIndex) {
  const note = state.notes.find(n => n.id === noteId);
  if (!note) return;
  const lines = note.body.split('\n');
  const m = lines[lineIndex]?.match(CHECK_RE);
  if (!m) return;
  lines[lineIndex] = m[1] + (m[2] === ' ' ? 'x' : ' ') + m[3] + m[4];
  const updated = { ...note, body: lines.join('\n'), updatedAt: Date.now() };
  await saveNote(updated);
  upsert(state.notes, updated);
  state.notes.sort((a, b) => b.updatedAt - a.updatedAt);
  render();
}

// ============ EVENTOS: FORMULARIO ============
const REMINDER_OPTIONS = ['0', '5', '15', '30', '60', '1440'];

function openEventModal(event = null) {
  state.editingEvent = event;
  let startAt = event?.startAt;
  if (!startAt) {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    startAt = d.getTime();
  }
  const { date, time } = toInputValues(startAt);
  $('event-title').value = event?.title || '';
  $('event-date').value = date;
  $('event-time').value = time;
  $('event-detail').value = event?.detail || '';

  let reminder = '';
  if (event?.reminderAt) {
    const mins = String(Math.round((event.startAt - event.reminderAt) / 60000));
    reminder = REMINDER_OPTIONS.includes(mins) ? mins : '0';
  } else if (!event) {
    reminder = '15';
  }
  $('event-reminder').value = reminder;
  $('event-error').textContent = '';
  $('event-delete').hidden = !event;
  closeMenu();
  $('event-overlay').classList.remove('hidden');
  pushModalState();
  $('event-title').focus();
}

function closeEventModal({ fromHistory = false } = {}) {
  if ($('event-overlay').classList.contains('hidden')) return;
  $('event-overlay').classList.add('hidden');
  state.editingEvent = null;
  if (!fromHistory) popModalState();
}

async function submitEvent(e) {
  e.preventDefault();
  const title = $('event-title').value.trim();
  const date = $('event-date').value;
  const time = $('event-time').value;
  const reminderVal = $('event-reminder').value;

  if (!title) return void ($('event-error').textContent = 'Escribe un título.');
  if (!date || !time) return void ($('event-error').textContent = 'Indica fecha y hora.');

  const startAt = toTimestamp(date, time);
  const reminderAt = reminderVal === '' ? null : startAt - Number(reminderVal) * 60000;
  const prev = state.editingEvent;

  // Si el recordatorio no cambió, se conserva su estado; si cambió, vuelve a quedar pendiente.
  // Un evento que ya pasó no dispara recordatorio.
  let reminderSent = false;
  if (prev && prev.reminderAt === reminderAt) reminderSent = !!prev.reminderSent;
  if (startAt < Date.now()) reminderSent = true;

  const event = {
    ...(prev || {}),
    id: prev?.id || uuid(),
    title,
    detail: $('event-detail').value.trim(),
    startAt,
    endAt: prev?.endAt ?? null,
    reminderAt,
    reminderSent,
    createdAt: prev?.createdAt || Date.now()
  };

  // Pedir permiso aquí: es un gesto del usuario, Chrome lo permite
  if (reminderAt && notificationsSupported() && Notification.permission === 'default') {
    await requestNotificationPermission();
  }

  await saveEvent(event);
  state.events = await getEvents();
  closeEventModal();
  render();

  if (reminderAt && !reminderSent) {
    if (notificationsSupported() && Notification.permission === 'denied') {
      toast('Evento guardado. Las notificaciones están bloqueadas: solo sonará con la app abierta.', 4500);
    } else {
      toast('Evento guardado con recordatorio');
    }
  } else {
    toast('Evento guardado');
  }
  checkReminders();
}

async function deleteCurrentEvent() {
  const ev = state.editingEvent;
  if (!ev || !confirm('¿Eliminar este evento?')) return;
  await deleteEvent(ev.id);
  state.events = state.events.filter(x => x.id !== ev.id);
  closeEventModal();
  render();
}

// ============ MENÚ, COPIA DE SEGURIDAD ============
function closeMenu() {
  $('menu').classList.add('hidden');
}

async function handleMenu(action) {
  closeMenu();
  if (action === 'export') {
    exportData(state.notes, state.events);
    toast(`Copia exportada: ${state.notes.length} notas, ${state.events.length} eventos`);
  } else if (action === 'import') {
    $('import-file').click();
  } else if (action === 'notify') {
    const result = await requestNotificationPermission();
    const msg = {
      granted: 'Recordatorios activados ✔',
      denied: 'Notificaciones bloqueadas. Actívalas en los ajustes del navegador para este sitio.',
      default: 'No se concedió el permiso.',
      unsupported: 'Este navegador no admite notificaciones.'
    };
    toast(msg[result] || msg.default, 4500);
  }
}

async function importFile(file) {
  try {
    const data = await readBackup(file);
    if (!confirm(`Importar ${data.notes.length} notas y ${data.events.length} eventos?\nSe combinan con lo que ya tienes (si una nota existe, se queda la versión más reciente).`)) return;

    const existing = new Map(state.notes.map(n => [n.id, n]));
    let added = 0;
    for (const n of data.notes) {
      const cur = existing.get(n.id);
      if (!cur || n.updatedAt > cur.updatedAt) {
        await saveNote(n);
        added++;
      }
    }
    const existingEvents = new Set(state.events.map(e => e.id));
    for (const ev of data.events) {
      if (!existingEvents.has(ev.id)) {
        await saveEvent(ev);
        added++;
      }
    }
    state.notes = await getNotes();
    state.events = await getEvents();
    render();
    toast(added ? `Importación lista: ${added} ${added === 1 ? 'elemento' : 'elementos'} nuevo(s) o actualizado(s)` : 'Nada nuevo que importar');
  } catch (err) {
    alert(err.message || 'No se pudo importar el archivo.');
  }
}

// ============ LISTENERS ============
function setupEventListeners() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      state.currentView = tab.dataset.view;
      render();
      window.scrollTo(0, 0);
    });
  });

  $('btn-new-note').addEventListener('click', () => openNoteModal());
  $('btn-new-event').addEventListener('click', () => openEventModal());

  // Búsqueda
  const runSearch = debounce(() => render(), 150);
  $('search').addEventListener('input', e => {
    state.query = e.target.value.trim();
    runSearch();
  });

  // Menú
  $('btn-menu').addEventListener('click', e => {
    e.stopPropagation();
    $('menu').classList.toggle('hidden');
  });
  $('menu').addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (btn) handleMenu(btn.dataset.action);
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#menu') && !e.target.closest('#btn-menu')) closeMenu();
  });
  $('import-file').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) importFile(file);
    e.target.value = '';
  });

  // Tarjetas y eventos (delegación)
  const container = $('app-container');

  container.addEventListener('change', e => {
    const box = e.target.closest('.check-toggle');
    if (!box) return;
    const card = box.closest('[data-note-id]');
    toggleChecklistLine(card.dataset.noteId, Number(box.dataset.line));
  });

  container.addEventListener('click', async e => {
    // Las casillas se manejan en 'change'; no abrir la nota al marcarlas
    if (e.target.closest('.check-line')) return;

    const delBtn = e.target.closest('[data-delete-note]');
    if (delBtn) {
      e.stopPropagation();
      await deleteNoteById(delBtn.dataset.deleteNote);
      return;
    }

    const card = e.target.closest('[data-note-id]');
    if (card) {
      const note = state.notes.find(n => n.id === card.dataset.noteId);
      if (note) openNoteModal(note);
      return;
    }

    const item = e.target.closest('[data-event-id]');
    if (item) {
      const ev = state.events.find(x => x.id === item.dataset.eventId);
      if (ev) openEventModal(ev);
    }
  });

  container.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.target.matches('input, button')) return;
    const el = e.target.closest('[data-note-id], [data-event-id]');
    if (el) el.click();
  });

  // Modal de nota
  $('note-title').addEventListener('input', onNoteInput);
  $('note-body').addEventListener('input', onNoteInput);
  $('note-color').addEventListener('change', () => {
    $('note-modal').className = `modal paper-${$('note-color').value}`;
    onNoteInput();
  });
  // Barra del editor (mousedown evita que el teclado del teléfono se cierre)
  ['tb-list', 'tb-table', 'tb-style'].forEach(id =>
    $(id).addEventListener('mousedown', e => e.preventDefault()));
  $('tb-list').addEventListener('click', insertList);
  $('tb-table').addEventListener('click', insertTable);
  $('tb-style').addEventListener('click', () => toggleStylePanel());
  ['note-font', 'note-size', 'note-ink'].forEach(id =>
    $(id).addEventListener('change', () => { applyEditorStyle(); onNoteInput(); }));
  $('note-body').addEventListener('keydown', handleEditorEnter);

  $('note-pin').addEventListener('click', () => {
    state.draftPinned = !state.draftPinned;
    setPinButton();
    autosave.cancel();
    persistNote();
  });
  $('note-delete').addEventListener('click', async () => {
    const id = state.editingNote?.id;
    if (!id) return closeNoteModal();
    autosave.cancel();
    await saveChain;
    if (await deleteNoteById(id)) {
      $('note-overlay').classList.add('hidden');
      state.editingNote = null;
      popModalState();
    }
  });
  $('note-close').addEventListener('click', () => closeNoteModal());
  $('note-done').addEventListener('click', () => closeNoteModal());
  $('note-overlay').addEventListener('click', e => {
    if (e.target.id === 'note-overlay') closeNoteModal();
  });

  // Modal de evento
  $('event-form').addEventListener('submit', submitEvent);
  $('event-close').addEventListener('click', () => closeEventModal());
  $('event-delete').addEventListener('click', deleteCurrentEvent);
  $('event-overlay').addEventListener('click', e => {
    if (e.target.id === 'event-overlay') closeEventModal();
  });

  // Guardar si la app pasa a segundo plano con una nota abierta
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && !$('note-overlay').classList.contains('hidden')) {
      autosave.cancel();
      persistNote();
    }
  });

  // Atajos de teclado
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeMenu();
      closeNoteModal();
      closeEventModal();
      return;
    }
    if (e.target.matches('input, textarea, select')) return;
    const modalOpen = !$('note-overlay').classList.contains('hidden') || !$('event-overlay').classList.contains('hidden');
    if (modalOpen) return;
    if (e.key === 'n') { e.preventDefault(); openNoteModal(); }
    if (e.key === 'e') { e.preventDefault(); openEventModal(); }
    if (e.key === '/') { e.preventDefault(); $('search').focus(); }
  });
}

// ============ INICIO ============
async function init() {
  try {
    await openDB();
    state.notes = await getNotes();
    state.events = await getEvents();
  } catch (err) {
    console.error(err);
    $('view-hoy').innerHTML = '<div class="empty-state"><p>No se pudo abrir la base de datos de este navegador.</p></div>';
    return;
  }

  setupEventListeners();
  render();

  checkReminders = setupReminders({
    getEvents: () => state.events,
    markSent: async event => {
      const updated = { ...event, reminderSent: true };
      await saveEvent(updated);
      upsert(state.events, updated);
    },
    onFired: due => {
      toast(`🔔 ${due.map(e => e.title).join(', ')}`, 6000);
      render();
    }
  });
}

init();
