import { createReactCompatibilityBuildEngine } from '@exactjs/react-compat/build';
import { resolveReactCompatibility } from '@exactjs/react-compat/plugin';
import type { ExactPluginOptions } from './plugin-contracts.js';

/** Resolves the optional React compatibility target and its shared build engine. */
export function createExactViteReactCompatibility(options: ExactPluginOptions) {
	const cwd =
		(typeof options.reactCompatibility === 'object' ? options.reactCompatibility.cwd : undefined) ??
		options.applicationRoot ??
		process.cwd();
	const compatibility = resolveReactCompatibility(options.reactCompatibility, cwd);
	const engine = compatibility
		? createReactCompatibilityBuildEngine(
				typeof options.reactCompatibility === 'object'
					? options.reactCompatibility
					: { cwd, target: compatibility.target }
			)
		: undefined;
	return { compatibility, engine };
}
