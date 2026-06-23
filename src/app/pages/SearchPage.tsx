import { useNavigate } from 'react-router';
import { SearchOverlay } from '../components/SearchOverlay';

export function SearchPage() {
  const navigate = useNavigate();
  return (
    <SearchOverlay
      onClose={() => navigate(-1)}
      onResultNavigate={(url) => navigate(url, { replace: true })}
    />
  );
}
