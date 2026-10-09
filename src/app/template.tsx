"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect } from "react";
import { tween } from "@/design-system/motion";

/** Set once the app is running in the browser: from then on, page changes animate. */
let navigated = false;

/**
 * Page transitions between primary areas: a short lift and fade, never dramatic.
 * The first page a visitor opens is shown as it arrives from the server — never hidden
 * waiting for JavaScript (on a slow phone that was a blank screen for seconds). Only later
 * page changes, already in the browser, get the quick transition.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const animate = !reduce && navigated;
  useEffect(() => {
    navigated = true;
  }, []);
  return (
    <motion.div initial={animate ? { opacity: 0, y: 6 } : false} animate={{ opacity: 1, y: 0 }} transition={tween("fast")}>
      {children}
    </motion.div>
  );
}
