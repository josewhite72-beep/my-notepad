import { run } from './database.js';

export async function getNotes() {
  const notes = await run('notes', 'readonly', store => store.getAll());
  return (notes || []).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveNote(note) {
  await run('notes', 'readwrite', store => store.put(note));
  return note;
}

export function deleteNote(id) {
  return run('notes', 'readwrite', store => store.delete(id));
}
