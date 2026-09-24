-- Portfolio Album UX overhaul, Phase 0: album visibility adopts the same
-- 'connections' audience model Posts already use (mutual, accepted
-- professional_connections), replacing the one-way 'followers' value.
-- Data-only migration -- portfolio_albums.visibility is a free-text column,
-- no schema change needed. Existing 'followers' albums become 'connections'
-- albums; every other value (public/private) is untouched.

update portfolio_albums
set visibility = 'connections'
where visibility = 'followers';
