import { useEffect, useState } from 'react';

/** Product rule: nothing may load for more than 5 seconds. */
export const LOAD_DEADLINE_MS = 5000;

/** True once `loading` has been true for `ms` without finishing -- use it to
 *  swap a spinner/skeleton for a "taking longer than expected" + Retry state. */
export function useLoadDeadline(loading: boolean, ms: number = LOAD_DEADLINE_MS): boolean {
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!loading) { setLate(false); return; }
    const t = setTimeout(() => setLate(true), ms);
    return () => clearTimeout(t);
  }, [loading, ms]);
  return late;
}
