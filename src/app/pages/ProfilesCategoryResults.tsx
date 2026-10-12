// /search/category/connect/profiles -- the Profiles tab of Connect search: one
// profile card per row (shared with Browse search), "Creators for you" when no
// query is typed. The query stays in the header box and is carried to the other
// tabs by ConnectCategoryHeader.
import { useState } from 'react';
import { ConnectCategoryHeader } from '../components/ConnectCategoryHeader';
import { ProfilesList } from '../components/search/ProfileSearch';

export function ProfilesCategoryResults({ query: initialQuery }: { query?: string }) {
  const [query, setQuery] = useState(initialQuery ?? '');
  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <ConnectCategoryHeader activeCategory="profiles" query={query} onQueryChange={setQuery} placeholder="Search profiles..." />
      <div className="max-w-3xl mx-auto w-full">
        <ProfilesList query={query} onClearQuery={() => setQuery('')} />
      </div>
    </div>
  );
}
