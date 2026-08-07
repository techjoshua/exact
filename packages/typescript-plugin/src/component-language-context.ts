import type * as tsModule from 'typescript/lib/tsserverlibrary';

type TypeScript = typeof tsModule;

/** Returns the narrowest AST node containing a language-service offset. */
export function deepestNodeAtPosition(
	sourceFile: tsModule.SourceFile,
	position: number
): tsModule.Node | undefined {
	let result: tsModule.Node | undefined;
	visit(sourceFile);
	return result;
	function visit(node: tsModule.Node): void {
		if (position < node.getFullStart() || position >= node.getEnd()) return;
		result = node;
		node.forEachChild(visit);
	}
}

/** Finds the nearest outer function with an authored eXact component receiver. */
export function enclosingComponentReceiver(
	typescript: TypeScript,
	sourceFile: tsModule.SourceFile,
	receiver: tsModule.Node
): tsModule.ParameterDeclaration | undefined {
	let current: tsModule.Node | undefined = receiver.parent;
	let crossedLocalFunction = false;
	while (current) {
		if (typescript.isFunctionLike(current)) {
			const componentReceiver = authoredComponentReceiver(typescript, sourceFile, current);
			if (crossedLocalFunction && componentReceiver) return componentReceiver;
			crossedLocalFunction = true;
		}
		current = current.parent;
	}
	return undefined;
}

function authoredComponentReceiver(
	typescript: TypeScript,
	sourceFile: tsModule.SourceFile,
	callable: tsModule.SignatureDeclaration
): tsModule.ParameterDeclaration | undefined {
	return callable.parameters.find(
		(parameter) =>
			typescript.isIdentifier(parameter.name) &&
			parameter.name.text === 'this' &&
			!!parameter.type &&
			/\bComponent\s*</.test(parameter.type.getText(sourceFile))
	);
}

/** Tests the compiler-reserved import attribute without depending on module naming conventions. */
export function isExactEnhancementImport(
	typescript: TypeScript,
	declaration: tsModule.ImportDeclaration
): boolean {
	return !!declaration.attributes?.elements.some(
		(attribute) =>
			attribute.name.text === 'type' &&
			typescript.isStringLiteral(attribute.value) &&
			attribute.value.text === 'exact-enhancement'
	);
}
