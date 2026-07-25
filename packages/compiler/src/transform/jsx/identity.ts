import type { BoundModule } from '@exactjs/expressions';
import ts from 'typescript';
import type { CallableEffectPlan } from '../../analysis/callable-effects.js';
import type { ExpressionComponentPlan } from '../../expression/contracts.js';
import type { ExpressionDerivedPlan } from '../../expression/derived.js';
import type { ExpressionJsxPlan } from '../../expression/jsx.js';
import type { ExpressionTaskPlan } from '../../expression/task-contracts.js';
import type { ExpressionWritePlan } from '../../expression/writes.js';

/** Provides the canonical source identity filenames value. */
export const sourceIdentityFilenames = new WeakMap<ts.SourceFile, string>();
/** Provides the canonical identity filename for value. */
export const identityFilenameFor = (sourceFile: ts.SourceFile): string =>
	sourceIdentityFilenames.get(sourceFile) ?? sourceFile.fileName;
/** Provides the canonical expression emission ids value. */
export const expressionEmissionIds = new WeakMap<ts.Node, string>();

/** Performs the expression emission id domain operation. */
export function expressionEmissionId(node: ts.Node): string | undefined {
	return expressionEmissionIds.get(node) ?? expressionEmissionIds.get(ts.getOriginalNode(node));
}

/** Pairs emission handles by the canonical expression tree's structural child path. */
export function bindExpressionEmissionNodes(
	sourceFile: ts.SourceFile,
	module: BoundModule,
	required: ReadonlySet<string>
): void {
	const bind = (syntax: ts.Node, expression: BoundModule['rootNode']): void => {
		const syntaxKind = emissionSyntaxKindName(syntax);
		if (syntaxKind !== expression.kind) {
			throw new Error(
				`Expression emission tree diverged at ${expression.id}: expected ${expression.kind}, received ${syntaxKind} in ${sourceFile.fileName}`
			);
		}
		if (required.has(expression.id)) expressionEmissionIds.set(syntax, expression.id);
		const syntaxChildren: ts.Node[] = [];
		ts.forEachChild(syntax, (child) => {
			syntaxChildren.push(child);
		});
		if (syntaxChildren.length !== expression.children.length) {
			throw new Error(
				`Expression emission child count diverged at ${expression.id} in ${sourceFile.fileName}`
			);
		}
		for (let index = 0; index < syntaxChildren.length; index++)
			bind(syntaxChildren[index]!, expression.children[index]!);
	};
	bind(sourceFile, module.rootNode);
}

/** Performs the emission syntax kind name domain operation. */
export function emissionSyntaxKindName(node: ts.Node): string {
	if (ts.isNumericLiteral(node)) return 'NumericLiteral';
	if (ts.isBigIntLiteral(node)) return 'BigIntLiteral';
	if (ts.isStringLiteral(node)) return 'StringLiteral';
	if (ts.isNoSubstitutionTemplateLiteral(node)) return 'NoSubstitutionTemplateLiteral';
	if (ts.isRegularExpressionLiteral(node)) return 'RegularExpressionLiteral';
	if (ts.isJsxText(node)) return 'JsxText';
	return ts.SyntaxKind[node.kind];
}

/** Performs the emission node ids domain operation. */
export function emissionNodeIds(
	module: BoundModule,
	derived: ExpressionDerivedPlan,
	writes: ExpressionWritePlan,
	tasks: ExpressionTaskPlan,
	jsx: ExpressionJsxPlan,
	components: ExpressionComponentPlan,
	callableEffects: CallableEffectPlan
): ReadonlySet<string> {
	const ids = new Set<string>();
	const addKeys = (map: ReadonlyMap<string, unknown>) => {
		for (const key of map.keys()) ids.add(key);
	};
	addKeys(derived.sites);
	addKeys(derived.declarations);
	for (const site of derived.sites.values()) ids.add(site.initializerNodeId);
	for (const site of derived.declarations.values()) ids.add(site.initializerNodeId);
	addKeys(writes.sites);
	addKeys(tasks.sites);
	addKeys(tasks.resources);
	addKeys(tasks.lifecycleListeners);
	addKeys(tasks.setupTasks);
	addKeys(tasks.signalCalls);
	for (const site of tasks.sites.values())
		for (const dependency of site.dependencies) {
			ids.add(dependency.nodeId);
			for (const readNodeId of dependency.readNodeIds) ids.add(readNodeId);
		}
	addKeys(jsx.elements);
	addKeys(jsx.cells);
	addKeys(jsx.contextualParameters);
	addKeys(jsx.lists);
	for (const site of components.sites.values()) {
		ids.add(site.id);
		for (const island of site.clientIslands) ids.add(island.nodeId);
		for (const render of site.renders) ids.add(render.nodeId);
	}
	for (const call of module.walk().calls()) if (call.target?.isMember('map')) ids.add(call.node.id);
	addKeys(callableEffects.byNodeId);
	return ids;
}
