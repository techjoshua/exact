import ts from 'typescript';

/** Reads a type node from its source representation. */
export function parseTypeNode(source: string): ts.TypeNode {
	const file = ts.createSourceFile(
		'__exact_generated_type.ts',
		`type __ExactGeneratedType = ${source};`,
		ts.ScriptTarget.Latest,
		false,
		ts.ScriptKind.TS
	);
	const declaration = file.statements[0];
	if (!declaration || !ts.isTypeAliasDeclaration(declaration))
		return ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword);
	return declaration.type;
}
