/**
 * StoriesRow.tsx
 * Instagram-style horizontal stories strip.
 * - "Your Story" card (create or re-view own story)
 * - Other users' stories (ring = unviewed, gray = viewed)
 * - Opens StoryCreator or StoryViewer on tap
 */
import { useState, useEffect, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getStories, getStoriesFromDB, saveStory, Story, StoryCreator } from './StoryCreator';
import { StoryViewer } from './StoryViewer';

export function StoriesRow() {
  const { user } = useAuth();
  const [stories, setStories]         = useState<Story[]>([]);
  const [showCreator, setShowCreator] = useState(false);
  const [appendToStory, setAppendToStory] = useState<Story | null>(null);
  const [viewerOpen, setViewerOpen]   = useState(false);
  const [viewerIdx,  setViewerIdx]    = useState(0);

  const refresh = useCallback(async () => {
    // Show local immediately, then update from DB
    setStories(getStories());
    const dbStories = await getStoriesFromDB();
    setStories(dbStories);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const myStory  = user ? stories.find(s => s.userId === user.id) : null;
  const others   = stories.filter(s => s.userId !== user?.id);
  // Unviewed first
  const sorted   = [
    ...others.filter(s => !s.viewedBy.includes(user?.id ?? '')),
    ...others.filter(s =>  s.viewedBy.includes(user?.id ?? '')),
  ];

  const openViewer = (story: Story) => {
    const allToShow = myStory ? [myStory, ...sorted] : sorted;
    const idx = allToShow.findIndex(s => s.id === story.id);
    setViewerIdx(Math.max(0, idx));
    setViewerOpen(true);
  };

  const allStoriesForViewer = myStory ? [myStory, ...sorted] : sorted;

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
        <div className="flex gap-4 overflow-x-auto pb-1 scrollbar-hide">

          {/* Your Story */}
          <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
            <div className="relative">
              {/* Avatar — tap to view if story exists, tap to create if not */}
              <div
                className={`w-14 h-14 rounded-full flex items-center justify-center overflow-hidden border-2 cursor-pointer ${
                  myStory ? 'border-blue-500' : 'border-gray-200'
                }`}
                onClick={() => myStory ? openViewer(myStory) : setShowCreator(true)}
              >
                {user?.avatar
                  ? <img src={user.avatar} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full bg-gradient-to-br from-blue-400 to-purple-600 flex items-center justify-center text-white text-lg font-bold">
                      {user?.name?.[0] ?? '?'}
                    </div>
                }
              </div>

              {/* Slide count badge when >1 slide */}
              {myStory && myStory.slides.length > 1 && (
                <div className="absolute -top-0.5 -left-0.5 w-5 h-5 bg-blue-600 rounded-full border-2 border-white flex items-center justify-center">
                  <span className="text-white text-[9px] font-black">{myStory.slides.length}</span>
                </div>
              )}

              {/* Always show + button when logged in */}
              {user && (
                <button
                  onClick={e => { e.stopPropagation(); setAppendToStory(myStory || null); setShowCreator(true); }}
                  className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-blue-500 hover:bg-blue-600 rounded-full border-2 border-white flex items-center justify-center transition-colors"
                  title={myStory ? 'Add to your story' : 'Create story'}
                >
                  <Plus className="w-3 h-3 text-white" strokeWidth={3} />
                </button>
              )}
            </div>
            <span className="text-[10px] font-medium text-gray-700 text-center w-14 truncate">
              {myStory ? 'Your story' : 'Add story'}
            </span>
          </div>

          {/* Other stories */}
          {sorted.map(story => {
            const isViewed = story.viewedBy.includes(user?.id ?? '');
            const firstSlide = story.slides[0];
            return (
              <div key={story.id}
                className="flex flex-col items-center gap-1.5 flex-shrink-0 cursor-pointer"
                onClick={() => openViewer(story)}>
                <div className={`w-14 h-14 rounded-full overflow-hidden border-2 ${
                  isViewed ? 'border-gray-300' : 'border-transparent'
                } ${!isViewed ? 'p-0.5 bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600' : ''}`}>
                  <div className="w-full h-full rounded-full overflow-hidden bg-gray-100">
                    {firstSlide?.url && firstSlide.type === 'image'
                      ? <img src={firstSlide.url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-xl"
                          style={{ background: firstSlide?.bgColor || '#667eea' }}>
                          {story.userName[0]}
                        </div>
                    }
                  </div>
                </div>
                <span className={`text-[10px] font-medium text-center w-14 truncate ${isViewed ? 'text-gray-400' : 'text-gray-700'}`}>
                  {story.userName.split(' ')[0]}
                </span>
              </div>
            );
          })}

          {/* Empty state when no stories */}
          {stories.length === 0 && !user && (
            <div className="flex items-center text-xs text-gray-400 py-2">
              Sign in to see stories
            </div>
          )}
        </div>
      </div>

      {showCreator && (
        <StoryCreator
          onClose={() => { setShowCreator(false); setAppendToStory(null); }}
          onPublished={(newStory) => {
            if (appendToStory && newStory) {
              // Append new slide to existing story
              const updated: Story = {
                ...appendToStory,
                slides: [...appendToStory.slides, ...newStory.slides],
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
              };
              saveStory(updated);
            }
            refresh();
            setShowCreator(false);
            setAppendToStory(null);
          }}
        />
      )}

      {viewerOpen && allStoriesForViewer.length > 0 && (
        <StoryViewer
          stories={allStoriesForViewer}
          initialIndex={viewerIdx}
          onClose={() => { setViewerOpen(false); refresh(); }}
          onStoriesUpdate={refresh}
        />
      )}
    </>
  );
}