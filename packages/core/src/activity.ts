import type { ActivityMode } from './component/contracts.js';

/** Validates and normalizes the authored mode of a native Activity boundary. */
export function normalizeActivityMode(value: unknown): ActivityMode {
	if (value === undefined || value === 'active') return 'active';
	if (value === 'parked' || value === 'background') return value;
	throw new TypeError(
		`Activity mode must be "active", "parked", or "background"; received ${String(value)}`
	);
}
