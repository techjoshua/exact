import ts from 'typescript';
import type { ExactCompilerManifest, ExactSymbolIR, TransformTarget } from './types.js';

type DescriptorGroup = {
	protocol: string;
	entries: Array<{
		symbol: ExactSymbolIR;
		componentImplementation: boolean;
	}>;
};

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
				protocol:
					target === 'client'
						? '@exactjs/client-component-descriptor'
						: '@exactjs/server-component-descriptor',
				entries
			});
	}

	return (context) => (sourceFile) => {
		if (!groups.size) return sourceFile;
		const statements: ts.Statement[] = [];
		const descriptorSymbol = context.factory.createUniqueName(
			target === 'client' ? '__exactClientComponentDescriptor' : '__exactServerComponentDescriptor'
		);
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
			target === 'client'
				? '@exactjs/client-component-descriptor'
				: '@exactjs/server-component-descriptor',
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
	const attachment = descriptorAttachment(
		implementation,
		implementation,
		group,
		descriptorSymbol,
		factory,
		false
	);
	return pure(
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
	const attachment = descriptorAttachment(
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
	const attachment = descriptorAttachment(
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

function descriptorAttachment(
	implementation: ts.Expression,
	component: ts.Expression,
	group: DescriptorGroup,
	descriptorSymbol: ts.Identifier,
	factory: ts.NodeFactory,
	markPure: boolean
): ts.Expression {
	const entries = group.entries.map((entry) =>
		factory.createArrayLiteralExpression([
			factory.createStringLiteral(entry.symbol.id),
			factory.createStringLiteral(entry.symbol.generatedName),
			entry.componentImplementation ? component : factory.createIdentifier(entry.symbol.localName)
		])
	);
	const descriptor = factory.createObjectLiteralExpression(
		[
			factory.createPropertyAssignment(
				factory.createComputedPropertyName(descriptorSymbol),
				factory.createArrayLiteralExpression(
					[factory.createNumericLiteral(1), factory.createArrayLiteralExpression(entries, true)],
					true
				)
			)
		],
		true
	);
	const attachment = factory.createCallExpression(
		factory.createPropertyAccessExpression(factory.createIdentifier('Object'), 'assign'),
		undefined,
		[implementation, descriptor]
	);
	if (!markPure) return attachment;
	return pure(
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

function createDescriptorSymbolDeclaration(
	name: ts.Identifier,
	protocol: string,
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
					pure(
						factory.createCallExpression(
							factory.createPropertyAccessExpression(factory.createIdentifier('Symbol'), 'for'),
							undefined,
							[factory.createStringLiteral(protocol)]
						)
					)
				)
			],
			ts.NodeFlags.Const
		)
	);
}

function pure<T extends ts.Node>(node: T): T {
	return ts.addSyntheticLeadingComment(
		node,
		ts.SyntaxKind.MultiLineCommentTrivia,
		' @__PURE__ ',
		false
	);
}
