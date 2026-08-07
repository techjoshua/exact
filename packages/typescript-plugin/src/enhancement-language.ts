import type * as tsModule from 'typescript/lib/tsserverlibrary';
import { valueCallbackCompletionEntries } from './component-binding-language.js';
import {
	deepestNodeAtPosition,
	enclosingComponentReceiver,
	isExactEnhancementImport
} from './component-language-context.js';

type TypeScript = typeof tsModule;

/** Describes activator selection and all recipients of a namespaced enhancement prop. */
export function enhancementQuickInfo(
	typescript: TypeScript,
	checker: tsModule.TypeChecker,
	sourceFile: tsModule.SourceFile,
	position: number
): tsModule.QuickInfo | undefined {
	let node = deepestNodeAtPosition(sourceFile, position);
	while (node && !typescript.isJsxNamespacedName(node)) node = node.parent;
	if (!node || !typescript.isJsxNamespacedName(node)) return undefined;
	const prefix = node.namespace.text;
	const member = node.name.text;
	const binding = enhancementImportBinding(typescript, sourceFile, prefix);
	if (!binding) return undefined;
	const descriptions: string[] = [];
	if (typescript.isNamespaceImport(binding.parent)) {
		const namespaceType = checker.getTypeAtLocation(binding);
		const exports = checker.getPropertiesOfType(namespaceType);
		const activator = exports.find(
			(exported) => exported.getName() !== 'default' && camelToKebab(exported.getName()) === member
		);
		if (activator) {
			const componentName = enhancementComponentDisplayName(typescript, checker, activator);
			const props = componentProps(typescript, checker, activator, binding);
			const payload = props
				? enhancementProperty(checker, props, activator.getName(), binding)
				: undefined;
			descriptions.push(
				payload
					? `enhancement activator ${componentName}: ${checker.typeToString(payload)}`
					: `selector-only enhancement activator ${componentName}`
			);
		} else {
			const opening = jsxOpeningAtPosition(typescript, sourceFile, node.getStart(sourceFile));
			const selected = new Set<string>();
			if (opening) {
				for (const property of opening.attributes.properties)
					if (
						typescript.isJsxAttribute(property) &&
						typescript.isJsxNamespacedName(property.name) &&
						property.name.namespace.text === prefix
					)
						selected.add(property.name.name.text);
			}
			for (const exported of exports) {
				if (exported.getName() === 'default' && selected.size) continue;
				if (exported.getName() !== 'default' && !selected.has(camelToKebab(exported.getName())))
					continue;
				const props = componentProps(typescript, checker, exported, binding);
				const property = props
					? distributedTypes(typescript, props)
							.map((variant) => checker.getPropertyOfType(variant, kebabToCamel(member)))
							.find((candidate) => !!candidate)
					: undefined;
				if (property)
					descriptions.push(
						`${enhancementComponentDisplayName(typescript, checker, exported)}: ${checker.typeToString(checker.getTypeOfSymbolAtLocation(property, binding))}`
					);
			}
		}
	} else {
		const symbol = checker.getSymbolAtLocation(binding);
		const props = symbol ? componentProps(typescript, checker, symbol, binding) : undefined;
		const property = props
			? distributedTypes(typescript, props)
					.map((variant) => checker.getPropertyOfType(variant, kebabToCamel(member)))
					.find((candidate) => !!candidate)
			: undefined;
		if (property)
			descriptions.push(
				`enhancement prop: ${checker.typeToString(checker.getTypeOfSymbolAtLocation(property, binding))}`
			);
	}
	if (!descriptions.length) return undefined;
	return {
		kind: typescript.ScriptElementKind.memberVariableElement,
		kindModifiers: '',
		textSpan: { start: node.getStart(sourceFile), length: node.getWidth(sourceFile) },
		displayParts: [{ text: descriptions.join(' · '), kind: 'text' }]
	};
}

function enhancementComponentDisplayName(
	typescript: TypeScript,
	checker: tsModule.TypeChecker,
	symbol: tsModule.Symbol
): string {
	return symbol.flags & typescript.SymbolFlags.Alias
		? checker.getAliasedSymbol(symbol).getName()
		: symbol.getName();
}

function componentProps(
	typescript: TypeScript,
	checker: tsModule.TypeChecker,
	symbol: tsModule.Symbol,
	location: tsModule.Node
): tsModule.Type | undefined {
	const componentType = checker.getTypeOfSymbolAtLocation(symbol, location);
	const props = checker.getSignaturesOfType(componentType, typescript.SignatureKind.Call)[0]
		?.parameters[0];
	return props ? checker.getTypeOfSymbolAtLocation(props, location) : undefined;
}

/** Creates type-derived completions for eXact receiver, binding, and enhancement syntax. */
export function exactCompletionEntries(
	typescript: TypeScript,
	program: tsModule.Program,
	sourceFile: tsModule.SourceFile,
	position: number
): tsModule.CompletionEntry[] {
	const checker = program.getTypeChecker();
	const receiver = componentReceiverAtCompletion(typescript, sourceFile, position);
	if (receiver?.type)
		return propertyCompletionEntries(
			typescript,
			checker,
			checker.getTypeFromTypeNode(receiver.type),
			receiver,
			false
		);
	const prefix = enhancementPrefixAtCompletion(typescript, sourceFile, position);
	if (!prefix) return [];
	const entries = new Map<string, tsModule.CompletionEntry>();
	for (const entry of valueCallbackCompletionEntries(
		typescript,
		checker,
		sourceFile,
		position,
		prefix
	))
		entries.set(entry.name, entry);
	const binding = enhancementImportBinding(typescript, sourceFile, prefix);
	if (!binding) return [...entries.values()];
	if (typescript.isNamespaceImport(binding.parent))
		for (const entry of enhancementNamespaceCompletionEntries(
			typescript,
			checker,
			sourceFile,
			position,
			prefix,
			binding
		))
			if (!entries.has(entry.name)) entries.set(entry.name, entry);
			else entries.set(entry.name, ambiguousCompletionEntry(entries.get(entry.name)!, entry));
	if (typescript.isNamespaceImport(binding.parent)) return [...entries.values()];
	const componentType = checker.getTypeAtLocation(binding);
	const props = checker.getSignaturesOfType(componentType, typescript.SignatureKind.Call)[0]
		?.parameters[0];
	if (!props) return [...entries.values()];
	const propsType = checker.getTypeOfSymbolAtLocation(props, binding);
	for (const entry of [
		...propertyCompletionEntries(typescript, checker, propsType, binding, true),
		{
			name: 'root',
			kind: typescript.ScriptElementKind.memberVariableElement,
			sortText: '12',
			labelDetails: { detail: ' · enhancement target selector' }
		}
	])
		if (!entries.has(entry.name)) entries.set(entry.name, entry);
		else entries.set(entry.name, ambiguousCompletionEntry(entries.get(entry.name)!, entry));
	return [...entries.values()];
}

function ambiguousCompletionEntry(
	left: tsModule.CompletionEntry,
	right: tsModule.CompletionEntry
): tsModule.CompletionEntry {
	return {
		...left,
		labelDetails: {
			...left.labelDetails,
			detail: `${left.labelDetails?.detail ?? ''} · also ${right.labelDetails?.detail?.replace(/^\s*·\s*/, '') ?? 'enhancement candidate'}`
		}
	};
}

function enhancementNamespaceCompletionEntries(
	typescript: TypeScript,
	checker: tsModule.TypeChecker,
	sourceFile: tsModule.SourceFile,
	position: number,
	prefix: string,
	binding: tsModule.Identifier
): tsModule.CompletionEntry[] {
	const namespaceType = checker.getTypeAtLocation(binding);
	const activators = new Map<
		string,
		{ symbol: tsModule.Symbol; props: tsModule.Type; payload?: tsModule.Type }
	>();
	let defaultProps: tsModule.Type | undefined;
	for (const exported of checker.getPropertiesOfType(namespaceType)) {
		const componentType = checker.getTypeOfSymbolAtLocation(exported, binding);
		const props = checker.getSignaturesOfType(componentType, typescript.SignatureKind.Call)[0]
			?.parameters[0];
		if (!props) continue;
		const propsType = checker.getTypeOfSymbolAtLocation(props, binding);
		if (exported.getName() === 'default') {
			defaultProps = propsType;
			continue;
		}
		const name = camelToKebab(exported.getName());
		if (name === 'children' || name === 'key' || name === 'ref' || name === 'root') continue;
		const payload = enhancementProperty(checker, propsType, exported.getName(), binding);
		activators.set(name, { symbol: exported, props: propsType, payload });
	}
	const selected = new Set<string>();
	const opening = jsxOpeningAtPosition(typescript, sourceFile, position);
	for (const property of opening?.attributes.properties ?? []) {
		if (
			typescript.isJsxAttribute(property) &&
			typescript.isJsxNamespacedName(property.name) &&
			property.name.namespace.text === prefix &&
			activators.has(property.name.name.text)
		)
			selected.add(property.name.name.text);
	}
	const entries = new Map<string, tsModule.CompletionEntry>();
	for (const [name, activator] of activators) {
		entries.set(name, {
			name,
			kind: activator.payload
				? typescript.ScriptElementKind.memberVariableElement
				: typescript.ScriptElementKind.memberFunctionElement,
			sortText: '10',
			labelDetails: {
				detail: activator.payload
					? ` · enhancement activator · ${checker.typeToString(activator.payload)}`
					: ' · selector-only enhancement activator'
			}
		});
	}
	const selectedProps = selected.size
		? [...selected].map((name) => activators.get(name)!.props)
		: defaultProps
			? [defaultProps]
			: [];
	for (const props of selectedProps) {
		for (const entry of propertyCompletionEntries(typescript, checker, props, binding, true))
			if (!entries.has(entry.name)) entries.set(entry.name, entry);
	}
	entries.set('root', {
		name: 'root',
		kind: typescript.ScriptElementKind.memberVariableElement,
		sortText: '12',
		labelDetails: { detail: ' · enhancement target selector' }
	});
	return [...entries.values()];
}

function enhancementProperty(
	checker: tsModule.TypeChecker,
	type: tsModule.Type,
	name: string,
	location: tsModule.Node
): tsModule.Type | undefined {
	for (const memberType of type.isUnion() ? type.types : [type]) {
		const property = checker.getPropertyOfType(memberType, name);
		if (property) return checker.getTypeOfSymbolAtLocation(property, location);
	}
	return undefined;
}

function propertyCompletionEntries(
	typescript: TypeScript,
	checker: tsModule.TypeChecker,
	type: tsModule.Type,
	location: tsModule.Node,
	namespaced: boolean
): tsModule.CompletionEntry[] {
	const entries = new Map<string, tsModule.CompletionEntry>();
	for (const memberType of distributedTypes(typescript, type)) {
		for (const property of checker.getPropertiesOfType(memberType)) {
			const authoredName = property.getName();
			if (
				namespaced &&
				(authoredName === 'children' || authoredName === 'key' || authoredName === 'ref')
			)
				continue;
			const name = namespaced ? camelToKebab(authoredName) : authoredName;
			if (entries.has(name)) continue;
			const propertyType = checker.getTypeOfSymbolAtLocation(property, location);
			entries.set(name, {
				name,
				kind: checker.getSignaturesOfType(propertyType, typescript.SignatureKind.Call).length
					? typescript.ScriptElementKind.memberFunctionElement
					: typescript.ScriptElementKind.memberVariableElement,
				sortText: '11',
				labelDetails: { detail: ` · ${checker.typeToString(propertyType)}` }
			});
		}
	}
	return [...entries.values()];
}

function distributedTypes(typescript: TypeScript, type: tsModule.Type): readonly tsModule.Type[] {
	return type.flags & typescript.TypeFlags.Union ? (type as tsModule.UnionType).types : [type];
}

function camelToKebab(name: string): string {
	return name.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
}

function kebabToCamel(name: string): string {
	return name.replace(/-([a-z])/g, (_match, character: string) => character.toUpperCase());
}

function componentReceiverAtCompletion(
	typescript: TypeScript,
	sourceFile: tsModule.SourceFile,
	position: number
): tsModule.ParameterDeclaration | undefined {
	const match = /\bthis\.[A-Za-z_$\d]*$/.exec(sourceFile.text.slice(0, position));
	if (!match) return undefined;
	const receiver = deepestNodeAtPosition(sourceFile, match.index + match[0].indexOf('this'));
	if (!receiver || receiver.kind !== typescript.SyntaxKind.ThisKeyword) return undefined;
	return enclosingComponentReceiver(typescript, sourceFile, receiver);
}

function enhancementPrefixAtCompletion(
	typescript: TypeScript,
	sourceFile: tsModule.SourceFile,
	position: number
): string | undefined {
	const match = /(?:^|\s)([A-Za-z_$][\w$]*):[\w-]*$/.exec(sourceFile.text.slice(0, position));
	if (!match || !insideJsxOpening(typescript, sourceFile, position)) return undefined;
	return match[1];
}

function insideJsxOpening(
	typescript: TypeScript,
	sourceFile: tsModule.SourceFile,
	position: number
): boolean {
	let found = false;
	visit(sourceFile);
	return found;
	function visit(node: tsModule.Node): void {
		if (found || position < node.getFullStart() || position > node.getEnd()) return;
		if (typescript.isJsxOpeningLikeElement(node)) found = true;
		typescript.forEachChild(node, visit);
	}
}

function jsxOpeningAtPosition(
	typescript: TypeScript,
	sourceFile: tsModule.SourceFile,
	position: number
): tsModule.JsxOpeningLikeElement | undefined {
	let found: tsModule.JsxOpeningLikeElement | undefined;
	visit(sourceFile);
	return found;
	function visit(node: tsModule.Node): void {
		if (position < node.getFullStart() || position > node.getEnd()) return;
		if (typescript.isJsxOpeningLikeElement(node)) found = node;
		typescript.forEachChild(node, visit);
	}
}

function enhancementImportBinding(
	typescript: TypeScript,
	sourceFile: tsModule.SourceFile,
	prefix: string
): tsModule.Identifier | undefined {
	for (const statement of sourceFile.statements) {
		if (
			!typescript.isImportDeclaration(statement) ||
			!isExactEnhancementImport(typescript, statement)
		)
			continue;
		const clause = statement.importClause;
		if (!clause || clause.isTypeOnly) continue;
		if (clause.name?.text === prefix) return clause.name;
		if (
			clause.namedBindings &&
			typescript.isNamespaceImport(clause.namedBindings) &&
			clause.namedBindings.name.text === prefix
		)
			return clause.namedBindings.name;
		if (clause.namedBindings && typescript.isNamedImports(clause.namedBindings)) {
			const binding = clause.namedBindings.elements.find(
				(element) => !element.isTypeOnly && element.name.text === prefix
			);
			if (binding) return binding.name;
		}
	}
	return undefined;
}
