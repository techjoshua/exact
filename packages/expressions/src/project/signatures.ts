import ts from 'typescript';
import type { ExpressionCallSignature, ExpressionDirective, ExpressionType } from '../model.js';
import { displayFile } from './syntax.js';

export function signatureFor(
	signature: ts.Signature,
	at: ts.Node,
	checker: ts.TypeChecker,
	typeFor: (type: ts.Type, at: ts.Node) => ExpressionType,
	directivesFor: (node: ts.Node | undefined, inline?: boolean) => readonly ExpressionDirective[],
	displayType: (type: ts.Type, at: ts.Node) => string,
	displaySignature: (signature: ts.Signature, at: ts.Node) => string
): ExpressionCallSignature {
	const declaration = signature.getDeclaration() ?? at;
	return Object.freeze({
		display: displaySignature(signature, at),
		parameters: Object.freeze(
			signature.getParameters().map((parameter, index) => {
				const parameterDeclaration =
					parameter.valueDeclaration ?? parameter.declarations?.[0] ?? declaration;
				const contextual =
					ts.isCallExpression(at) && at.arguments[index]
						? checker.getContextualType(at.arguments[index]!)
						: undefined;
				return Object.freeze({
					name: parameter.name,
					type: typeFor(contextual ?? checker.getTypeOfSymbolAtLocation(parameter, at), at),
					optional:
						Boolean(parameter.flags & ts.SymbolFlags.Optional) ||
						(ts.isParameter(parameterDeclaration) &&
							(!!parameterDeclaration.questionToken || !!parameterDeclaration.initializer)),
					rest: ts.isParameter(parameterDeclaration) && !!parameterDeclaration.dotDotDotToken,
					directives: directivesFor(parameterDeclaration)
				});
			})
		),
		returnType: typeFor(checker.getReturnTypeOfSignature(signature), declaration),
		typeParameters: Object.freeze(
			(signature.typeParameters ?? []).map((parameter) => displayType(parameter, declaration))
		),
		declarationSource: displayFile(declaration.getSourceFile().fileName),
		directives: directivesFor(declaration),
		returnDirectives: directivesFor(signature.getDeclaration()?.type)
	});
}

export function isReadonlyArrayType(checker: ts.TypeChecker, type: ts.Type): boolean {
	const symbol = type.aliasSymbol ?? type.getSymbol();
	if (symbol?.name === 'ReadonlyArray') return true;
	return (
		checker.typeToString(type).startsWith('readonly ') && Boolean(type.flags & ts.TypeFlags.Object)
	);
}
