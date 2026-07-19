import type ts from 'typescript';
import type { ModuleExportReplacement } from './contracts.js';
import { safeIdentifier } from './program.js';

export function injectedAdapterImport(
	factory: ts.NodeFactory,
	imports: Map<string, { targetModule: string; targetExport: string; local: ts.Identifier }>,
	replacement: ModuleExportReplacement
): ts.Identifier {
	const key = `${replacement.targetModule}\0${replacement.targetExport}`;
	let value = imports.get(key);
	if (!value) {
		value = {
			targetModule: replacement.targetModule,
			targetExport: replacement.targetExport,
			local: factory.createUniqueName(`__exact_${safeIdentifier(replacement.targetExport)}`)
		};
		imports.set(key, value);
	}
	return value.local;
}
