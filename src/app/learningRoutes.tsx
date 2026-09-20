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
// Learning page's internal links. React Router prepends/strips the
// basename for you, so the exact same tree serves two different real URL
// shapes (same dual-reachability pattern as adminRoutes.tsx):
//   filmons.app/learning/...      (basename '/learning', today's setup)
//   learning.filmons.app/...      (basename '', once that subdomain/DNS
//                                   record exists -- see
//                                   createLearningRouter below)
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

// learning.html (this bundle's entry) is reachable two ways -- see
// vercel.json: filmons.app/learning/* (path-based rewrite, works today)
// and learning.filmons.app/* (host-based rewrite, works once that domain
// + DNS record are added in Vercel). Same JS, same route tree, only the
// basename differs, decided once at router-creation time from the
// hostname actually serving the page -- identical pattern to
// createAdminRouter() in adminRoutes.tsx.
export function createLearningRouter() {
  const onDedicatedSubdomain = typeof window !== 'undefined'
    && window.location.hostname === 'learning.filmons.app';
  return createBrowserRouter(learningRouteTree, {
    basename: onDedicatedSubdomain ? '/' : '/learning',
  });
}
