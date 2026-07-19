import type { ExactKeepPolicy } from '../annotations.js';

/**
 * Parses a context's static residency option.
 *
 * Dynamic values are rejected because policy decisions must be fixed at compile
 * time. Explicit isomorphic residency is also rejected; only the analyzer may
 * infer that a value is safe in both environments.
 */
export function parseContextPolicyOptions(text: string | undefined): {
	keep?: ExactKeepPolicy;
	error?: string;
} {
	if (!text || !/\bkeep\s*:/.test(text)) return {};
	const match = /\bkeep\s*:\s*(["'])([^"']+)\1/.exec(text);
	if (!match) return { error: 'keep option must be a static string literal' };
	const keep = match[2];
	if (keep === 'isomorphic') {
		return { error: 'cannot use keep=isomorphic; safe isomorphic residency is inferred' };
	}
	if (keep !== 'server' && keep !== 'client' && keep !== 'secret') {
		return { error: `has unknown keep option '${keep}'; expected server, client, or secret` };
	}
	return { keep };
}
