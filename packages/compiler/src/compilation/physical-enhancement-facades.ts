import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
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

/** Emits ordinary ESM facades usable by native Node and build hosts without virtual modules. */
export function materializeExactPhysicalEnhancementFacades(
	code: string,
	enhancements: readonly ExactRendererEnhancementIR[] | undefined,
	importer: string,
	outputRoot: string
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
			if (!isMissingModule(error, entry.moduleSpecifier)) throw error;
		}
		const key = createHash('sha256')
			.update(`${importer}\0${request}\0${resolved ?? 'absent'}`)
			.digest('base64url');
		const filename = path.join(root, `${key}.mjs`);
		writeFileSync(
			filename,
			resolved
				? exactAvailableEnhancementFacadeSource({
						version: 1,
						identity: entry.identity,
						moduleSpecifier: pathToFileURL(resolved).href,
						exportName: entry.exportName
					})
				: exactUnavailableEnhancementFacadeSource(),
			'utf8'
		);
		facades.push(
			Object.freeze({ filename, importer: path.resolve(importer), request: entry.moduleSpecifier })
		);
		rewritten = rewritten.split(JSON.stringify(request)).join(JSON.stringify(filename));
	}
	return Object.freeze({ code: rewritten, facades: Object.freeze(facades) });
}

function isMissingModule(error: unknown, request: string): boolean {
	if (!(error instanceof Error)) return false;
	const code = (error as Error & { code?: string }).code;
	return (
		(code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND') &&
		error.message.includes(request)
	);
}
