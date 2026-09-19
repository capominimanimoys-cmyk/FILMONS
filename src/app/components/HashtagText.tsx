// Shared clickable-hashtag text renderer -- FILMONS Browse Search Hashtag
// Support spec ("hashtags displayed in captions/text should be clickable,
// do not treat hashtags as plain text"). PostCard has its own inline
// version (CaptionText, with truncate/expand built in); this is the
// simpler standalone version for everywhere else that shows a hashtag-
// bearing description (Portfolio items/albums, Courses) and doesn't need
// truncation.
import { useNavigate } from 'react-router';

const HASHTAG_RX = /(#\w+)/g;

export function HashtagText({ text, className }: { text: string; className?: string }) {
  const navigate = useNavigate();
  // .split() with a capturing global regex interleaves matches into the
  // result array at odd indices -- see CaptionText's own comment on why
  // this avoids the stateful global-regex .test() pitfall.
  return (
    <p className={className}>
      {text.split(HASHTAG_RX).map((part, i) =>
        i % 2 === 1 ? (
          <button
            key={i}
            onClick={e => { e.stopPropagation(); navigate(`/hashtag/${part.slice(1).toLowerCase()}`); }}
            className="text-blue-600 font-semibold hover:underline"
          >
            {part}
          </button>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}
