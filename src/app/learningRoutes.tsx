import { createBrowserRouter } from 'react-router';
import { LearningLayout } from './components/learning/LearningLayout';
import { CoursesHome } from './pages/CoursesHome';
import { MyLearning } from './pages/MyLearning';
import { CreateCourse } from './pages/CreateCourse';
import { CourseDetail } from './pages/CourseDetail';
import { CourseContent } from './pages/CourseContent';
import { LearningPlayer } from './pages/LearningPlayer';

// Every path below is written RELATIVE TO THE BASENAME -- never hardcode
// '/learning' anywhere in this tree, in LearningHeader's nav, or in any
// Learning page's internal links. Filmons Learning is reachable BOTH at
// filmons.app/learning (same-origin path, works with zero DNS/domain setup
// -- see vercel.json's /learning + /learning/(.*) rewrites) AND at
// learning.filmons.app (a real separate origin, once that domain is added
// in Vercel -- see learningOrigin.ts) -- both serve this exact same bundle
// and route tree, just under a different basename. See createLearningRouter
// below for how that's decided.
const learningRouteTree = [
  {
    path: '/',
    Component: LearningLayout,
    children: [
      { index: true, Component: CoursesHome },
      { path: 'my-learning', Component: MyLearning },
      { path: 'create', Component: CreateCourse },
      { path: 'course/:courseId', Component: CourseDetail },
      { path: 'course/:courseId/content', Component: CourseContent },
      { path: 'course/:courseId/lesson/:lessonId', Component: LearningPlayer },
    ],
  },
];

// Basename is decided once at router-creation time from the hostname
// actually serving the page: the dedicated subdomain gets basename '/'
// (it IS the root there); every other host (filmons.app, localhost) gets
// basename '/learning', since the bundle is reached under that path prefix
// there (see vercel.json's /learning + /learning/(.*) rewrites, and
// localhost's own dev-server equivalent).
export function createLearningRouter() {
  const isLearningSubdomain = typeof window !== 'undefined' && window.location.hostname === 'learning.filmons.app';
  return createBrowserRouter(learningRouteTree, {
    basename: isLearningSubdomain ? '/' : '/learning',
  });
}
