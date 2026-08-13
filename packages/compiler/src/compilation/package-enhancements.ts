import type { ExactPackageEnhancementImport } from '@exactjs/config';
import path from 'node:path';
import type { NativeCompilerResponse } from '../native/process-contracts.js';

/** Source prepared with package-wide enhancement bindings after every authored offset. */
export type ExactPreparedPackageEnhancements = Readonly<{
	source: string;
	authoredLength: number;
	moduleSpecifiers: ReadonlySet<string>;
}>;

/**
 * Appends virtual attributed imports without moving any authored source range.
 * Native lowering erases these imports just like explicitly authored enhancement imports.
 */
export function preparePackageEnhancementSource(
	source: string,
	filename: string,
	registrations: readonly ExactPackageEnhancementImport[] | undefined
): ExactPreparedPackageEnhancements {
	if (!registrations?.length)
		return Object.freeze({
			source,
			authoredLength: source.length,
			moduleSpecifiers: new Set<string>()
		});
	const imports: string[] = [];
	const moduleSpecifiers = new Set<string>();
	for (const registration of registrations) {
		const moduleSpecifier = componentModuleSpecifier(registration, filename);
		moduleSpecifiers.add(moduleSpecifier);
		imports.push(renderPackageEnhancementImport(registration, moduleSpecifier));
	}
	return Object.freeze({
		source: `${source}\n${imports.join('\n')}\n`,
		authoredLength: source.length,
		moduleSpecifiers
	});
}

/** Removes virtual-source artifacts while retaining enhancement activations and authored offsets. */
export function sanitizePackageEnhancementResponse(
	response: NativeCompilerResponse,
	prepared: ExactPreparedPackageEnhancements
): NativeCompilerResponse {
	if (!prepared.moduleSpecifiers.size) return response;
	const diagnostics = response.diagnostics.flatMap((diagnostic) => {
		if (diagnostic.start === undefined || diagnostic.start < prepared.authoredLength)
			return [diagnostic];
		// TypeScript may report the second half of a duplicate on the virtual import.
		// Framework resolution failures remain authoritative but are not attributed to authored text.
		return diagnostic.code.startsWith('EXACT')
			? [{ ...diagnostic, start: undefined, length: undefined }]
			: [];
	});
	const imports = response.analysis.imports.filter(
		(entry) => entry.start < prepared.authoredLength
	);
	const usedIdentities = new Set(
		(response.analysis.enhancementActivations ?? []).map((activation) => activation.identity)
	);
	const rendererEnhancements = response.analysis.rendererEnhancements.filter(
		(entry) =>
			!prepared.moduleSpecifiers.has(entry.moduleSpecifier) || usedIdentities.has(entry.identity)
	);
	const sourceMap = response.sourceMap?.sourcesContent?.length
		? {
				...response.sourceMap,
				sourcesContent: response.sourceMap.sourcesContent.map((_content, index) =>
					index === 0 ? prepared.source.slice(0, prepared.authoredLength) : _content
				)
			}
		: response.sourceMap;
	return {
		...response,
		diagnostics,
		analysis: { ...response.analysis, imports, rendererEnhancements },
		...(sourceMap ? { sourceMap } : {})
	};
}

/** Resolves config-relative imports from the component module that receives the virtual binding. */
function componentModuleSpecifier(
	registration: ExactPackageEnhancementImport,
	filename: string
): string {
	if (!registration.moduleSpecifier.startsWith('.')) return registration.moduleSpecifier;
	const absolute = path.resolve(
		path.dirname(registration.declaredIn),
		registration.moduleSpecifier
	);
	let relative = path
		.relative(path.dirname(path.resolve(filename)), absolute)
		.replaceAll(path.sep, '/');
	if (!relative.startsWith('.')) relative = `./${relative}`;
	return relative;
}

/** Emits one ordinary exact-enhancement import from a static config declaration. */
function renderPackageEnhancementImport(
	registration: ExactPackageEnhancementImport,
	moduleSpecifier: string
): string {
	const source = JSON.stringify(moduleSpecifier);
	const attributes = `with { type: "exact-enhancement" };`;
	return `import * as ${registration.localName} from ${source} ${attributes}`;
}
