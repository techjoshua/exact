import type * as Reactive from '../../reactive/src/index.js';

/** Verifies source acquisition, disposal, retry and snapshot identity through a single provider. */
export function verifyExternalSourceLifecycle(
	api: Pick<
		typeof Reactive,
		| 'createExternalSource'
		| 'createSelectedExternalSource'
		| 'createEffectScope'
		| 'withEffectScope'
		| 'watch'
		| 'flushSync'
	>
): void;
