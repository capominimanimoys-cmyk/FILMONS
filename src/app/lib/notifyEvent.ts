// Fire-and-forget call to the generic `notify-event` edge function --
// same pattern already inlined at each call site in CreateListing.tsx/
// CreateOpportunity.tsx (search "notify-event" there), pulled into one
// helper for the newer call sites (post/portfolio publish, Connect
// request/response) instead of repeating the fetch boilerplate again.
import { projectId, publicAnonKey } from '/utils/supabase/info';

export function notifyEvent(body: Record<string, unknown>): void {
  fetch(`https://${projectId}.supabase.co/functions/v1/notify-event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
    body: JSON.stringify(body),
  }).catch(() => {});
}
