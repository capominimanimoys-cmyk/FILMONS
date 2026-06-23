import { projectId, publicAnonKey } from '/utils/supabase/info';

const PING_URL = `https://${projectId}.supabase.co/functions/v1/make-server-ec8fe879/health`;
const HEADERS  = { 'Authorization': `Bearer ${publicAnonKey}`, 'Content-Type': 'application/json' };
const INTERVAL = 8 * 60 * 1000; // 8 minutes — allow memory-leaking instances to die

let _timer: ReturnType<typeof setInterval> | null = null;

export function startKeepAlive() {
  if (_timer) return;
  const ping = () => fetch(PING_URL, { method: 'GET', headers: HEADERS, keepalive: true }).catch(() => {});
  _timer = setInterval(ping, INTERVAL); // delayed start — no immediate ping
}

export function stopKeepAlive() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}