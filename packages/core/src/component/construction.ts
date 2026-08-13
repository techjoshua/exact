import { attachSuppressedCleanupFailure } from '../cleanup.js';
import type { ComponentInstance } from './contracts.js';

/**
 * Releases every lifecycle resource registered before component initialization failed.
 *
 * The construction error remains primary; teardown failures are retained as
 * suppressed diagnostics on that error.
 */
export function cleanupFailedComponentConstruction(
	instance: ComponentInstance<any>,
	primary: unknown
): void {
	try {
		instance.unmount('construct-failed');
	} catch (cleanup) {
		attachSuppressedCleanupFailure(primary, cleanup);
	}
}

/** Distinguishes a tagged-template invocation from an ordinary state-path read. */
export function isTemplateStringsArray(value: unknown): value is TemplateStringsArray {
	return Array.isArray(value) && Array.isArray((value as { raw?: unknown }).raw);
}
