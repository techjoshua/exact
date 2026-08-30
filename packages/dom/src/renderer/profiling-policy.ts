/**
 * Detailed DOM phase timing is replaced by the comparison profiler at bundle time. Keeping the
 * installed-package default constant lets production bundlers erase the phase timer and its call
 * sites when an application did not explicitly select the diagnostic build.
 */
export const domPhaseProfiling = false;
