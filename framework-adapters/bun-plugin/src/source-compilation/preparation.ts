import { jsxSourceOwnership, resolveReactCompatibility } from '@exactjs/react-compat/plugin';
import type { ExactBunPluginOptions } from '../plugin.js';
import type { IntlBuildCoordinator } from '@exactjs/intl-build';

/** Prepares reached publication, JSX ownership, and Intl exactly once before selected lowering. */
export function prepareExactBunSource(
	source: string,
	filename: string,
	options: ExactBunPluginOptions,
	intl?: IntlBuildCoordinator,
	warn?: (message: string) => void,
	eligible = true
) {
	const reachedPublication =
		intl && options.internationalization ? intl.activateReachedSource(source, filename) : undefined;
	const reactCompatibility = resolveReactCompatibility(options.reactCompatibility);
	const authoredOwnership = eligible
		? jsxSourceOwnership(filename, source, reactCompatibility)
		: 'unknown';
	const intlAnalysis =
		eligible && intl && options.internationalization && authoredOwnership !== 'react'
			? intl.analyzeConfiguredSource(source, filename)
			: undefined;
	for (const diagnostic of intlAnalysis?.diagnostics ?? [])
		warn?.(`${diagnostic.file}:${diagnostic.start}: ${diagnostic.message}`);
	const analyzedSource = intlAnalysis?.code ?? source;
	const ownership = intlAnalysis
		? jsxSourceOwnership(filename, analyzedSource, reactCompatibility)
		: authoredOwnership;
	return { reachedPublication, intlAnalysis, analyzedSource, ownership };
}

/** Build-local preparation cache. Clear alongside every Intl/build generation change. */
export class ExactBunSourcePreparation {
	readonly #entries = new Map<
		string,
		{ source: string; result: ReturnType<typeof prepareExactBunSource> }
	>();

	/** Drops prior generation results, including descriptor and package-publication ownership. */
	clear(): void {
		this.#entries.clear();
	}

	/** Reuses preparation only for identical authored bytes, compiler target, and eligibility. */
	prepare(
		source: string,
		filename: string,
		target: 'client' | 'server',
		options: ExactBunPluginOptions,
		intl: IntlBuildCoordinator | undefined,
		warn: ((message: string) => void) | undefined,
		eligible: boolean
	) {
		const key = JSON.stringify([filename, target, eligible]);
		const previous = this.#entries.get(key);
		if (previous?.source === source) return previous.result;
		const result = prepareExactBunSource(source, filename, options, intl, warn, eligible);
		this.#entries.set(key, { source, result });
		return result;
	}
}
