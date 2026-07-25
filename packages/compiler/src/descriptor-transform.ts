import ts from 'typescript';
import {
	createComponentContractAttachment,
	pureExpression,
	type ComponentContractEmission
} from './component-contract-emission.js';
import type { ExactCompilerManifest, TransformTarget } from './types.js';

type DescriptorGroup = ComponentContractEmission;

/**
 * Attaches target-local artifact implementations to the exported component
 * function. The wrapper is a used pure initializer, so tree shakers retain it
 * with the component and remove both together.
 */
export function exactComponentDescriptorTransformer(
	manifest: ExactCompilerManifest,
	target: TransformTarget,
	preserveHoisting = false
): ts.TransformerFactory<ts.SourceFile> {
	if (target === 'default') return () => (sourceFile) => sourceFile;
	const groups = new Map<string, DescriptorGroup>();
	for (const component of manifest.components) {
		const generatedEntries = manifest.symbols.filter(
			(symbol) =>
				symbol.componentId === component.id &&
				symbol.target === target &&
				!!symbol.exportName &&
				symbol.role === (target === 'client' ? 'client-island' : 'server-part')
		);
		const rootEntry =
			target === 'client' && component.placement === 'client'
				? manifest.symbols.find(
						(symbol) =>
							symbol.componentId === component.id &&
							symbol.target === 'client' &&
							symbol.role === 'root'
					)
				: undefined;
		const entries = rootEntry
			? [{ symbol: rootEntry, componentImplementation: true }]
			: generatedEntries.map((symbol) => ({
					symbol,
					componentImplementation: symbol.localName === component.name
				}));
		if (entries.length)
			groups.set(component.name, {
				componentId: component.id,
				placement: component.placement,
				role: target === 'client' ? 'client' : 'executor',
				entries,
				continuations: manifest.continuations.filter(
					(continuation) => continuation.componentId === component.id
				),
				boundaries: manifest.boundaries.filter(
					(boundary) => boundary.ownerComponentId === component.id
				),
				resumption: manifest.resumptions.find(
					(resumption) => resumption.componentId === component.id
				)
			});
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
						wrapComponentValue(declaration.initializer, group, descriptorSymbol, context.factory)
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
			statements.push(
				...(preserveHoisting
					? attachToHoistedComponentFunction(
							statement,
							groups.get(statement.name.text)!,
							descriptorSymbol,
							context.factory
						)
					: wrapComponentFunction(
							statement,
							groups.get(statement.name.text)!,
							descriptorSymbol,
							context.factory
						))
			);
		}
		const descriptorDeclaration = createDescriptorSymbolDeclaration(
			descriptorSymbol,
			context.factory
		);
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
		statements.splice(insertionIndex, 0, descriptorDeclaration);
		return context.factory.updateSourceFile(sourceFile, statements);
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
