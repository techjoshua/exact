import ts from 'typescript';
import type { ModuleExportReplacement } from './contracts.js';
import { isRequireCall } from './inspection.js';

export function rewriteCommonJsDestructuring(
	factory: ts.NodeFactory,
	node: ts.VariableStatement,
	replacements: ReadonlyMap<string, ReadonlyMap<string, ModuleExportReplacement>>
): ts.VariableStatement {
	const declarations: ts.VariableDeclaration[] = [];
	let changed = false;
	for (const declaration of node.declarationList.declarations) {
		if (
			!ts.isObjectBindingPattern(declaration.name) ||
			!declaration.initializer ||
			!isRequireCall(declaration.initializer)
		) {
			declarations.push(declaration);
			continue;
		}
		const request = declaration.initializer.arguments[0].text;
		const byExport = replacements.get(request);
		if (!byExport) {
			declarations.push(declaration);
			continue;
		}
		const retained: ts.BindingElement[] = [];
		const grouped = new Map<
			string,
			{ replacement: ModuleExportReplacement; elements: ts.BindingElement[] }
		>();
		for (const element of declaration.name.elements) {
			if (element.dotDotDotToken) {
				retained.push(element);
				continue;
			}
			const sourceExport =
				element.propertyName &&
				(ts.isIdentifier(element.propertyName) || ts.isStringLiteral(element.propertyName))
					? element.propertyName.text
					: ts.isIdentifier(element.name)
						? element.name.text
						: undefined;
			const replacement = sourceExport ? byExport.get(sourceExport) : undefined;
			if (!replacement) {
				retained.push(element);
				continue;
			}
			changed = true;
			let group = grouped.get(replacement.targetModule);
			if (!group) {
				group = { replacement, elements: [] };
				grouped.set(replacement.targetModule, group);
			}
			group.elements.push(
				factory.updateBindingElement(
					element,
					element.dotDotDotToken,
					factory.createIdentifier(replacement.targetExport),
					element.name,
					element.initializer
				)
			);
		}
		if (retained.length)
			declarations.push(
				factory.updateVariableDeclaration(
					declaration,
					factory.createObjectBindingPattern(retained),
					declaration.exclamationToken,
					declaration.type,
					declaration.initializer
				)
			);
		for (const group of [...grouped.values()].sort((left, right) =>
			left.replacement.targetModule.localeCompare(right.replacement.targetModule)
		)) {
			declarations.push(
				factory.createVariableDeclaration(
					factory.createObjectBindingPattern(group.elements),
					undefined,
					declaration.type,
					factory.createCallExpression(factory.createIdentifier('require'), undefined, [
						factory.createStringLiteral(group.replacement.targetModule)
					])
				)
			);
		}
	}
	return changed
		? factory.updateVariableStatement(
				node,
				node.modifiers,
				factory.updateVariableDeclarationList(node.declarationList, declarations)
			)
		: node;
}
