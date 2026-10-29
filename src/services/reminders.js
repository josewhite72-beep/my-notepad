let audioCtx;
let timer;

function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch { /* sin audio disponible */ }
}

// El audio solo puede arrancar tras un gesto del usuario
document.addEventListener('click', unlockAudio, { once: true });
document.addEventListener('touchstart', unlockAudio, { once: true });

function playBeep() {
  if (audioCtx && audioCtx.state === 'running') {
    const t = audioCtx.currentTime;
    [0, 0.6].forEach(offset => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, t + offset);
      gain.gain.exponentialRampToValueAtTime(0.01, t + offset + 0.5);
      osc.start(t + offset);
      osc.stop(t + offset + 0.5);
    });
  }
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}

export function notificationsSupported() {
  return 'Notification' in window;
}

// Debe llamarse desde un gesto del usuario (clic), si no Chrome lo bloquea
export async function requestNotificationPermission() {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

async function showNotification(title, body, tag) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  const options = { body, tag, icon: 'icon-192.png', badge: 'icon-192.png', vibrate: [200, 100, 200] };
  try {
    // En Android, new Notification() lanza error: hay que usar el Service Worker
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, options);
        return;
      }
    }
    new Notification(title, options);
  } catch (err) {
    console.warn('No se pudo mostrar la notificación:', err);
  }
}

/**
 * getEvents: función que devuelve la lista actual de eventos
 * markSent:  función async que guarda reminderSent = true en IndexedDB
 * onFired:   función que recibe los eventos avisados (para mostrar aviso en pantalla)
 */
export function setupReminders({ getEvents, markSent, onFired }) {
  const check = async () => {
    const now = Date.now();
    const due = getEvents().filter(e => e.reminderAt && e.reminderAt <= now && !e.reminderSent);
    if (!due.length) return;

    playBeep();
    for (const event of due) {
      await showNotification(event.title, event.detail || 'Recordatorio', event.id);
      await markSent(event);
    }
    onFired?.(due);
  };

  clearInterval(timer);
  timer = setInterval(check, 30000);

  // Al volver a la app, revisar de inmediato (Android congela los timers en segundo plano)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });

  check();
  return check;
}
