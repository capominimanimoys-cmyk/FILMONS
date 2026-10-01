import { Navigate, useParams } from 'react-router';

// Locations/Hashtags are global entities with ONE canonical route each --
// /search/hashtags/:tag and /search/locations/:slug. These two components
// exist only so an old /hashtag/:tag or /search/location/:key link (an
// existing bookmark, a stale deep link, this app's own earlier internal
// links before the rename) still lands somewhere real instead of 404ing --
// a client-side <Navigate replace/>, not a HardRedirect (that one's
// reserved for crossing into the separate admin/learning bundles).
export function LegacyHashtagRedirect() {
  const { tag } = useParams();
  return <Navigate to={`/search/hashtags/${tag}`} replace />;
}

export function LegacyLocationRedirect() {
  const { key } = useParams();
  return <Navigate to={`/search/locations/${key}`} replace />;
}
