import type { FrameClock } from './loop';

/** requestAnimationFrame + performance.now tabanlı gerçek saat. */
export const browserClock: FrameClock = {
  now: () => globalThis.performance.now(),
  requestFrame: (callback) => globalThis.requestAnimationFrame(() => callback()),
  cancelFrame: (id) => globalThis.cancelAnimationFrame(id),
};
