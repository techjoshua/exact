import type { ExactRendererEnhancementIR } from '@exactjs/compiler';
import {
	exactAvailableEnhancementFacadeSource,
	exactEnhancementFacadeRequest,
	exactUnavailableEnhancementFacadeSource
} from '@exactjs/compiler/adapter-support';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type FacadeProvenance = Readonly<{ importer: string; request: string }>;
const provenance = new Map<string, FacadeProvenance>();

/** Materializes portable Webpack/Node ESM facades and rewrites compiler requests to them. */
export function materializeWebpackEnhancementFacades(
	code: string,
	enhancements: readonly ExactRendererEnhancementIR[] | undefined,
	importer: string,
	applicationRoot = process.cwd()
): string {
	if (!enhancements?.length) return code;
	const root = path.resolve(applicationRoot, '.exact', 'enhancements');
	mkdirSync(root, { recursive: true });
	let result = code;
	for (const entry of new Map(enhancements.map((value) => [value.identity, value])).values()) {
		const request = exactEnhancementFacadeRequest(entry);
		let resolved: string | undefined;
		try {
			resolved = createRequire(importer).resolve(entry.moduleSpecifier);
		} catch (error) {
			if (!isMissingModule(error, entry.moduleSpecifier)) throw error;
		}
		const key = createHash('sha256')
			.update(`${importer}\0${request}\0${resolved ?? 'absent'}`)
			.digest('base64url');
		const filename = path.join(root, `${key}.mjs`);
		const source = resolved
			? exactAvailableEnhancementFacadeSource({
					version: 1,
					identity: entry.identity,
					moduleSpecifier: pathToFileURL(resolved).href,
					exportName: entry.exportName
				})
			: exactUnavailableEnhancementFacadeSource();
		writeFileSync(filename, source, 'utf8');
		provenance.set(path.resolve(filename), {
			importer: path.resolve(importer),
			request: entry.moduleSpecifier
		});
		result = result.split(JSON.stringify(request)).join(JSON.stringify(filename));
	}
	return result;
}

/** Restores the authored edge hidden behind one generated physical facade. */
export function webpackEnhancementFacadeProvenance(
	importer: string | undefined
): FacadeProvenance | undefined {
	return importer ? provenance.get(path.resolve(importer.replace(/[?#].*$/, ''))) : undefined;
}

function isMissingModule(error: unknown, request: string): boolean {
	if (!(error instanceof Error)) return false;
	const code = (error as Error & { code?: string }).code;
	return (
		(code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND') &&
		error.message.includes(request)
	);
}
