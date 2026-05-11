import { MotionConfig, motion } from "motion/react";
import type { HTMLMotionProps, Transition } from "motion/react";

const DASHBOARD_EASE = [0.22, 1, 0.36, 1] as const;

const dashboardSpring = {
  type: "spring",
  stiffness: 460,
  damping: 38,
  mass: 0.72,
} satisfies Transition;

const dashboardEntrance = {
  hidden: { opacity: 0, y: 8, scale: 0.985 },
  visible: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 6, scale: 0.985 },
};

export function DashboardMotionRoot(props: HTMLMotionProps<"main">) {
  return (
    <MotionConfig reducedMotion="user" transition={dashboardSpring}>
      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.16, ease: DASHBOARD_EASE }}
        {...props}
      />
    </MotionConfig>
  );
}

export function DashboardMotionPanel(props: HTMLMotionProps<"section">) {
  return (
    <motion.section
      layout
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={dashboardEntrance}
      transition={{ duration: 0.2, ease: DASHBOARD_EASE }}
      {...props}
    />
  );
}

export function DashboardMotionAside(props: HTMLMotionProps<"aside">) {
  return (
    <motion.aside
      layout
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={dashboardEntrance}
      transition={{ duration: 0.2, ease: DASHBOARD_EASE }}
      {...props}
    />
  );
}

export function DashboardMotionList(props: HTMLMotionProps<"div">) {
  return <motion.div layout transition={dashboardSpring} {...props} />;
}

export function DashboardMotionItem(props: HTMLMotionProps<"article">) {
  return (
    <motion.article
      layout
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={dashboardEntrance}
      transition={{ duration: 0.18, ease: DASHBOARD_EASE }}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.992 }}
      {...props}
    />
  );
}

export function DashboardMotionDialogBackdrop(props: HTMLMotionProps<"div">) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.14, ease: DASHBOARD_EASE }}
      {...props}
    />
  );
}

export function DashboardMotionDialog(props: HTMLMotionProps<"section">) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.985 }}
      transition={{ duration: 0.18, ease: DASHBOARD_EASE }}
      {...props}
    />
  );
}
