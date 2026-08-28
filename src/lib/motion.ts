/**
 * Motion for React animation presets and timing curves.
 * Designed for fast, calm, physical feedback without delaying interaction.
 */

export const transitions = {
  fast: { duration: 0.14, ease: [0.2, 0, 0, 1] },
  normal: { duration: 0.22, ease: [0.2, 0, 0, 1] },
  emphasis: { duration: 0.32, ease: [0.16, 1, 0.3, 1] },
  spring: { type: 'spring', stiffness: 450, damping: 30 },
} as const;

export const pageEntranceVariants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: transitions.normal },
  exit: { opacity: 0, y: -4, transition: transitions.fast },
};

export const cardEntranceVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: transitions.normal },
};

export const listStaggerContainer = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.02,
    },
  },
};

export const modalVariants = {
  initial: { opacity: 0, scale: 0.98, y: 6 },
  animate: { opacity: 1, scale: 1, y: 0, transition: transitions.normal },
  exit: { opacity: 0, scale: 0.98, y: 4, transition: transitions.fast },
};

export const interactiveTap = {
  whileHover: { y: -1 },
  whileTap: { scale: 0.98 },
  transition: transitions.fast,
};
