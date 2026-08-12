import { logFrameworkEvent, type Logger } from '@exactjs/core';
import type { HydrationDiagnostic } from './types.js';

/** Options shared by hydration and patch mismatch reporting. */
export type MismatchOptions = {
	logger?: Logger;
	onDiagnostic?: (diagnostic: HydrationDiagnostic) => void;
};

/** Publishes one hydration or patch mismatch through logging and structured diagnostics. */
export function reportMismatch(
	options: MismatchOptions,
	message: string,
	code: HydrationDiagnostic['code'] = 'adoption-mismatch',
	patch?: { type: string; id: string }
): void {
	logFrameworkEvent('warn', 'hydrate', 'mismatch', message, undefined, options.logger);
	options.onDiagnostic?.({ code, message, patch });
}
