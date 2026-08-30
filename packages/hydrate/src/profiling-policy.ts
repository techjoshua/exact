/**
 * Detailed hydration phases are enabled only by an explicit diagnostic bundle transform. The
 * installed-package default lets production bundlers erase phase timers while retaining the
 * established aggregate hydration observation.
 */
export const hydrationPhaseProfiling = false;
