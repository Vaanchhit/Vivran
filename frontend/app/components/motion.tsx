"use client";

// Small motion vocabulary used across the app, so every page moves the same way:
// short (≤ 250 ms), only opacity and position, and off when the device asks for
// reduced motion (MotionConfig in app/(app)/teacher/template.tsx).
import { motion, type HTMLMotionProps } from "framer-motion";

const EASE = [0.2, 0.7, 0.2, 1] as const;

/** A container whose direct <Item> children arrive one after another. */
export function Stagger({ children, className, delay = 0, ...rest }: HTMLMotionProps<"div"> & { delay?: number }) {
  return (
    <motion.div className={className} initial="hidden" animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: delay } } }} {...rest}>
      {children}
    </motion.div>
  );
}

export function Item({ children, className, ...rest }: HTMLMotionProps<"div">) {
  return (
    <motion.div className={className}
      variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: EASE } } }} {...rest}>
      {children}
    </motion.div>
  );
}
