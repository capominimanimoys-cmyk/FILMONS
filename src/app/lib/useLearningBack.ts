// Back inside FILMONS Learning: the previous Learning page when there is
// one in this tab's Learning history, otherwise `fallback` (the Learning
// home by default). Plain navigate(-1) would leave Learning entirely when
// the page was opened straight from FILMONS, a shared link or a reload.
import { useCallback } from 'react';
import { useNavigate } from 'react-router';

export function useLearningBack(fallback = '/') {
  const navigate = useNavigate();
  return useCallback(() => {
    // React Router numbers its own history entries; 0 = the first page this
    // Learning app loaded, so there's nothing in Learning to go back to.
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  }, [navigate, fallback]);
}
