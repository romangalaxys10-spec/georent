'use client';

/**
 * ScoreRing — 36px deal-score ring per design.md §2/§3.
 *
 * - stroke color: ≥70 signal green, 40–69 neutral, <40 faint (amber is
 *   reserved for price drops per the token semantics);
 * - ring animates stroke-dashoffset 0.6s ease-out on mount; the centered
 *   mono number counts up via useSpring → useTransform;
 * - prefers-reduced-motion: animations are skipped entirely;
 * - title attribute carries the localized label ("Deal score: Excellent").
 */
import { useEffect } from 'react';
import { motion, useReducedMotion, useSpring, useTransform } from 'framer-motion';

const SIZE = 36;
const STROKE = 3;
const R = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

const scoreColor = (score: number): string => {
  if (score >= 70) return 'var(--signal)';
  if (score >= 40) return 'var(--muted)';
  return 'var(--faint)';
};

export function ScoreRing({ score, title }: { score: number; title: string }) {
  const reduced = useReducedMotion();
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const color = scoreColor(clamped);
  const target = CIRCUMFERENCE * (1 - clamped / 100);

  // Count-up: spring value 0 → score, rendered rounded as the ring draws.
  const spring = useSpring(reduced ? clamped : 0, { stiffness: 400, damping: 34 });
  const display = useTransform(spring, (v) => String(Math.round(v)));

  useEffect(() => {
    spring.set(clamped);
  }, [clamped, spring]);

  return (
    <div
      className="relative size-9 shrink-0"
      title={title}
      role="img"
      aria-label={`${title}: ${clamped}`}
    >
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="-rotate-90"
        aria-hidden
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="var(--border-strong)"
          strokeWidth={STROKE}
        />
        <motion.circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          initial={{ strokeDashoffset: CIRCUMFERENCE }}
          animate={{ strokeDashoffset: target }}
          transition={{ duration: reduced ? 0 : 0.6, ease: 'easeOut' }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-[11px] font-semibold tracking-[-0.01em] text-text tnum">
        <motion.span>{display}</motion.span>
      </span>
    </div>
  );
}
