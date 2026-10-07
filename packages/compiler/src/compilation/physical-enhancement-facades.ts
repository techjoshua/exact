import { isMissingExactOptionalEnhancement } from './optional-enhancement-resolution.js';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { ExactRendererEnhancementIR } from '../contracts/transform.js';
import {
	exactAvailableEnhancementFacadeSource,
	exactEnhancementFacadeRequest,
	exactUnavailableEnhancementFacadeSource
} from './enhancement-facades.js';

/** Records one generated provider facade and the authored import edge whose availability it masks. */
export type ExactPhysicalEnhancementFacade = Readonly<{
	filename: string;
	importer: string;
	request: string;
}>;

/**
 * Emits ordinary ESM facades while retaining provider requests relative to their authored importer.
 * A host resolver may prove availability after Node reports an optional missing root, including
 * source extensions and aliases. Returning undefined preserves absence, and other failures propagate.
 */
export function materializeExactPhysicalEnhancementFacades(
	code: string,
	enhancements: readonly ExactRendererEnhancementIR[] | undefined,
	importer: string,
	outputRoot: string,
	activationModule?: string,
	outputFile?: string,
	resolveMissingProvider?: (moduleSpecifier: string, importer: string) => string | undefined
): Readonly<{ code: string; facades: readonly ExactPhysicalEnhancementFacade[] }> {
	if (!enhancements?.length) return Object.freeze({ code, facades: Object.freeze([]) });
	const root = path.resolve(outputRoot, '.exact', 'enhancements');
	mkdirSync(root, { recursive: true });
	let rewritten = code;
	const facades: ExactPhysicalEnhancementFacade[] = [];
	for (const entry of new Map(enhancements.map((value) => [value.identity, value])).values()) {
		const request = exactEnhancementFacadeRequest(entry);
		let resolved: string | undefined;
		try {
			resolved = createRequire(importer).resolve(entry.moduleSpecifier);
		} catch (error) {
			if (!isMissingExactOptionalEnhancement(error, entry.moduleSpecifier)) throw error;
			// Build hosts may resolve source extensions or aliases that Node does not own.
			resolved = resolveMissingProvider?.(entry.moduleSpecifier, importer);
		}
		const key = createHash('sha256')
			.update(`${importer}\0${request}\0${resolved ?? 'absent'}\0${activationModule ?? ''}`)
			.digest('base64url');
		const filename = path.join(root, `${key}.mjs`);
		const provider = {
			version: 1 as const,
			identity: entry.identity,
			moduleSpecifier: entry.moduleSpecifier.startsWith('.')
				? relativeModuleSpecifier(
						path.dirname(filename),
						path.resolve(path.dirname(importer), entry.moduleSpecifier)
					)
				: entry.moduleSpecifier,
			exportName: entry.exportName
		};
		// A later consumer reads this marker relative to the physical facade itself.
		// Keep the original identity while relocating both the executable edge and its descriptor.
		const portableRequest = exactEnhancementFacadeRequest(provider);
		writeFacadeIfChanged(
			filename,
			`// ${portableRequest}\n` +
				(resolved
					? exactAvailableEnhancementFacadeSource(provider, activationModule)
					: exactUnavailableEnhancementFacadeSource(activationModule))
		);

		facades.push(
			Object.freeze({ filename, importer: path.resolve(importer), request: entry.moduleSpecifier })
		);
		const facadeSpecifier = outputFile
			? relativeModuleSpecifier(path.dirname(outputFile), filename)
			: filename;
		rewritten = rewritten.split(JSON.stringify(request)).join(JSON.stringify(facadeSpecifier));
	}
	return Object.freeze({ code: rewritten, facades: Object.freeze(facades) });
}

function relativeModuleSpecifier(from: string, target: string): string {
	const relative = path.relative(from, target).replaceAll(path.sep, '/');
	return relative.startsWith('./') || relative.startsWith('../') ? relative : `./${relative}`;
}

/** Preserve watcher timestamps when rebuilding a consumer leaves its facade unchanged. */
function writeFacadeIfChanged(filename: string, contents: string): void {
	try {
		if (readFileSync(filename, 'utf8') === contents) return;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
	}
	writeFileSync(filename, contents, 'utf8');
}
