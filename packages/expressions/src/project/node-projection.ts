import { performance } from 'node:perf_hooks';
import ts from 'typescript';
import type {
	ExpressionCallSignature,
	ExpressionNode,
	ExpressionType,
	SourceSpan,
	Variable
} from '../model.js';
import type { ProjectionCounters } from './contracts.js';
import type { ExpressionDirectiveIndex } from './directives.js';
import {
	alignNodeIdentities,
	functionCaptures,
	syntaxKindName,
	walkExpressionNodes
} from './identity.js';
import type { ProjectScope } from './projection-model.js';
import { signatureFor } from './signatures.js';
import { freezeSourceNode } from './source-nodes.js';
import { category, collectBindingIdentifiers, nodeName, nodeOperator } from './syntax.js';

type NodeProjectionBucket = 'metadata' | 'types' | 'bindings' | 'common' | 'specialization';

/** Configures expression node projection. */
export type ExpressionNodeProjectionOptions = {
	filename: string;
	sourceFile: ts.SourceFile;
	checker: ts.TypeChecker;
	detailedProfile: boolean;
	counters: ProjectionCounters;
	directives: ExpressionDirectiveIndex;
	priorRoot?: ExpressionNode;
	overlayVersion: number;
	measure<T>(bucket: NodeProjectionBucket, operation: () => T): T;
	typeFor(type: ts.Type, at: ts.Node): ExpressionType;
	displayType(type: ts.Type, at: ts.Node): string;
	displaySignature(signature: ts.Signature, at: ts.Node): string;
	scopeFor(node: ts.Node): ProjectScope;
	variableFor(identifier: ts.Identifier): Variable | undefined;
	variableForThis(node: ts.Node): Variable;
};

/** Converts one TypeScript source tree into immutable expression nodes. */
export function projectExpressionNodes(options: ExpressionNodeProjectionOptions) {
	const {
		filename,
		sourceFile,
		checker,
		detailedProfile,
		counters: projectionCounters,
		directives,
		measure: measureProjection,
		typeFor,
		displayType,
		displaySignature,
		scopeFor,
		variableFor,
		variableForThis
	} = options;
	let nodeSequence = 0;
	let convertedNodeCount = 0;
	const identityStarted = detailedProfile ? performance.now() : undefined;
	const priorRoot = options.priorRoot;
	const retainedNodeIds = priorRoot
		? alignNodeIdentities(sourceFile, priorRoot)
		: new Map<ts.Node, string>();
	const allocatedNodeIds = new Set<string>(
		priorRoot ? [...walkExpressionNodes(priorRoot)].map((node) => node.id) : []
	);
	const identityElapsed =
		identityStarted === undefined ? undefined : performance.now() - identityStarted;
	const nodeId = (node: ts.Node, start: number, kind: string): string => {
		const retained = retainedNodeIds.get(node);
		if (retained) return retained;
		const base = `${filename}:node:${start}:${node.end}:${kind}:${nodeSequence++}`;
		if (!allocatedNodeIds.has(base)) {
			allocatedNodeIds.add(base);
			return base;
		}
		const revision = options.overlayVersion ?? 0;
		let suffix = 1;
		let candidate = `${base}:new:${revision}:${suffix}`;
		while (allocatedNodeIds.has(candidate)) candidate = `${base}:new:${revision}:${++suffix}`;
		allocatedNodeIds.add(candidate);
		return candidate;
	};
	const convert = (node: ts.Node): ExpressionNode => {
		convertedNodeCount++;
		const children: ExpressionNode[] = [];
		ts.forEachChild(node, (child) => {
			children.push(convert(child));
		});
		const metadata = measureProjection('metadata', () => {
			const start = ts.isSourceFile(node) ? 0 : node.getStart(sourceFile, false);
			const line = sourceFile.getLineAndCharacterOfPosition(start);
			return {
				start,
				kind: syntaxKindName(node),
				span: Object.freeze({
					start,
					end: node.end,
					line: line.line + 1,
					column: line.character + 1
				} satisfies SourceSpan)
			};
		});
		const semanticType = measureProjection('types', () => {
			if (!ts.isExpression(node)) return undefined;
			try {
				if (detailedProfile) projectionCounters.checkerTypeQueries++;
				return typeFor(checker.getTypeAtLocation(node), node);
			} catch {
				// Invalid code is represented alongside diagnostics.
				return undefined;
			}
		});
		const variable = measureProjection('bindings', () =>
			ts.isIdentifier(node)
				? variableFor(node)
				: node.kind === ts.SyntaxKind.ThisKeyword
					? variableForThis(node)
					: undefined
		);
		const common = measureProjection(
			'common',
			(): ExpressionNode => ({
				id: nodeId(node, metadata.start, metadata.kind),
				kind: metadata.kind,
				category: category(node),
				span: metadata.span,
				children: Object.freeze(children),
				synthetic: false,
				scope: scopeFor(node),
				type: semanticType,
				variable,
				name: nodeName(node),
				operator: nodeOperator(node),
				directives: directives.forBinding(node)
			})
		);
		return measureProjection('specialization', () => {
			if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
				const target = children[0]!;
				const argumentOffset = 1 + (node.typeArguments?.length ?? 0);
				let resolvedSignature: ExpressionCallSignature | undefined;
				if (ts.isCallExpression(node)) {
					if (detailedProfile) projectionCounters.resolvedSignatureQueries++;
					const signature = checker.getResolvedSignature(node);
					if (signature) {
						resolvedSignature = signatureFor(
							signature,
							node,
							checker,
							typeFor,
							(candidate, inline) => directives.for(candidate, inline),
							displayType,
							displaySignature
						);
					}
				}
				return freezeSourceNode(
					{
						...common,
						target,
						arguments: Object.freeze(children.slice(argumentOffset)),
						...(resolvedSignature ? { resolvedSignature } : {})
					},
					sourceFile.text
				);
			}
			if (ts.isFunctionLike(node)) {
				const parameters = node.parameters.flatMap((parameter) =>
					parameter.name.getText(sourceFile) === 'this'
						? [variableForThis(parameter.name)]
						: collectBindingIdentifiers(parameter.name)
								.map(variableFor)
								.filter((value): value is Variable => !!value)
				);
				return freezeSourceNode(
					{
						...common,
						parameters: Object.freeze(parameters),
						captures: Object.freeze(functionCaptures(children, common.scope))
					},
					sourceFile.text
				);
			}
			if (ts.isJsxElement(node)) {
				const opening = children[0]!;
				const attributes =
					opening.children.find((child) => child.kind === 'JsxAttributes')?.children ?? [];
				return freezeSourceNode(
					{
						...common,
						tagName: node.openingElement.tagName.getText(sourceFile),
						attributes: Object.freeze(attributes),
						jsxChildren: Object.freeze(children.slice(1, -1))
					},
					sourceFile.text
				);
			}
			if (ts.isJsxSelfClosingElement(node)) {
				const attributes = children.find((child) => child.kind === 'JsxAttributes')?.children ?? [];
				return freezeSourceNode(
					{
						...common,
						tagName: node.tagName.getText(sourceFile),
						attributes: Object.freeze(attributes),
						jsxChildren: Object.freeze([])
					},
					sourceFile.text
				);
			}
			if (ts.isJsxFragment(node)) {
				return freezeSourceNode(
					{
						...common,
						attributes: Object.freeze([]),
						jsxChildren: Object.freeze(children.slice(1, -1))
					},
					sourceFile.text
				);
			}
			if (ts.isJsxAttribute(node) || ts.isJsxSpreadAttribute(node)) {
				return freezeSourceNode(
					{
						...common,
						name: ts.isJsxAttribute(node) ? node.name.getText(sourceFile) : undefined,
						initializer: children.at(-1)
					},
					sourceFile.text
				);
			}
			return freezeSourceNode(common, sourceFile.text);
		});
	};

	const nodeConversionStarted = detailedProfile ? performance.now() : undefined;
	const root = convert(sourceFile);
	const nodeConversionElapsed =
		nodeConversionStarted === undefined ? undefined : performance.now() - nodeConversionStarted;

	return { root, convertedNodeCount, identityElapsed, nodeConversionElapsed };
}
