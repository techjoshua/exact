import { shouldTransformExactBuildModulePath } from '@exactjs/compiler/adapter-support';
import { jsxSourceOwnership } from '@exactjs/react-compat/plugin';
import type { TransformExactViteModuleOptions } from './transform.js';

/** Prepares the same reached-publication and Intl source consumed by native lowering. */
export function prepareExactViteSource(
	input: Pick<
		TransformExactViteModuleOptions,
		'code' | 'id' | 'options' | 'reactCompatibility' | 'intl' | 'warn'
	>
) {
	const { code, id: filename, options } = input;
	const internationalization = options.internationalization || undefined;
	const reachedPublication = internationalization
		? input.intl.activateReachedSource(code, filename)
		: undefined;
	const eligible = shouldTransformExactBuildModulePath(filename, options);
	const authoredOwnership = eligible
		? jsxSourceOwnership(filename, code, input.reactCompatibility)
		: 'unknown';
	const intlAnalysis =
		internationalization && eligible && authoredOwnership !== 'react'
			? input.intl.analyzeConfiguredSource(code, filename)
			: undefined;
	for (const diagnostic of intlAnalysis?.diagnostics ?? [])
		input.warn(`${diagnostic.file}:${diagnostic.start}: ${diagnostic.message}`);
	const analyzedCode = intlAnalysis?.code ?? code;
	const ownership = intlAnalysis
		? jsxSourceOwnership(filename, analyzedCode, input.reactCompatibility)
		: authoredOwnership;
	return { reachedPublication, intlAnalysis, analyzedCode, ownership };
}

/** Build-local preparation cache. Clear alongside every Intl/build generation change. */
export class ExactViteSourcePreparation {
	readonly #entries = new Map<
		string,
		{ source: string; result: ReturnType<typeof prepareExactViteSource> }
	>();

	/** Drops prior generation results, including descriptor and package-publication ownership. */
	clear(): void {
		this.#entries.clear();
	}

	/** Reuses preparation only for identical authored bytes, compiler target, and eligibility. */
	prepare(input: Parameters<typeof prepareExactViteSource>[0], target: 'client' | 'server') {
		const key = JSON.stringify([
			input.id,
			target,
			shouldTransformExactBuildModulePath(input.id, input.options)
		]);
		const previous = this.#entries.get(key);
		if (previous?.source === input.code) return previous.result;
		const result = prepareExactViteSource(input);
		this.#entries.set(key, { source: input.code, result });
		return result;
	}
}
