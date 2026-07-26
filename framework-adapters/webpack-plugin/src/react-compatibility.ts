import type { ExactCompilerSession } from '@exactjs/compiler';
import {
	createReactCompatibilityBuildEngine,
	type ReactCompatibilityBuildEngine
} from '@exactjs/react-compat/build';
import type { ReactCompatibilityOptions } from '@exactjs/react-compat/plugin';

const enginesBySession = new WeakMap<
	ExactCompilerSession,
	Map<string, ReactCompatibilityBuildEngine>
>();

/** Returns the compatibility engine owned by one Webpack compiler session. */
export function webpackCompatibilityEngine(
	options: Readonly<{
		reactCompatibility?: boolean | ReactCompatibilityOptions;
		applicationRoot?: string;
	}>,
	session: ExactCompilerSession | undefined,
	target: 18 | 19
): ReactCompatibilityBuildEngine {
	const configured =
		typeof options.reactCompatibility === 'object'
			? options.reactCompatibility
			: { target, cwd: options.applicationRoot ?? process.cwd() };
	if (!session) return createReactCompatibilityBuildEngine(configured);
	const key = JSON.stringify([
		target,
		configured.cwd ?? '',
		configured.source instanceof RegExp
			? [configured.source.source, configured.source.flags]
			: (configured.source ?? '')
	]);
	let engines = enginesBySession.get(session);
	if (!engines) {
		engines = new Map();
		enginesBySession.set(session, engines);
	}
	let engine = engines.get(key);
	if (!engine) {
		engine = createReactCompatibilityBuildEngine(configured);
		engines.set(key, engine);
	}
	return engine;
}
