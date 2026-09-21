// Entrance transition for every /connections/* subpage (requests/all/
// suggested/activity) -- "Opening Requests -> slides in /connections/requests
// from the right" etc, per spec. A plain mount-time slide (no AnimatePresence
// pair) rather than a router-level transition system: these are real routes
// (so deep links, browser back/forward, and an edge-swipe-back gesture all
// keep working for free), and only the forward/entering direction needs an
// animation for the "opening a dedicated subpage" feel -- going back is a
// normal, instant route pop, not a fourth animation to maintain.
import { motion } from 'motion/react';
import type { ReactNode } from 'react';

export function ConnectionsSlideIn({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      transition={{ type: 'spring', damping: 32, stiffness: 340, mass: 0.9 }}
      className="min-h-screen bg-gray-50"
    >
      {children}
    </motion.div>
  );
}
