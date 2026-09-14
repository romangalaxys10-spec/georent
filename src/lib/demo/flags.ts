/**
 * Demo-mode flag. On Vercel (serverless) there is no persistent SQLite and
 * no scanner mini-service, so the app runs in a fully stateless demo mode:
 *
 *  - alerts + seen-listing baseline + notification feed live in the browser
 *    (localStorage via the zustand demo store);
 *  - POST /api/demo/scan classifies korter listings against that baseline
 *    on the server, statelessly;
 *  - socket.io / Prisma paths are skipped entirely.
 *
 * `NEXT_PUBLIC_DEMO_MODE=1` is inlined at build time — set it in the Vercel
 * project env. Locally it stays unset and the full stack runs (dev server +
 * scanner on :3030 + SQLite).
 */
export const isDemo = (): boolean =>
  process.env.NEXT_PUBLIC_DEMO_MODE === '1';
