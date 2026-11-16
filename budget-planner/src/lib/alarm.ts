import type { AlertLevel } from './plan';

/** A short alarm made with the Web Audio API (no sound file needed). Louder pattern for worse alerts. */
export function playAlarm(level: AlertLevel): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const tones = level === 'near-plan' ? [660, 880] : [880, 660, 880, 660];
    tones.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = level === 'over-income' ? 'square' : 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.2;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(level === 'over-income' ? 0.12 : 0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.19);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1500);
  } catch {
    // Audio unavailable (or blocked): the on-screen warning still shows.
  }
}

export type NotifyPermission = NotificationPermission | 'unsupported';

export function notificationPermission(): NotifyPermission {
  return typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported';
}

/** Ask to show notifications. Must be called from a click. */
export async function requestNotifications(): Promise<NotifyPermission> {
  if (notificationPermission() === 'unsupported') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return notificationPermission();
  }
}

/** Show a system notification if allowed. Uses the service worker where pages can't show one (Android). */
export function sendNotification(title: string, body: string): void {
  if (notificationPermission() !== 'granted') return;
  const options = { body, icon: './icon-192.png', tag: 'ledgerly-alert' };
  const viaWorker = () =>
    navigator.serviceWorker?.getRegistration().then((r) => r?.showNotification(title, options)).catch(() => {});
  try {
    if (navigator.serviceWorker?.controller) void viaWorker();
    else new Notification(title, options);
  } catch {
    void viaWorker();
  }
}
