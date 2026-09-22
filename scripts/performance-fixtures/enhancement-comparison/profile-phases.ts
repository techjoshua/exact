/** Optional diagnostic observer; ordinary timing runs leave it absent. Failed phases abort capture. */
export type ObservePhase = (
	phase: 'mount' | 'updates' | 'hydration' | 'string' | 'stream',
	entering: boolean
) => void;
