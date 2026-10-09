import { analyzeSource } from './source-analysis.js';
import type { TransformOptions } from '../contracts/transform.js';

/**
 * Selects the server projection for a test helper that explicitly consumes a server artifact.
 * Component definitions and mixed client/server exports retain the host's selected target.
 * This is test-host planning, never a production placement or authorization override.
 */
export function exactTestHelperTarget(
	source: string,
	options: TransformOptions,
	target: 'client' | 'server'
): 'client' | 'server' {
	if (target === 'server' || !/\.exact\.server\.[cm]?[jt]sx?['"]/.test(source)) return target;
	const analysis = analyzeSource(source, { ...options, serverComponents: true });
	if (analysis.components.length || analysis.exports.some((value) => value.placement === 'client'))
		return target;
	return analysis.exports.some((value) => value.placement === 'server') ? 'server' : target;
}
