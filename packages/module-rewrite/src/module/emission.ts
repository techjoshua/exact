import type ts from 'typescript';
import type { ModuleExportReplacement } from './contracts.js';
import { safeIdentifier } from './program.js';

/** Performs the injected adapter import domain operation. */
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

/** Emits an identifier or a quoted module export name without changing its spelling. */
export function moduleExportName(
	factory: ts.NodeFactory,
	value: string
): ts.Identifier | ts.StringLiteral {
	return /^[$_\p{ID_Start}][$\u200C\u200D_\p{ID_Continue}]*$/u.test(value)
		? factory.createIdentifier(value)
		: factory.createStringLiteral(value);
}
