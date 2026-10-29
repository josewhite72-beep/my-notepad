const FORMAT = 'cuaderno-backup';
const VERSION = 1;

export function exportData(notes, events) {
  const data = {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    notes,
    events
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `cuaderno-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function isValidNote(n) {
  return n && typeof n.id === 'string' && typeof n.updatedAt === 'number';
}

function isValidEvent(e) {
  return e && typeof e.id === 'string' && typeof e.title === 'string' && typeof e.startAt === 'number';
}

// Lee el archivo y devuelve { notes, events } ya validados
export async function readBackup(file) {
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('El archivo no es un JSON válido.');
  }
  if (!data || data.format !== FORMAT) {
    throw new Error('Este archivo no es una copia de Cuaderno.');
  }
  const notes = (Array.isArray(data.notes) ? data.notes : []).filter(isValidNote).map(n => ({
    id: n.id,
    title: String(n.title || ''),
    body: String(n.body || ''),
    color: n.color || 'yellow',
    pinned: !!n.pinned,
    tags: Array.isArray(n.tags) ? n.tags : [],
    createdAt: n.createdAt || n.updatedAt,
    updatedAt: n.updatedAt
  }));
  const events = (Array.isArray(data.events) ? data.events : []).filter(isValidEvent).map(e => ({
    id: e.id,
    title: e.title,
    detail: String(e.detail || ''),
    startAt: e.startAt,
    endAt: e.endAt ?? null,
    reminderAt: e.reminderAt ?? null,
    reminderSent: !!e.reminderSent,
    createdAt: e.createdAt || Date.now()
  }));
  return { notes, events };
}
