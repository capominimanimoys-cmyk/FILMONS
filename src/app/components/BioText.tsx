// Profile bio text with tappable links, #hashtags and @mentions. Plain text elsewhere stays plain.
import { useNavigate } from 'react-router';
import { normalizeExternalLink } from '../lib/externalLink';

const TOKEN = /(https?:\/\/[^\s]+|www\.[^\s]+|#\w+|@\w+)/g;

export function BioText({ text, className = '' }: { text: string; className?: string }) {
  const navigate = useNavigate();
  const parts = text.split(TOKEN);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0 || !part) return <span key={i}>{part}</span>;
        if (part[0] === '#' || part[0] === '@') {
          const isTag = part[0] === '#';
          return (
            <button key={i} type="button" className={`font-semibold text-blue-600 hover:underline ${className}`}
              onClick={e => { e.stopPropagation(); navigate(isTag ? `/search/hashtags/${part.slice(1).toLowerCase()}` : `/${part.slice(1)}`); }}>
              {part}
            </button>
          );
        }
        // A link: keep trailing punctuation ("see example.com.") outside it.
        const m = part.match(/^(.*?)([.,;:!?)\]]*)$/);
        const url = m ? m[1] : part;
        const tail = m ? m[2] : '';
        const safe = normalizeExternalLink(url);
        if (!safe) return <span key={i}>{part}</span>;
        return (
          <span key={i}>
            <a href={safe} target="_blank" rel="noopener noreferrer nofollow" onClick={e => e.stopPropagation()}
              className={`font-semibold text-blue-600 hover:underline break-all ${className}`}>{url}</a>{tail}
          </span>
        );
      })}
    </>
  );
}
