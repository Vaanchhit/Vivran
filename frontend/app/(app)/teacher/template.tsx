"use client";

// Remounts on every navigation inside the teacher app, so each page arrives with
// a short fade-and-rise. MotionConfig honours the device's reduced-motion setting.
import { MotionConfig, motion } from "framer-motion";

export default function TeacherTemplate({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}>
        {children}
      </motion.div>
    </MotionConfig>
  );
}
