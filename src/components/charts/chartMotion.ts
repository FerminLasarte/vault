// How every chart in the app moves.
//
// Recharts animates in JavaScript, not in CSS, so `--duration-base` and
// `--ease-standard` cannot reach it, and its own defaults run a donut sweep
// for 1.5 s and the bars for 400 ms. These are the tokens written out again,
// and `chartMotion.test.ts` fails if they drift apart.
//
// Spread onto every series and tooltip. Recharts' `isAnimationActive` stays at
// its `'auto'` default, which is what honours reduced motion.
export const chartAnimation = {
  animationDuration: 180,
  animationEasing: "cubic-bezier(0.2,0,0,1)",
} as const;
