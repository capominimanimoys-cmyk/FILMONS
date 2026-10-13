// Everything cached on this device that belongs to an account. Cleared on sign-out so the next person
// (or guest) on the same browser never sees the previous account's data, even for a moment.
import { clearReadCache } from './supabase';
import { clearProfileCache } from '../app/lib/profileCache';

export function clearPrivateCaches() {
  try { clearReadCache(); } catch { /* ignore */ }
  try { clearProfileCache(); } catch { /* ignore */ }
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k && (k.startsWith('filmons:discovery:') || k.startsWith('filmons:location-page:'))) sessionStorage.removeItem(k);
    }
  } catch { /* storage unavailable */ }
  try { window.dispatchEvent(new CustomEvent('filmons:signed-out')); } catch { /* ignore */ }
}
