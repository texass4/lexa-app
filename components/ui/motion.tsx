"use client"

import { motion, type HTMLMotionProps } from "framer-motion"

const ease = [0.22, 1, 0.36, 1] as const

export function FadeIn({ delay = 0, y = 8, ...props }: HTMLMotionProps<"div"> & { delay?: number; y?: number }) {
  return <motion.div initial={{ opacity: 0, y }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease, delay }} {...props} />
}
