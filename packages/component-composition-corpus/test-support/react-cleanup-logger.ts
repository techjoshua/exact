import { createConsoleLogger, LoggerContext, type AnyComponentInstance } from '@exactjs/core';

/** Observes a provider's descendant failure logs without suppressing them, preserving undefined error identity for browser verification. */
export function observeCleanupJourneyLogs(provider: AnyComponentInstance): () => number {
	const fallback = createConsoleLogger();
	let failures = 0;
	provider.setContext(LoggerContext, {
		...fallback,
		log(event) {
			if (event.level === 'error') failures++;
			if (event.level === 'error' && event.error === undefined)
				console.error('[exact] [cleanup-fixture] ' + event.message, event.error, event.data);
			else fallback.log(event);
		}
	});
	return () => failures;
}
