import ts from 'typescript';
import { continuationDescriptorExpression, inertMetadataExpression } from './descriptor-values.js';
import type {
	ExactBoundaryIR,
	ExactComponentResumptionIR,
	ExactContinuationIR,
	ExactPlacement,
	ExactSymbolIR
} from './types.js';

/** Compiler data required to attach one target-local component contract. */
export type ComponentContractEmission = {
	componentId: string;
	placement: ExactPlacement;
	role: 'client' | 'executor';
	entries: Array<{
		symbol: ExactSymbolIR;
		componentImplementation: boolean;
	}>;
	continuations: ExactContinuationIR[];
	boundaries: ExactBoundaryIR[];
	resumption?: ExactComponentResumptionIR;
};

/** Attaches one inert target-local contract to its public executable component root. */
export function createComponentContractAttachment(
	implementation: ts.Expression,
	component: ts.Expression,
	contract: ComponentContractEmission,
	contractSymbol: ts.Identifier,
	factory: ts.NodeFactory,
	markPure: boolean
): ts.Expression {
	const implementations = contract.entries.map((entry) =>
		factory.createObjectLiteralExpression([
			factory.createPropertyAssignment('id', factory.createStringLiteral(entry.symbol.id)),
			factory.createPropertyAssignment(
				'name',
				factory.createStringLiteral(entry.symbol.generatedName)
			),
			factory.createPropertyAssignment('role', factory.createStringLiteral(entry.symbol.role)),
			factory.createPropertyAssignment(
				'implementation',
				entry.componentImplementation ? component : factory.createIdentifier(entry.symbol.localName)
			)
		])
	);
	const attachment = factory.createCallExpression(
		factory.createPropertyAccessExpression(factory.createIdentifier('Object'), 'assign'),
		undefined,
		[
			implementation,
			factory.createObjectLiteralExpression(
				[
					factory.createPropertyAssignment(
						factory.createComputedPropertyName(contractSymbol),
						componentContractExpression(contract, implementations, factory)
					)
				],
				true
			)
		]
	);
	if (!markPure) return attachment;
	return pureExpression(
		factory.createCallExpression(
			factory.createParenthesizedExpression(
				factory.createArrowFunction(
					undefined,
					undefined,
					[],
					undefined,
					factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
					attachment
				)
			),
			undefined,
			[]
		)
	);
}

/** Emits the named contract value without evaluating compiler metadata. */
function componentContractExpression(
	contract: ComponentContractEmission,
	implementations: readonly ts.Expression[],
	factory: ts.NodeFactory
): ts.ObjectLiteralExpression {
	return factory.createObjectLiteralExpression(
		[
			factory.createPropertyAssignment('version', factory.createNumericLiteral(1)),
			factory.createPropertyAssignment('id', factory.createStringLiteral(contract.componentId)),
			factory.createPropertyAssignment(
				'placement',
				factory.createStringLiteral(contract.placement)
			),
			factory.createPropertyAssignment('role', factory.createStringLiteral(contract.role)),
			factory.createPropertyAssignment(
				'implementations',
				factory.createArrayLiteralExpression(implementations, true)
			),
			factory.createPropertyAssignment(
				'continuations',
				continuationDescriptorExpression(
					contract.continuations,
					contract.role === 'client',
					factory
				)
			),
			factory.createPropertyAssignment(
				'boundaries',
				inertMetadataExpression(
					contract.boundaries.map((boundary) => ({
						id: boundary.id,
						componentId: boundary.componentId,
						ownerComponentId: boundary.ownerComponentId ?? boundary.componentId,
						kind: boundary.kind
					})),
					factory
				)
			),
			...(contract.resumption
				? [
						factory.createPropertyAssignment(
							'resumption',
							inertMetadataExpression(
								{
									componentId: contract.resumption.componentId,
									statePaths: contract.resumption.client.statePaths,
									valueCaptures: contract.resumption.client.valueCaptures,
									boundaries: contract.resumption.client.boundaries
								},
								factory
							)
						)
					]
				: [])
		],
		true
	);
}

/** Marks a compiler-created initializer for safe tree-shaker elimination. */
export function pureExpression<T extends ts.Node>(node: T): T {
	return ts.addSyntheticLeadingComment(
		node,
		ts.SyntaxKind.MultiLineCommentTrivia,
		' @__PURE__ ',
		false
	);
}
