import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	isJsxElement,
	type BoundModule,
	type ExpressionNode,
	type ExpressionScope
} from '../index.js';
import { createExpressionProject } from '../test-support/project.js';

const root = path.resolve(import.meta.dirname, '../../../..');
const config = path.join(root, 'apps/kanban/tsconfig.json');
const filename = path.join(root, 'apps/kanban/src/__expression_differential.tsx');
const source = `
	import type { Component } from "@exactjs/core";
	/** @exact shared */
	type Item = { readonly label: string; value: number };
	type Owner = Component<{ ready: boolean }>;
	const outer = 1;
	export function summarize(items: readonly Item[]) {
		let total = outer;
		const add = (item: Item) => {
			total += item.value;
			return item.label;
		};
		const labels = items.map(add);
		return <section data-count={total}>
			{labels.map(label => <span>{label}</span>)}
		</section>;
	}
`;

describe('expression semantic backends', () => {
	it('preserves stable projection contracts across native and legacy checkers', () => {
		const native = createExpressionProject({
			tsconfigPath: config,
			semanticBackend: 'native'
		});
		const legacy = createExpressionProject({
			tsconfigPath: config,
			semanticBackend: 'legacy'
		});

		const nativeModule = native.updateModule(filename, source);
		const legacyModule = legacy.updateModule(filename, source);

		expect(stableModuleContract(nativeModule)).toEqual(stableModuleContract(legacyModule));
	});

	it('updates the same stable contracts after an incremental type change', () => {
		const native = createExpressionProject({
			tsconfigPath: config,
			semanticBackend: 'native'
		});
		const legacy = createExpressionProject({
			tsconfigPath: config,
			semanticBackend: 'legacy'
		});
		native.updateModule(filename, source);
		legacy.updateModule(filename, source);
		const changed = source.replace('const outer = 1;', 'const outer = "one";');

		const nativeModule = native.updateModule(filename, changed);
		const legacyModule = legacy.updateModule(filename, changed);

		expect(stableModuleContract(nativeModule)).toEqual(stableModuleContract(legacyModule));
		expect(
			nativeModule
				.walk()
				.references()
				.where((reference) => reference.node.name === 'outer')
				.first()?.node.type?.kind
		).toBe('string');
	});

	it('reports the same stable diagnostic identity and location', () => {
		const native = createExpressionProject({
			tsconfigPath: config,
			semanticBackend: 'native',
			diagnostics: 'full'
		});
		const legacy = createExpressionProject({
			tsconfigPath: config,
			semanticBackend: 'legacy',
			diagnostics: 'full'
		});
		const invalid = 'export const value: number = "wrong";';

		const nativeDiagnostics = stableDiagnostics(native.updateModule(filename, invalid));
		const legacyDiagnostics = stableDiagnostics(legacy.updateModule(filename, invalid));

		expect(nativeDiagnostics).toEqual(legacyDiagnostics);
		expect(nativeDiagnostics.some((diagnostic) => diagnostic.code === 'TS2322')).toBe(true);
	});
});

function stableModuleContract(module: BoundModule) {
	const nodes = module
		.walk()
		.toArray()
		.map(({ node }) => ({
			kind: node.kind,
			category: node.category,
			span: node.span && [node.span.start, node.span.end],
			name: node.name,
			operator: node.operator,
			synthetic: node.synthetic,
			variable: node.variable && {
				name: node.variable.name,
				declarationKind: node.variable.declarationKind,
				mutable: node.variable.mutable,
				exported: node.variable.exported,
				importedFrom: node.variable.importedFrom,
				typeOnly: node.variable.typeOnly
			},
			type: stableType(node),
			directives: node.directives?.map((directive) => ({
				namespace: directive.namespace,
				key: directive.key,
				value: directive.value,
				span: directive.span && [directive.span.start, directive.span.end]
			})),
			jsx:
				node.category === 'jsx'
					? {
							tagName: 'tagName' in node ? node.tagName : undefined,
							attributes: isJsxElement(node)
								? node.attributes.map((attribute) => attribute.name)
								: undefined
						}
					: undefined,
			call:
				node.kind === 'CallExpression' || node.kind === 'NewExpression'
					? {
							target: node.children[0]?.name ?? node.children[0]?.text,
							parameters: node.resolvedSignature?.parameters.map((parameter) => ({
								name: parameter.name,
								kind: parameter.type.kind,
								optional: parameter.optional,
								rest: parameter.rest
							})),
							returnKind: node.resolvedSignature?.returnType.kind
						}
					: undefined
		}));
	const scopes = stableScopes(nodesFor(module));
	const effects = module.effects().map((effect) => ({
		kind: effect.kind,
		variable: effect.variable.name,
		span: effect.node.span && [effect.node.span.start, effect.node.span.end]
	}));
	const captures = module
		.walk()
		.functions()
		.toArray()
		.map((reference) => ({
			span: reference.node.span && [reference.node.span.start, reference.node.span.end],
			variables: module
				.capturesOf(reference)
				.map((variable) => variable.name)
				.sort()
		}));
	return {
		source: module.source,
		trivia: module.trivia,
		nodes,
		scopes,
		effects,
		captures,
		diagnostics: stableDiagnostics(module)
	};
}

function stableDiagnostics(module: BoundModule) {
	return module.diagnostics.map((diagnostic) => ({
		code: diagnostic.code,
		severity: diagnostic.severity,
		phase: diagnostic.phase,
		span: diagnostic.span && [diagnostic.span.start, diagnostic.span.end]
	}));
}

function nodesFor(module: BoundModule): ExpressionNode[] {
	return module
		.walk()
		.toArray()
		.map((reference) => reference.node);
}

function stableScopes(nodes: readonly ExpressionNode[]) {
	const values = new Set<ExpressionScope>();
	for (const node of nodes) {
		for (let scope: ExpressionScope | undefined = node.scope; scope; scope = scope.parent)
			values.add(scope);
	}
	return [...values]
		.map((scope) => ({
			kind: scope.kind,
			variables: scope.variables
				.map((variable) => ({
					name: variable.name,
					declarationKind: variable.declarationKind,
					mutable: variable.mutable,
					exported: variable.exported,
					importedFrom: variable.importedFrom,
					typeOnly: variable.typeOnly
				}))
				.sort((left, right) => left.name.localeCompare(right.name))
		}))
		.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function stableType(node: ExpressionNode) {
	if (
		!node.type ||
		node.category === 'type' ||
		node.category === 'jsx' ||
		node.variable?.typeOnly ||
		node.variable?.declarationKind === 'TypeAliasDeclaration' ||
		node.variable?.declarationKind === 'PropertySignature'
	)
		return undefined;
	return {
		kind: node.type.kind,
		nullable: node.type.nullable,
		callable: node.type.callable,
		collectionKind: node.type.collectionKind,
		properties: node.type.properties.map(normalizeCompilerProperty).sort(),
		unionKinds: node.type.unionMembers.map((member) => member.kind).sort(),
		typeArgumentKinds: node.type.typeArguments.map((argument) => argument.kind)
	};
}

function normalizeCompilerProperty(value: string) {
	return value.replace(/(__@[^@]+)@\d+$/, '$1');
}
