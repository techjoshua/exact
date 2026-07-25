import type { ExactKeepPolicy } from '../annotations.js';

/**
 * Parses a context's static residency option.
 *
 * Dynamic values are rejected because policy decisions must be fixed at
 * compile time. Scope is parsed with residency because application and request
 * contexts default to server-only capabilities.
 */
export function parseContextPolicyOptions(text: string | undefined): {
	keep?: ExactKeepPolicy | 'shared';
	scope?: 'component' | 'application' | 'request';
	error?: string;
} {
	if (!text) return {};
	const scopeMatch = /\bscope\s*:\s*(["'])([^"']+)\1/.exec(text);
	if (/\bscope\s*:/.test(text) && !scopeMatch) {
		return { error: 'scope option must be a static string literal' };
	}
	const scopeValue = scopeMatch?.[2];
	if (
		scopeValue &&
		scopeValue !== 'component' &&
		scopeValue !== 'application' &&
		scopeValue !== 'request'
	) {
		return {
			error: `has unknown scope option '${scopeValue}'; expected component, application, or request`
		};
	}
	const scope = scopeValue as 'component' | 'application' | 'request' | undefined;
	if (!/\bkeep\s*:/.test(text)) return { ...(scope ? { scope } : {}) };
	const keepMatch = /\bkeep\s*:\s*(["'])([^"']+)\1/.exec(text);
	if (!keepMatch) return { error: 'keep option must be a static string literal' };
	const keep = keepMatch[2];
	if (!['server', 'client', 'shared', 'secret'].includes(keep)) {
		return {
			error: `has unknown keep option '${keep}'; expected server, client, shared, or secret`
		};
	}
	return {
		keep: keep as ExactKeepPolicy | 'shared',
		...(scope ? { scope } : {})
	};
}
