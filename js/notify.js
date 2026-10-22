// ===== Lull — reminders =====
// Honest about what a web app can do: a notification is scheduled with a timer
// inside the page/service worker, so it fires reliably while Lull is open or
// recently backgrounded (install it to the home screen for the best chance).
// It is NOT a guaranteed alarm clock the way a native app can be — if the phone
// fully evicts the app, the reminder waits until you open it again. The in-app
// countdown is always correct regardless.

import { MIN, clock } from './util.js?v=13';

let timers = [];
const LEAD_MIN = 10;

export const supported = () => 'Notification' in self;
export const permission = () => (supported() ? Notification.permission : 'unsupported');

export async function request() {
  if (!supported()) return 'unsupported';
  try { return await Notification.requestPermission(); } catch { return 'denied'; }
}

function clear() { timers.forEach(clearTimeout); timers = []; }

async function fire(title, body, tag) {
  if (permission() !== 'granted') return;
  const opts = { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png',
                 silent: false, requireInteraction: false };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, opts);
    else new Notification(title, opts);
  } catch { try { new Notification(title, opts); } catch {} }
}

/**
 * Re-arm reminders from the current prediction. Called whenever the log changes.
 * @param p prediction snapshot from predict()
 * @param name baby's name
 */
export function schedule(p, name = 'Baby', enabled = true) {
  clear();
  if (!enabled || permission() !== 'granted') return;
  const now = Date.now();
  const who = name || 'Baby';

  if (p.state === 'awake' && p.nextSleepAt) {
    const soon = p.nextSleepAt - LEAD_MIN * MIN;
    if (soon > now) {
      timers.push(setTimeout(() => fire(
        p.isBedtime ? `Bedtime soon` : `Nap window opening`,
        `${who} has been awake a while — ${p.isBedtime ? 'bedtime' : 'next nap'} around ${clock(p.nextSleepAt)}.`,
        'lull-window'), soon - now));
    }
    const closing = p.nextSleepRange ? p.nextSleepRange[1] : null;
    if (closing && closing > now) {
      timers.push(setTimeout(() => fire(
        `Window closing`,
        `${who} is at the end of the usual awake window.`,
        'lull-closing'), closing - now));
    }
  }

  if (p.state === 'asleep' && p.expectedWakeAt && p.expectedWakeAt > now) {
    timers.push(setTimeout(() => fire(
      `${who} may be waking`,
      `This nap is around the usual length.`,
      'lull-wake'), p.expectedWakeAt - now));
  }
}

export function stopAll() { clear(); }
