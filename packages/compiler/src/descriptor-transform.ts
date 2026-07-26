import ts from 'typescript';
import {
	createComponentContractAttachment,
	pureExpression,
	type ComponentContractEmission
} from './component-contract-emission.js';
import { createContinuationExecutorEmissions } from './continuation-executor-emission.js';
import type { ExactCompilerManifest, TransformTarget } from './types.js';

type DescriptorGroup = ComponentContractEmission & {
	clientMachine: boolean;
	brandOnly: boolean;
};

/**
 * Attaches target-local artifact implementations to the exported component
 * function. The wrapper is a used pure initializer, so tree shakers retain it
 * with the component and remove both together.
 */
export function exactComponentDescriptorTransformer(
	manifest: ExactCompilerManifest,
	target: TransformTarget,
	preserveHoisting = false,
	serverComponents = false
): ts.TransformerFactory<ts.SourceFile> {
	if (target === 'default') return () => (sourceFile) => sourceFile;
	const groups = new Map<string, DescriptorGroup>();
	for (const component of manifest.components) {
		const clientMachine =
			component.placement === 'client' ||
			(!serverComponents && component.placement === 'isomorphic');
		const distributedContinuations = manifest.continuations.filter(
			(continuation) =>
				continuation.componentId === component.id && continuation.placement === 'server'
		);
		const generatedEntries = manifest.symbols.filter(
			(symbol) =>
				symbol.componentId === component.id &&
				symbol.target === target &&
				!!symbol.exportName &&
				symbol.role === (target === 'client' ? 'client-island' : 'server-part')
		);
		const rootEntry =
			clientMachine &&
			((component.placement === 'client' && target === 'client') ||
				(component.placement === 'isomorphic' && distributedContinuations.length > 0) ||
				(component.placement === 'isomorphic' &&
					target === 'client' &&
					!serverComponents &&
					generatedEntries.length > 0))
				? manifest.symbols.find(
						(symbol) => symbol.componentId === component.id && symbol.role === 'root'
					)
				: undefined;
		const entries = rootEntry
			? [{ symbol: rootEntry, componentImplementation: true }]
			: generatedEntries.map((symbol) => ({
					symbol,
					componentImplementation: symbol.localName === component.name
				}));
		const executableOnTarget =
			target === 'client'
				? component.placement === 'client' || component.placement === 'isomorphic'
				: component.placement === 'server' || component.placement === 'isomorphic';
		if (entries.length || executableOnTarget) {
			const boundaries = manifest.boundaries.filter(
				(boundary) =>
					boundary.ownerComponentId === component.id &&
					(!clientMachine || boundary.componentId !== boundary.ownerComponentId)
			);
			const boundaryIds = new Set(boundaries.map((boundary) => boundary.id));
			const resumption = manifest.resumptions.find(
				(candidate) => candidate.componentId === component.id
			);
			groups.set(component.name, {
				componentId: component.id,
				placement: component.placement,
				role: target === 'client' ? 'client' : 'executor',
				clientMachine,
				brandOnly: entries.length === 0,
				entries,
				continuations: clientMachine
					? distributedContinuations.map((continuation) => ({
							...continuation,
							effects: {
								...continuation.effects,
								boundaries: continuation.effects.boundaries.filter((id) => boundaryIds.has(id))
							}
						}))
					: [],
				executors: [],
				boundaries,
				resumption:
					resumption && clientMachine
						? {
								...resumption,
								client: {
									...resumption.client,
									boundaries: resumption.client.boundaries.filter((id) => boundaryIds.has(id))
								}
							}
						: resumption
			});
		}
	}

	return (context) => (sourceFile) => {
		if (!groups.size) return sourceFile;
		const statements: ts.Statement[] = [];
		const descriptorSymbol = context.factory.createUniqueName('__exactComponentContract');
		for (const statement of sourceFile.statements) {
			if (ts.isVariableStatement(statement)) {
				const declarations = statement.declarationList.declarations.map((declaration) => {
					if (
						!ts.isIdentifier(declaration.name) ||
						!declaration.initializer ||
						(!ts.isArrowFunction(declaration.initializer) &&
							!ts.isFunctionExpression(declaration.initializer))
					)
						return declaration;
					const group = groups.get(declaration.name.text);
					if (!group) return declaration;
					return context.factory.updateVariableDeclaration(
						declaration,
						declaration.name,
						declaration.exclamationToken,
						declaration.type,
						group.brandOnly
							? createComponentBrandAttachment(declaration.initializer, context.factory)
							: wrapComponentValue(
									declaration.initializer,
									withContinuationExecutors(
										group,
										declaration.initializer,
										context,
										sourceFile.fileName
									),
									descriptorSymbol,
									context.factory
								)
					);
				});
				statements.push(
					context.factory.updateVariableStatement(
						statement,
						statement.modifiers,
						context.factory.updateVariableDeclarationList(statement.declarationList, declarations)
					)
				);
				continue;
			}
			if (
				!ts.isFunctionDeclaration(statement) ||
				!statement.name ||
				!groups.has(statement.name.text)
			) {
				statements.push(statement);
				continue;
			}
			const group = groups.get(statement.name.text)!;
			statements.push(
				...(group.brandOnly
					? [
							statement,
							context.factory.createExpressionStatement(
								createComponentBrandAttachment(statement.name, context.factory)
							)
						]
					: preserveHoisting
						? attachToHoistedComponentFunction(
								statement,
								withContinuationExecutors(group, statement, context, sourceFile.fileName),
								descriptorSymbol,
								context.factory
							)
						: wrapComponentFunction(
								statement,
								withContinuationExecutors(group, statement, context, sourceFile.fileName),
								descriptorSymbol,
								context.factory
							))
			);
		}
		const needsDescriptor = [...groups.values()].some((group) => !group.brandOnly);
		const descriptorDeclaration = needsDescriptor
			? createDescriptorSymbolDeclaration(descriptorSymbol, context.factory)
			: undefined;
		let insertionIndex = 0;
		while (insertionIndex < statements.length) {
			const statement = statements[insertionIndex]!;
			if (
				!ts.isImportDeclaration(statement) &&
				!(ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression))
			)
				break;
			insertionIndex++;
		}
		if (descriptorDeclaration) statements.splice(insertionIndex, 0, descriptorDeclaration);
		return context.factory.updateSourceFile(sourceFile, statements);
	};
}

/** Adds only the native ownership marker when no executable artifact contract exists. */
function createComponentBrandAttachment(
	component: ts.Expression,
	factory: ts.NodeFactory
): ts.Expression {
	return factory.createCallExpression(
		factory.createPropertyAccessExpression(factory.createIdentifier('Object'), 'assign'),
		undefined,
		[
			component,
			factory.createObjectLiteralExpression([
				factory.createPropertyAssignment(
					factory.createComputedPropertyName(
						factory.createCallExpression(
							factory.createPropertyAccessExpression(factory.createIdentifier('Symbol'), 'for'),
							undefined,
							[factory.createStringLiteral('@exactjs/component')]
						)
					),
					factory.createTrue()
				)
			])
		]
	);
}

/** Adds executable server task segments after JSX/task lowering has completed. */
function withContinuationExecutors(
	group: DescriptorGroup,
	component: ts.FunctionLikeDeclaration,
	context: ts.TransformationContext,
	filename: string
): DescriptorGroup {
	if (group.role !== 'executor' || !group.clientMachine || !group.continuations.length)
		return group;
	return {
		...group,
		executors: [
			...createContinuationExecutorEmissions(component, group.continuations, context, filename)
		]
	};
}

function wrapComponentValue(
	initializer: ts.ArrowFunction | ts.FunctionExpression,
	group: DescriptorGroup,
	descriptorSymbol: ts.Identifier,
	factory: ts.NodeFactory
): ts.Expression {
	const implementation = factory.createUniqueName('__exactComponentImplementation');
	const attachment = createComponentContractAttachment(
		implementation,
		implementation,
		group,
		descriptorSymbol,
		factory,
		false
	);
	return pureExpression(
		factory.createCallExpression(
			factory.createParenthesizedExpression(
				factory.createArrowFunction(
					undefined,
					undefined,
					[],
					undefined,
					factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
					factory.createBlock(
						[
							factory.createVariableStatement(
								undefined,
								factory.createVariableDeclarationList(
									[
										factory.createVariableDeclaration(
											implementation,
											undefined,
											undefined,
											initializer
										)
									],
									ts.NodeFlags.Const
								)
							),
							factory.createReturnStatement(attachment)
						],
						true
					)
				)
			),
			undefined,
			[]
		)
	);
}

function attachToHoistedComponentFunction(
	declaration: ts.FunctionDeclaration,
	group: DescriptorGroup,
	descriptorSymbol: ts.Identifier,
	factory: ts.NodeFactory
): ts.Statement[] {
	const attachment = createComponentContractAttachment(
		declaration.name!,
		declaration.name!,
		group,
		descriptorSymbol,
		factory,
		false
	);
	return [declaration, factory.createExpressionStatement(attachment)];
}

function wrapComponentFunction(
	declaration: ts.FunctionDeclaration,
	group: DescriptorGroup,
	descriptorSymbol: ts.Identifier,
	factory: ts.NodeFactory
): ts.Statement[] {
	const name = declaration.name!;
	const implementationName = factory.createUniqueName(`__exactImplementation_${name.text}`);
	const defaultExport =
		declaration.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword) ??
		false;
	const exported =
		declaration.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ??
		false;
	const functionModifiers = declaration.modifiers
		?.filter(ts.isModifier)
		.filter(
			(modifier) =>
				modifier.kind !== ts.SyntaxKind.ExportKeyword &&
				modifier.kind !== ts.SyntaxKind.DefaultKeyword
		);
	const implementation = factory.createFunctionExpression(
		functionModifiers,
		declaration.asteriskToken,
		name,
		declaration.typeParameters,
		declaration.parameters,
		declaration.type,
		declaration.body ?? factory.createBlock([])
	);
	const attachment = createComponentContractAttachment(
		implementationName,
		implementationName,
		group,
		descriptorSymbol,
		factory,
		true
	);
	const implementationVariable = factory.createVariableStatement(
		undefined,
		factory.createVariableDeclarationList(
			[factory.createVariableDeclaration(implementationName, undefined, undefined, implementation)],
			ts.NodeFlags.Const
		)
	);
	const exportedVariable = factory.createVariableStatement(
		exported && !defaultExport ? [factory.createModifier(ts.SyntaxKind.ExportKeyword)] : undefined,
		factory.createVariableDeclarationList(
			[
				factory.createVariableDeclaration(
					name,
					undefined,
					factory.createTypeQueryNode(implementationName),
					attachment
				)
			],
			ts.NodeFlags.Const
		)
	);
	if (!defaultExport) return [implementationVariable, exportedVariable];
	return [
		implementationVariable,
		exportedVariable,
		factory.createExportDefault(factory.createIdentifier(name.text))
	];
}

function createDescriptorSymbolDeclaration(
	name: ts.Identifier,
	factory: ts.NodeFactory
): ts.VariableStatement {
	return factory.createVariableStatement(
		undefined,
		factory.createVariableDeclarationList(
			[
				factory.createVariableDeclaration(
					name,
					undefined,
					undefined,
					pureExpression(
						factory.createCallExpression(
							factory.createPropertyAccessExpression(factory.createIdentifier('Symbol'), 'for'),
							undefined,
							[factory.createStringLiteral('@exactjs/component-contract')]
						)
					)
				)
			],
			ts.NodeFlags.Const
		)
	);
}
