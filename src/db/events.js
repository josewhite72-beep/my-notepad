import { run } from './database.js';

export async function getEvents() {
  const events = await run('events', 'readonly', store => store.getAll());
  return (events || []).sort((a, b) => a.startAt - b.startAt);
}

export async function saveEvent(event) {
  await run('events', 'readwrite', store => store.put(event));
  return event;
}

export function deleteEvent(id) {
  return run('events', 'readwrite', store => store.delete(id));
}
