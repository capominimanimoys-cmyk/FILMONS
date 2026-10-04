import { useNavigate } from 'react-router';
import { SearchOverlay } from '../components/SearchOverlay';

export function SearchPage() {
  const navigate = useNavigate();
  return (
    <SearchOverlay
      // Back from Browse Search always lands on Home, not wherever history
      // points -- Connect's landing replaces itself with /search (see
      // ConnectCategoryHeader), so navigate(-1) could bounce between them.
      onClose={() => navigate('/', { replace: true })}
      onResultNavigate={(url, state) => navigate(url, { replace: true, state })}
    />
  );
}
