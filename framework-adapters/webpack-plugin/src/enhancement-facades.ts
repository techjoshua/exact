import type { ExactRendererEnhancementIR } from '@exactjs/compiler';
import type { TransformTarget } from '@exactjs/compiler';
import {
	materializeExactPhysicalEnhancementFacades,
	type ExactPhysicalEnhancementFacade
} from '@exactjs/compiler/adapter-support';
import path from 'node:path';

type FacadeProvenance = Readonly<{ importer: string; request: string }>;
const provenance = new Map<string, FacadeProvenance>();
const maximumFacadeProvenanceEntries = 4_096;

/** Materializes portable Webpack/Node ESM facades and retains authorization provenance. */
export function materializeWebpackEnhancementFacades(
	code: string,
	enhancements: readonly ExactRendererEnhancementIR[] | undefined,
	importer: string,
	applicationRoot: string | undefined,
	target: TransformTarget,
	onFacades?: (facades: readonly ExactPhysicalEnhancementFacade[]) => void
): string {
	const result = materializeExactPhysicalEnhancementFacades(
		code,
		enhancements,
		importer,
		applicationRoot ?? process.cwd(),
		target === 'client' ? '@exactjs/dom/framework/enhancements' : undefined
	);
	onFacades?.(result.facades);
	recordWebpackEnhancementFacades(result.facades);
	return result.code;
}

/** Retains loader-produced provenance in the owning plugin module instance. */
export function recordWebpackEnhancementFacades(
	facades: readonly ExactPhysicalEnhancementFacade[]
): void {
	for (const facade of facades) {
		const filename = path.resolve(facade.filename);
		provenance.delete(filename);
		provenance.set(filename, {
			importer: facade.importer,
			request: facade.request
		});
		while (provenance.size > maximumFacadeProvenanceEntries)
			provenance.delete(provenance.keys().next().value!);
	}
}

/** Restores the authored edge hidden behind one generated physical facade. */
export function webpackEnhancementFacadeProvenance(
	importer: string | undefined
): FacadeProvenance | undefined {
	return importer ? provenance.get(path.resolve(importer.replace(/[?#].*$/, ''))) : undefined;
}
