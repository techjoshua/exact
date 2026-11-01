import { logFrameworkEvent } from '@exactjs/core';
import type { ExactRequestLike, ExactServerContext } from './types.js';
/** Describes the result of request-level authorization and CSRF checks. */
export type ExactSecurityResult = 'allowed' | 'unauthorized' | 'csrf';

/** Request policies share approval, receiver, error-reporting and before-body ownership rules. */
const requestPolicies = [
	['authorize', 'unauthorized', 'authorization'],
	['validateCsrf', 'csrf', 'csrf']
] as const;

/** Requires boolean true from each configured hook, denying malformed decisions and failures before body parsing. */
export async function checkSecurityHooks(
	request: ExactRequestLike,
	context: ExactServerContext
): Promise<ExactSecurityResult> {
	for (const [key, denied, label] of requestPolicies) {
		try {
			const hook = context[key];
			if (hook === undefined) continue;
			if ((await Reflect.apply(hook, context, [request, context])) !== true) return denied;
		} catch (error) {
			logFrameworkEvent(
				'error',
				'server',
				'security',
				`exact ${label} hook failed`,
				error,
				context.logger
			);
			return denied;
		}
	}
	return 'allowed';
}
