import ts from 'typescript';
import type * as nativeTs from './native-typescript.js';
import type {
	ExactAssetDependencyIR,
	ExactAssetImportMode,
	ExactAssetRule,
	ExactAssetTarget
} from './types.js';

/** Defines the exact import placement type contract. */
export type ExactImportPlacement = 'client' | 'server';

/** Describes the planned exact module import operation. */
export type ExactModuleImportPlan = {
	readonly assets: readonly ExactAssetDependencyIR[];
	readonly diagnostics: readonly string[];
	readonly placementBySpecifier: ReadonlyMap<string, ExactImportPlacement>;
	readonly clientAssetSideEffectStarts: ReadonlySet<number>;
};

const defaultAssetRules: readonly ExactAssetRule[] = [
	{
		extensions: ['.css', '.less', '.scss'],
		kind: 'style',
		deliveryTarget: 'client'
	}
];

/** Computes a module imports without changing caller-owned input. */
export function analyzeModuleImports(
	source: string,
	filename: string,
	rules: readonly ExactAssetRule[] = []
): ExactModuleImportPlan {
	const sourceFile = ts.createSourceFile(
		filename,
		source,
		ts.ScriptTarget.ES2022,
		true,
		scriptKind(filename)
	);
	const assets: ExactAssetDependencyIR[] = [];
	const diagnostics: string[] = [];
	const placementBySpecifier = new Map<string, ExactImportPlacement>();
	const clientAssetSideEffectStarts = new Set<number>();

	for (const statement of sourceFile.statements) {
		if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
			continue;
		const specifier = statement.moduleSpecifier.text;
		const placement = exactImportPlacement(statement, sourceFile, diagnostics);
		if (placement) {
			const prior = placementBySpecifier.get(specifier);
			if (prior && prior !== placement)
				diagnostics.push(`error: import '${specifier}' has conflicting exact placement attributes`);
			else placementBySpecifier.set(specifier, placement);
		}

		const rule = matchingAssetRule(specifier, [...rules, ...defaultAssetRules]);
		if (!rule) continue;
		const sideEffect = !statement.importClause;
		const importMode = rule.importMode ?? (sideEffect ? 'side-effect' : 'module');
		const evaluationTarget =
			placement ?? rule.evaluationTarget ?? defaultEvaluationTarget(importMode, sideEffect);
		const deliveryTarget = rule.deliveryTarget ?? defaultDeliveryTarget(importMode);
		assets.push({ specifier, kind: rule.kind, importMode, evaluationTarget, deliveryTarget });
		if (sideEffect && evaluationTarget === 'client')
			clientAssetSideEffectStarts.add(statement.getStart(sourceFile));
		if (!placement && evaluationTarget !== 'both')
			placementBySpecifier.set(specifier, evaluationTarget);
	}

	return Object.freeze({
		assets: Object.freeze(dedupeAssets(assets)),
		diagnostics: Object.freeze([...new Set(diagnostics)]),
		placementBySpecifier,
		clientAssetSideEffectStarts
	});
}

/** Performs the strip exact import attribute domain operation. */
export function stripExactImportAttribute(
	node: nativeTs.ImportDeclaration,
	factory: nativeTs.NodeFactory
): nativeTs.ImportDeclaration {
	const attributes = node.attributes;
	if (!attributes) return node;
	const retained = attributes.attributes.filter(
		(element) => importAttributeName(element.name) !== 'exact'
	);
	if (retained.length === attributes.attributes.length) return node;
	const next = retained.length
		? factory.updateImportAttributes(
				attributes,
				factory.createNodeArray(retained),
				attributes.multiLine
			)
		: undefined;
	return factory.updateImportDeclaration(
		node,
		node.modifiers,
		node.importClause,
		node.moduleSpecifier,
		next
	);
}

function exactImportPlacement(
	node: ts.ImportDeclaration,
	sourceFile: ts.SourceFile,
	diagnostics: string[]
): ExactImportPlacement | undefined {
	const matches =
		node.attributes?.elements.filter((element) => importAttributeName(element.name) === 'exact') ??
		[];
	if (!matches.length) return undefined;
	const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
	const prefix = `${sourceFile.fileName}:${location.line + 1}:${location.character + 1}`;
	if (matches.length > 1)
		diagnostics.push(`error: ${prefix} import has duplicate exact attributes`);
	if (node.importClause?.isTypeOnly)
		diagnostics.push(`error: ${prefix} type-only import cannot declare exact placement`);
	const value = matches[0]?.value;
	if (
		!value ||
		!ts.isStringLiteral(value) ||
		(value.text !== 'client' && value.text !== 'server')
	) {
		diagnostics.push(`error: ${prefix} exact import attribute must be \"client\" or \"server\"`);
		return undefined;
	}
	return value.text;
}

function importAttributeName(name: Readonly<{ text: string }>): string {
	return name.text;
}

function matchingAssetRule(
	specifier: string,
	rules: readonly ExactAssetRule[]
): ExactAssetRule | undefined {
	const [pathname, query = ''] = specifier.split('?', 2);
	const clean = pathname!.split('#', 1)[0]!.toLowerCase();
	const queryTokens = new Set(
		query
			.split('&')
			.map((token) => token.split('=', 1)[0]!.toLowerCase())
			.filter(Boolean)
	);
	return rules.find((rule) => {
		const extensionMatch =
			!rule.extensions?.length ||
			rule.extensions.some((extension) => clean.endsWith(normalizeExtension(extension)));
		const queryMatch =
			!rule.queries?.length ||
			rule.queries.some((token) => queryTokens.has(token.replace(/^\?/, '').toLowerCase()));
		return extensionMatch && queryMatch;
	});
}

function normalizeExtension(extension: string): string {
	const normalized = extension.toLowerCase();
	return normalized.startsWith('.') ? normalized : `.${normalized}`;
}

function defaultEvaluationTarget(
	mode: ExactAssetImportMode,
	sideEffect: boolean
): Exclude<ExactAssetTarget, 'embedded'> {
	if (mode === 'worker' || sideEffect) return 'client';
	return 'both';
}

function defaultDeliveryTarget(mode: ExactAssetImportMode): ExactAssetTarget {
	return mode === 'raw' || mode === 'inline' ? 'embedded' : 'client';
}

function dedupeAssets(values: readonly ExactAssetDependencyIR[]): ExactAssetDependencyIR[] {
	const seen = new Set<string>();
	return values.filter((value) => {
		const key = JSON.stringify(value);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function scriptKind(filename: string): ts.ScriptKind {
	if (/\.tsx$/i.test(filename)) return ts.ScriptKind.TSX;
	if (/\.jsx$/i.test(filename)) return ts.ScriptKind.JSX;
	if (/\.js$/i.test(filename)) return ts.ScriptKind.JS;
	return ts.ScriptKind.TS;
}
