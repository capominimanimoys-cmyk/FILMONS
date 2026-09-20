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
// Learning page's internal links. Filmons Learning is reachable ONLY at
// learning.filmons.app in production (see learningOrigin.ts -- there is
// no filmons.app/learning path at all anymore); the sole exception is a
// localhost-only dev fallback (basename '/learning' there, since local
// dev has no second subdomain/port to point at) -- see
// createLearningRouter below.
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

// learning.html (this bundle's entry) is reachable at learning.filmons.app
// (see vercel.json's host-based rewrite) once that domain + DNS record are
// added in Vercel -- until then it's only reachable via local dev's
// basename '/learning' fallback below. Basename is decided once at
// router-creation time from the hostname actually serving the page.
export function createLearningRouter() {
  const isLocalDev = typeof window !== 'undefined'
    && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  return createBrowserRouter(learningRouteTree, {
    basename: isLocalDev ? '/learning' : '/',
  });
}
