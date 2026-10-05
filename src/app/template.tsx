"use client";

import { motion, useReducedMotion } from "framer-motion";
import { tween } from "@/lib/motion";

/** Page transitions between primary areas: a short lift and fade, never dramatic. */
export default function Template({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div initial={reduce ? false : { opacity: 0, y: 8, scale: 0.995 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={tween("normal")}>
      {children}
    </motion.div>
  );
}
