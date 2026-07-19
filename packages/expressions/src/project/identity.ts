import ts from 'typescript';
import type { ExpressionNode, ExpressionScope, Variable } from '../model.js';
import { fingerprint } from './directives.js';
import { declarationBindingName, hasNodeName, nodeName, nodeOperator } from './syntax.js';

/** Performs the function captures domain operation. */
export function functionCaptures(
	children: readonly ExpressionNode[],
	functionScope: ExpressionScope
): Variable[] {
	const captures = new Set<Variable>();
	const visit = (node: ExpressionNode, parent?: ExpressionNode): void => {
		if (
			node.variable &&
			(node.kind === 'Identifier' || node.kind === 'ThisKeyword') &&
			!scopeDescendsFrom(node.variable.scope, functionScope) &&
			!isBindingPosition(node, parent)
		)
			captures.add(node.variable);
		for (const child of node.children) visit(child, node);
	};
	for (const child of children) visit(child);
	return [...captures];
}

function scopeDescendsFrom(scope: ExpressionScope, ancestor: ExpressionScope): boolean {
	for (let cursor: ExpressionScope | undefined = scope; cursor; cursor = cursor.parent) {
		if (cursor.id === ancestor.id) return true;
	}
	return false;
}

function isBindingPosition(node: ExpressionNode, parent?: ExpressionNode): boolean {
	if (!parent || parent.children[0] !== node) return false;
	return (
		parent.category === 'declaration' ||
		parent.category === 'pattern' ||
		parent.kind === 'Parameter' ||
		parent.kind.startsWith('Import')
	);
}

/** Performs the syntax kind name domain operation. */
export function syntaxKindName(node: ts.Node): string {
	if (ts.isNumericLiteral(node)) return 'NumericLiteral';
	if (ts.isBigIntLiteral(node)) return 'BigIntLiteral';
	if (ts.isStringLiteral(node)) return 'StringLiteral';
	if (ts.isNoSubstitutionTemplateLiteral(node)) return 'NoSubstitutionTemplateLiteral';
	if (ts.isRegularExpressionLiteral(node)) return 'RegularExpressionLiteral';
	if (ts.isJsxText(node)) return 'JsxText';
	return ts.SyntaxKind[node.kind];
}

/**
 * Retains package-owned node handles by structural correspondence. Source
 * offsets remain provenance only: inserting an unrelated sibling must not
 * re-key the nodes that follow it during watch/HMR rebinding.
 */
export function alignNodeIdentities(
	sourceFile: ts.SourceFile,
	priorRoot: ExpressionNode
): Map<ts.Node, string> {
	const identities = new Map<ts.Node, string>();
	const previousSource = priorRoot.text ?? '';
	const nextSource = sourceFile.text;
	let commonPrefix = 0;
	while (
		commonPrefix < previousSource.length &&
		commonPrefix < nextSource.length &&
		previousSource.charCodeAt(commonPrefix) === nextSource.charCodeAt(commonPrefix)
	)
		commonPrefix++;
	let commonSuffix = 0;
	while (
		commonSuffix < previousSource.length - commonPrefix &&
		commonSuffix < nextSource.length - commonPrefix &&
		previousSource.charCodeAt(previousSource.length - commonSuffix - 1) ===
			nextSource.charCodeAt(nextSource.length - commonSuffix - 1)
	)
		commonSuffix++;
	const offsetDelta = nextSource.length - previousSource.length;
	const syntaxShapeCache = new WeakMap<ts.Node, string>();
	const expressionShapeCache = new WeakMap<ExpressionNode, string>();
	const syntaxChildren = (node: ts.Node): ts.Node[] => {
		const children: ts.Node[] = [];
		ts.forEachChild(node, (child) => {
			children.push(child);
		});
		return children;
	};
	const syntaxShallow = (node: ts.Node): string => {
		const children = syntaxChildren(node);
		const leaf = children.length
			? ''
			: sourceFile.text.slice(node.getStart(sourceFile, false), node.end);
		return `${syntaxKindName(node)}\0${nodeName(node) ?? ''}\0${nodeOperator(node) ?? ''}\0${leaf}`;
	};
	const expressionShallow = (node: ExpressionNode): string => {
		const leaf = node.children.length ? '' : (node.text ?? '');
		return `${node.kind}\0${node.name ?? ''}\0${node.operator ?? ''}\0${leaf}`;
	};
	const syntaxAnchor = (node: ts.Node): string => {
		const start = node.getStart(sourceFile, false);
		if (node.end <= commonPrefix) return `before:${start}:${node.end}:${syntaxKindName(node)}`;
		if (start >= nextSource.length - commonSuffix)
			return `after:${start - offsetDelta}:${node.end - offsetDelta}:${syntaxKindName(node)}`;
		return '';
	};
	const expressionAnchor = (node: ExpressionNode): string => {
		const span = node.span;
		if (!span) return '';
		if (span.end <= commonPrefix) return `before:${span.start}:${span.end}:${node.kind}`;
		if (span.start >= previousSource.length - commonSuffix)
			return `after:${span.start}:${span.end}:${node.kind}`;
		return '';
	};
	const syntaxShape = (node: ts.Node): string => {
		const cached = syntaxShapeCache.get(node);
		if (cached) return cached;
		let left = 0x811c9dc5;
		let right = 0x9e3779b9;
		const mix = (value: string) => {
			for (let index = 0; index < value.length; index++) {
				left = Math.imul(left ^ value.charCodeAt(index), 0x01000193);
				right = Math.imul(right ^ value.charCodeAt(index), 0x85ebca6b);
			}
		};
		mix(syntaxShallow(node));
		const children = syntaxChildren(node);
		for (const child of children) mix(syntaxShape(child));
		const value = `${syntaxKindName(node)}:${children.length}:${left >>> 0}:${right >>> 0}`;
		syntaxShapeCache.set(node, value);
		return value;
	};
	const expressionShape = (node: ExpressionNode): string => {
		const cached = expressionShapeCache.get(node);
		if (cached) return cached;
		let left = 0x811c9dc5;
		let right = 0x9e3779b9;
		const mix = (value: string) => {
			for (let index = 0; index < value.length; index++) {
				left = Math.imul(left ^ value.charCodeAt(index), 0x01000193);
				right = Math.imul(right ^ value.charCodeAt(index), 0x85ebca6b);
			}
		};
		mix(expressionShallow(node));
		for (const child of node.children) mix(expressionShape(child));
		const value = `${node.kind}:${node.children.length}:${left >>> 0}:${right >>> 0}`;
		expressionShapeCache.set(node, value);
		return value;
	};
	const pairBy = <T, U>(
		next: readonly T[],
		previous: readonly U[],
		pairedNext: Set<number>,
		pairedPrevious: Set<number>,
		nextKey: (value: T) => string,
		previousKey: (value: U) => string
	): Array<readonly [number, number]> => {
		const queues = new Map<string, number[]>();
		previous.forEach((value, index) => {
			if (pairedPrevious.has(index)) return;
			const key = previousKey(value);
			if (!key) return;
			const queue = queues.get(key) ?? [];
			queue.push(index);
			queues.set(key, queue);
		});
		const pairs: Array<readonly [number, number]> = [];
		next.forEach((value, index) => {
			if (pairedNext.has(index)) return;
			const key = nextKey(value);
			if (!key) return;
			const queue = queues.get(key);
			const previousIndex = queue?.shift();
			if (previousIndex === undefined) return;
			pairedNext.add(index);
			pairedPrevious.add(previousIndex);
			pairs.push([index, previousIndex]);
		});
		return pairs;
	};
	const align = (next: ts.Node, previous: ExpressionNode): void => {
		if (syntaxKindName(next) !== previous.kind) return;
		identities.set(next, previous.id);
		const nextChildren = syntaxChildren(next);
		const previousChildren = previous.children;
		const pairedNext = new Set<number>();
		const pairedPrevious = new Set<number>();
		const anchored = pairBy(
			nextChildren,
			previousChildren,
			pairedNext,
			pairedPrevious,
			syntaxAnchor,
			expressionAnchor
		);
		const exact = pairBy(
			nextChildren,
			previousChildren,
			pairedNext,
			pairedPrevious,
			syntaxShape,
			expressionShape
		);
		const compatible = pairBy(
			nextChildren,
			previousChildren,
			pairedNext,
			pairedPrevious,
			syntaxShallow,
			expressionShallow
		);
		for (const [nextIndex, previousIndex] of [...anchored, ...exact, ...compatible]) {
			align(nextChildren[nextIndex]!, previousChildren[previousIndex]!);
		}
	};
	align(sourceFile, priorRoot);
	return identities;
}

/** Performs the walk expression nodes domain operation. */
export function* walkExpressionNodes(root: ExpressionNode): Iterable<ExpressionNode> {
	yield root;
	for (const child of root.children) yield* walkExpressionNodes(child);
}

/** Performs the declaration identity domain operation. */
export function declarationIdentity(
	filename: string,
	declaration: ts.Node,
	name: string,
	revision: string
): string {
	const scopes: string[] = [];
	let cursor = declaration.parent;
	while (cursor && !ts.isSourceFile(cursor)) {
		if (
			ts.isFunctionLike(cursor) ||
			ts.isClassLike(cursor) ||
			ts.isModuleDeclaration(cursor) ||
			ts.isBlock(cursor) ||
			ts.isCaseBlock(cursor) ||
			ts.isCatchClause(cursor)
		) {
			const named = hasNodeName(cursor) && cursor.name ? cursor.name.getText() : undefined;
			const functionBody =
				ts.isBlock(cursor) &&
				ts.isFunctionLike(cursor.parent) &&
				'body' in cursor.parent &&
				cursor.parent.body === cursor;
			scopes.push(
				named
					? `${ts.SyntaxKind[cursor.kind]}:${named}`
					: functionBody
						? 'Block:function-body'
						: `${ts.SyntaxKind[cursor.kind]}:${scopeShape(cursor)}#${structuralOrdinal(cursor)}` +
							(hasAmbiguousScopePeer(cursor) ? `@${revision}` : '')
			);
		}
		cursor = cursor.parent;
	}
	return `${filename}:${scopes.reverse().join('/')}:${ts.SyntaxKind[declaration.kind]}#${declarationOrdinal(declaration, name)}:${name}`;
}

const indexedIdentityOwners = new WeakSet<ts.Node>();
const structuralOrdinals = new WeakMap<ts.Node, number>();
const ambiguousIdentityScopes = new WeakSet<ts.Node>();

function structuralOrdinal(node: ts.Node): number {
	const owner = nearestIdentityScope(node.parent);
	if (!owner) return 0;
	indexIdentityScopes(owner);
	return structuralOrdinals.get(node) ?? 0;
}

function hasAmbiguousScopePeer(node: ts.Node): boolean {
	const owner = nearestIdentityScope(node.parent);
	if (!owner) return false;
	indexIdentityScopes(owner);
	return ambiguousIdentityScopes.has(node);
}

function indexIdentityScopes(owner: ts.Node): void {
	if (indexedIdentityOwners.has(owner)) return;
	indexedIdentityOwners.add(owner);
	const groups = new Map<string, ts.Node[]>();
	walkIdentityScopes(owner, (candidate) => {
		const key = `${candidate.kind}:${scopeShape(candidate)}`;
		let group = groups.get(key);
		if (!group) groups.set(key, (group = []));
		structuralOrdinals.set(candidate, group.length);
		group.push(candidate);
		return true;
	});
	for (const group of groups.values()) {
		if (new Set(group.map((node) => node.parent)).size > 1) {
			for (const node of group) ambiguousIdentityScopes.add(node);
		}
	}
}

function walkIdentityScopes(owner: ts.Node, visit: (node: ts.Node) => boolean): void {
	const walk = (node: ts.Node): boolean => {
		if (node !== owner && isIdentityScope(node)) {
			if (!visit(node)) return false;
			if (ts.isFunctionLike(node) || ts.isClassLike(node) || ts.isModuleDeclaration(node))
				return true;
		}
		for (const child of node.getChildren()) if (!walk(child)) return false;
		return true;
	};
	walk(owner);
}

function isIdentityScope(node: ts.Node): boolean {
	return (
		ts.isFunctionLike(node) ||
		ts.isClassLike(node) ||
		ts.isModuleDeclaration(node) ||
		ts.isBlock(node) ||
		ts.isCaseBlock(node) ||
		ts.isCatchClause(node)
	);
}

function scopeShape(node: ts.Node): string {
	const bindings: string[] = [];
	node.forEachChild((child) => {
		if (ts.isVariableStatement(child)) {
			for (const declaration of child.declarationList.declarations) {
				bindings.push(`${ts.SyntaxKind[declaration.kind]}:${declaration.name.getText()}`);
			}
		} else if ((ts.isFunctionDeclaration(child) || ts.isClassDeclaration(child)) && child.name) {
			bindings.push(`${ts.SyntaxKind[child.kind]}:${child.name.text}`);
		}
	});
	return `${ts.SyntaxKind[node.parent?.kind ?? ts.SyntaxKind.Unknown]}:${fingerprint(bindings.join('|'))}`;
}

function declarationOrdinal(declaration: ts.Node, _name: string): number {
	const owner = nearestIdentityScope(declaration.parent);
	if (!owner) return 0;
	indexDeclarationOrdinals(owner);
	return declarationOrdinals.get(declaration) ?? 0;
}

const indexedDeclarationOwners = new WeakSet<ts.Node>();
const declarationOrdinals = new WeakMap<ts.Node, number>();

function indexDeclarationOrdinals(owner: ts.Node): void {
	if (indexedDeclarationOwners.has(owner)) return;
	indexedDeclarationOwners.add(owner);
	const counts = new Map<string, number>();
	const visit = (node: ts.Node): void => {
		if (node !== owner && (ts.isFunctionLike(node) || ts.isClassLike(node))) return;
		const name = declarationBindingName(node);
		if (name !== undefined) {
			const key = `${node.kind}\0${name}\0${fingerprint(node.getText().replace(/\s+/g, ' '))}`;
			const ordinal = counts.get(key) ?? 0;
			declarationOrdinals.set(node, ordinal);
			counts.set(key, ordinal + 1);
		}
		ts.forEachChild(node, visit);
	};
	visit(owner);
}

function nearestIdentityScope(node: ts.Node | undefined): ts.Node | undefined {
	for (let cursor = node; cursor; cursor = cursor.parent) {
		if (
			ts.isSourceFile(cursor) ||
			ts.isFunctionLike(cursor) ||
			ts.isClassLike(cursor) ||
			ts.isBlock(cursor) ||
			ts.isCaseBlock(cursor) ||
			ts.isCatchClause(cursor) ||
			ts.isModuleBlock(cursor)
		)
			return cursor;
	}
	return undefined;
}
