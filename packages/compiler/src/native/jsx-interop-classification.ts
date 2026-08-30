import type { TransformOptions } from '../types.js';

/**
 * Classifies imported JSX tags through the host without evaluating package code.
 *
 * The preliminary native analysis includes JSX used outside component render functions, while the
 * host callback supplies project and package knowledge that the native process cannot safely infer.
 */
export function classifyExactJsxInteropImports(
	session: NonNullable<TransformOptions['session']>,
	source: string,
	filename: string,
	options: TransformOptions,
	target: 'default' | 'client' | 'server'
): Array<{ moduleSpecifier: string; exportName: string }> {
	const interop = options.jsxInterop;
	if (!interop) return [];
	const response = session.compileNative({
		id: filename,
		kind: 'analyze',
		source,
		root: options.root,
		configFile: options.configFile,
		target,
		serverComponents: options.serverComponents,
		diagnostics: 'syntax'
	});
	if (response.error) {
		throw new Error(`Native JSX interop analysis failed for ${filename}: ${response.error}`);
	}
	const exact = new Map<string, { moduleSpecifier: string; exportName: string }>();
	const imports = new Map(
		response.analysis.semanticGraph.declarations
			.filter(
				(declaration) =>
					declaration.kind === 'import' && !declaration.typeOnly && declaration.moduleSpecifier
			)
			.map((declaration) => [
				declaration.name,
				{
					moduleSpecifier: declaration.moduleSpecifier!,
					exportName: declaration.importedName ?? 'default'
				}
			])
	);
	for (const element of response.analysis.jsx) {
		if (element.intrinsic) continue;
		const tagName = element.tag.split('.')[0] ?? element.tag;
		const imported = imports.get(tagName);
		if (
			!imported ||
			interop.classify({
				importer: filename,
				sourceModule: imported.moduleSpecifier,
				localName: tagName,
				tagName,
				declarationSources: [],
				declarationSignatures: []
			}) !== 'exact'
		)
			continue;
		exact.set(`${imported.moduleSpecifier}\0${imported.exportName}`, imported);
	}
	for (const component of response.analysis.components) {
		for (const edge of component.renderEdges) {
			const tagName = edge.tag.split('.')[0] ?? edge.tag;
			const imported = imports.get(tagName);
			const moduleSpecifier = edge.moduleSpecifier ?? imported?.moduleSpecifier;
			if (!moduleSpecifier) continue;
			const exportName = edge.exportName ?? imported?.exportName ?? 'default';
			if (
				!edge.componentId &&
				interop.classify({
					importer: filename,
					sourceModule: moduleSpecifier,
					localName: tagName,
					tagName,
					declarationSources: [],
					declarationSignatures: []
				}) !== 'exact'
			)
				continue;
			const record = { moduleSpecifier, exportName };
			exact.set(`${record.moduleSpecifier}\0${record.exportName}`, record);
		}
	}
	return [...exact.values()].sort(
		(left, right) =>
			left.moduleSpecifier.localeCompare(right.moduleSpecifier) ||
			left.exportName.localeCompare(right.exportName)
	);
}
