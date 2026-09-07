import type { ExactServerContext } from '@exactjs/server';

/** Reports server failures without letting a failing custom logger interrupt response cleanup. */
export function reportNodeError(
	error: unknown,
	phase: 'request' | 'response' | 'cleanup',
	logger?: ExactServerContext['logger']
): void {
	const scope = { source: 'framework' as const, packageName: 'node-adapter', category: phase };
	const message = `eXact Node ${phase} failed`;
	try {
		if (logger) {
			if (logger.isEnabled?.('error', scope) !== false)
				logger.log({ level: 'error', message, error, scope });
			return;
		}
	} catch (loggingError) {
		console.error('[eXact node-adapter] Error logger failed', loggingError);
	}
	console.error(message, error);
}
