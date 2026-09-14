import { logFrameworkEvent } from '@exactjs/core';
import type { ExactRequestLike, ExactServerContext } from './types.js';
/** Describes the result produced by exact security. */
export type ExactSecurityResult = 'allowed' | 'unauthorized' | 'csrf';

/** Runs authorization and CSRF hooks, converting hook failures into closed security results. */
export async function checkSecurityHooks(
	request: ExactRequestLike,
	context: ExactServerContext
): Promise<ExactSecurityResult> {
	if (context.authorize) {
		try {
			if (!(await context.authorize(request, context))) return 'unauthorized';
		} catch (error) {
			logFrameworkEvent(
				'error',
				'server',
				'security',
				'exact authorization hook failed',
				error,
				context.logger
			);
			return 'unauthorized';
		}
	}
	if (context.validateCsrf) {
		try {
			if (!(await context.validateCsrf(request, context))) return 'csrf';
		} catch (error) {
			logFrameworkEvent(
				'error',
				'server',
				'security',
				'exact csrf hook failed',
				error,
				context.logger
			);
			return 'csrf';
		}
	}
	return 'allowed';
}
