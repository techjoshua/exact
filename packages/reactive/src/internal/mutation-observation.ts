import type { ReactiveOptions } from './types.js';

/** Reports a successful mutation without allowing diagnostic callback failures to escape.
 * Collection keys outside the property-key domain are reported as undefined.
 */
export function notifyMutation(options: ReactiveOptions, key: unknown, operation: string): void {
	const propertyKey =
		typeof key === 'string' || typeof key === 'number' || typeof key === 'symbol' ? key : undefined;
	try {
		options.onMutation?.(propertyKey, operation);
	} catch {
		// Observation is deliberately outside application error propagation.
	}
}
