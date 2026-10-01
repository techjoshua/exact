import type { ComponentContractProjection } from '../contracts/transform.js';

/** Rendering mode understood consistently by every build-tool adapter. */
export type ExactBuildRenderMode = 'universal' | 'client' | 'hydrate' | 'server-render';

/** Selects and validates the component-contract facet for one physical build target. */
export function exactComponentContractProjection(
	target: 'client' | 'server',
	mode: ExactBuildRenderMode | undefined
): ComponentContractProjection {
	if (target === 'server') {
		if (mode === undefined || mode === 'universal') return 'complete';
		if (mode === 'server-render') return 'server-render';
		throw new TypeError(`Client render mode ${mode} cannot compile a server target`);
	}
	if (mode === 'server-render')
		throw new TypeError('Server render mode cannot compile a client target');
	return mode === undefined || mode === 'universal' ? 'complete' : mode;
}

/** A projection planned before native analysis and accepted before publishing a component artifact. */
export type ExactAdapterProjection = Readonly<{
	projection: ComponentContractProjection;
	/** Rejects incompatible rendering only when native analysis found an owned component. */
	validate(componentCount: number): void;
}>;

/**
 * Keeps helper-only modules independent of component render facets without weakening component checks.
 * Incompatible component modes compile privately with a complete contract, then reject before the
 * adapter can record metadata, emit assets, or return the result to its bundler.
 */
export function planExactAdapterProjection(
	target: 'client' | 'server',
	mode: ExactBuildRenderMode | undefined
): ExactAdapterProjection {
	const incompatible =
		target === 'server' ? mode === 'client' || mode === 'hydrate' : mode === 'server-render';
	return {
		projection: incompatible ? 'complete' : exactComponentContractProjection(target, mode),
		validate(componentCount) {
			if (componentCount > 0) exactComponentContractProjection(target, mode);
		}
	};
}
