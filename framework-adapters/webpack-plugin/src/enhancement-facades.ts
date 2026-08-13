import type { ExactRendererEnhancementIR } from '@exactjs/compiler';
import type { TransformTarget } from '@exactjs/compiler';
import { materializeExactPhysicalEnhancementFacades } from '@exactjs/compiler/adapter-support';
import path from 'node:path';

type FacadeProvenance = Readonly<{ importer: string; request: string }>;
const provenance = new Map<string, FacadeProvenance>();

/** Materializes portable Webpack/Node ESM facades and retains authorization provenance. */
export function materializeWebpackEnhancementFacades(
	code: string,
	enhancements: readonly ExactRendererEnhancementIR[] | undefined,
	importer: string,
	applicationRoot = process.cwd(),
	target: TransformTarget = 'default'
): string {
	const result = materializeExactPhysicalEnhancementFacades(
		code,
		enhancements,
		importer,
		applicationRoot,
		target === 'client' ? '@exactjs/dom/framework/enhancements' : undefined
	);
	for (const facade of result.facades)
		provenance.set(path.resolve(facade.filename), {
			importer: facade.importer,
			request: facade.request
		});
	return result.code;
}

/** Restores the authored edge hidden behind one generated physical facade. */
export function webpackEnhancementFacadeProvenance(
	importer: string | undefined
): FacadeProvenance | undefined {
	return importer ? provenance.get(path.resolve(importer.replace(/[?#].*$/, ''))) : undefined;
}
