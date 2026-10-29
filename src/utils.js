export function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Escapa el texto y resalta las coincidencias de la búsqueda con <mark>
export function highlight(text, query) {
  const raw = String(text ?? '');
  if (!query) return escapeHTML(raw);
  const q = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Se divide el texto original y se escapa cada trozo por separado
  return raw.split(new RegExp(`(${q})`, 'gi'))
    .map((part, i) => i % 2 ? `<mark>${escapeHTML(part)}</mark>` : escapeHTML(part))
    .join('');
}

export const LOCALE = 'es-PA';

export function formatTime(ts) {
  return new Date(ts).toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit' });
}

export function formatDate(ts) {
  return new Date(ts).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function debounce(fn, ms) {
  let t;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

// Convierte fecha y hora locales (de los inputs) a timestamp
export function toTimestamp(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, min] = timeStr.split(':').map(Number);
  return new Date(y, m - 1, d, h, min).getTime();
}

// Timestamp a valores para <input type="date"> y <input type="time">
export function toInputValues(ts) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`
  };
}
