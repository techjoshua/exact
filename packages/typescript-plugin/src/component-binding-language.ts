import type * as tsModule from 'typescript/lib/tsserverlibrary';

type TypeScript = typeof tsModule;

/** Identifies one authored half of a component binding and its ordinary prop symbol. */
export type ComponentBindingRenameTarget = {
	symbol: tsModule.Symbol;
	node: tsModule.Identifier;
	side: 'value' | 'callback';
};

/** Resolves either authored half of a valid finite component binding to its prop symbol. */
export function componentBindingRenameTarget(
	typescript: TypeScript,
	checker: tsModule.TypeChecker,
	sourceFile: tsModule.SourceFile,
	position: number
): ComponentBindingRenameTarget | undefined {
	let cursor = deepestNodeAtPosition(sourceFile, position);
	while (cursor && !typescript.isJsxNamespacedName(cursor)) cursor = cursor.parent;
	if (!cursor || !typescript.isJsxNamespacedName(cursor)) return undefined;
	const opening = jsxOpeningAtPosition(typescript, sourceFile, cursor.getStart(sourceFile));
	if (!opening || isIntrinsicOpening(typescript, opening)) return undefined;
	const props = jsxOpeningComponentProps(typescript, checker, opening);
	if (
		!props ||
		distributedTypes(typescript, props).some((member) => checker.getIndexInfosOfType(member).length)
	)
		return undefined;
	const side = position <= cursor.namespace.getEnd() ? 'value' : 'callback';
	const node = side === 'value' ? cursor.namespace : cursor.name;
	const value = checker.getPropertyOfType(props, cursor.namespace.text);
	const callback = checker.getPropertyOfType(props, cursor.name.text);
	if (!value || !callback || !supportedCallbackType(typescript, checker, callback, opening))
		return undefined;
	const symbol = side === 'value' ? value : callback;
	return { symbol, node, side };
}

/** Finds the declaration name carrying a prop symbol. */
export function declarationNameNode(
	typescript: TypeScript,
	declaration: tsModule.Declaration
): tsModule.Node | undefined {
	const name = (declaration as tsModule.NamedDeclaration).name;
	return name &&
		(typescript.isIdentifier(name) ||
			typescript.isStringLiteral(name) ||
			typescript.isNumericLiteral(name))
		? name
		: undefined;
}

/** Visits namespaced JSX names without allocating a source-wide intermediate list. */
export function forEachNamespacedJsx(
	typescript: TypeScript,
	sourceFile: tsModule.SourceFile,
	visitName: (name: tsModule.JsxNamespacedName) => void
): void {
	const visit = (node: tsModule.Node): void => {
		if (typescript.isJsxNamespacedName(node)) visitName(node);
		typescript.forEachChild(node, visit);
	};
	visit(sourceFile);
}

/** Completes finite component callbacks and compiler-owned intrinsic endpoints after `value:`. */
export function valueCallbackCompletionEntries(
	typescript: TypeScript,
	checker: tsModule.TypeChecker,
	sourceFile: tsModule.SourceFile,
	position: number,
	valueProp: string
): tsModule.CompletionEntry[] {
	const opening = jsxOpeningAtCompletion(typescript, sourceFile, position);
	if (!opening) return [];
	if (isIntrinsicOpening(typescript, opening)) {
		const tag = (opening.tagName as tsModule.Identifier).text;
		const endpoint =
			valueProp === 'value' && (tag === 'input' || tag === 'textarea')
				? ['onInput', 'onChange']
				: valueProp === 'value' && tag === 'select'
					? ['onChange']
					: valueProp === 'checked' && tag === 'input'
						? ['onChange']
						: valueProp === 'open' && tag === 'details'
							? ['onToggle']
							: [];
		return endpoint.map((name) => ({
			name,
			kind: typescript.ScriptElementKind.memberFunctionElement,
			sortText: '09',
			labelDetails: { detail: ' · intrinsic binding endpoint' }
		}));
	}
	const props = jsxOpeningComponentProps(typescript, checker, opening);
	if (
		!props ||
		distributedTypes(typescript, props).some((member) => checker.getIndexInfosOfType(member).length)
	)
		return [];
	const value = checker.getPropertyOfType(props, valueProp);
	if (!value) return [];
	const valueType = checker.getTypeOfSymbolAtLocation(value, opening);
	const result: tsModule.CompletionEntry[] = [];
	for (const candidate of checker.getPropertiesOfType(props)) {
		const authoredCallbackType = checker.getTypeOfSymbolAtLocation(candidate, opening);
		if (
			distributedTypes(typescript, authoredCallbackType).some(
				(member) => member.flags & typescript.TypeFlags.Null
			)
		)
			continue;
		const callbackType = checker.getNonNullableType(authoredCallbackType);
		const callbacks = checker.getSignaturesOfType(callbackType, typescript.SignatureKind.Call);
		if (
			callbacks.length !== 1 ||
			!callbacks[0].parameters.length ||
			callbacks[0].parameters[0].flags & typescript.SymbolFlags.Optional
		)
			continue;
		const parameter = callbacks[0].parameters[0];
		if (!parameter) continue;
		const parameterType = checker.getTypeOfSymbolAtLocation(parameter, opening);
		if (!checker.isTypeAssignableTo(parameterType, valueType)) continue;
		const returns = checker.getReturnTypeOfSignature(callbacks[0]);
		if (
			distributedTypes(typescript, returns).some(
				(member) => !(member.flags & (typescript.TypeFlags.Void | typescript.TypeFlags.Undefined))
			)
		)
			continue;
		result.push({
			name: candidate.getName(),
			kind: typescript.ScriptElementKind.memberFunctionElement,
			sortText: '09',
			labelDetails: { detail: ` · assigns ${checker.typeToString(parameterType)} to ${valueProp}` }
		});
	}
	return result;
}

/** Explains the ordinary two-prop expansion represented by one namespaced binding. */
export function valueCallbackQuickInfo(
	typescript: TypeScript,
	checker: tsModule.TypeChecker,
	sourceFile: tsModule.SourceFile,
	position: number
): tsModule.QuickInfo | undefined {
	let node = deepestNodeAtPosition(sourceFile, position);
	while (node && !typescript.isJsxNamespacedName(node)) node = node.parent;
	if (!node || !typescript.isJsxNamespacedName(node)) return undefined;
	const opening = jsxOpeningAtPosition(typescript, sourceFile, node.getStart(sourceFile));
	if (!opening) return undefined;
	const valueProp = node.namespace.text;
	const callbackProp = node.name.text;
	let description: string | undefined;
	if (isIntrinsicOpening(typescript, opening)) {
		const supported = valueCallbackCompletionEntries(
			typescript,
			checker,
			sourceFile,
			node.getEnd(),
			valueProp
		).some((entry) => entry.name === callbackProp);
		if (supported)
			description = `intrinsic binding: ${valueProp} property, then ${callbackProp} publishes the live DOM value`;
	} else {
		const props = jsxOpeningComponentProps(typescript, checker, opening);
		const value = props && checker.getPropertyOfType(props, valueProp);
		const callback = props && checker.getPropertyOfType(props, callbackProp);
		if (value && callback)
			description = `component binding: ${valueProp}: ${checker.typeToString(checker.getTypeOfSymbolAtLocation(value, opening))}; ${callbackProp} assigns its first argument to the parent state target`;
	}
	if (!description) return undefined;
	return {
		kind: typescript.ScriptElementKind.memberVariableElement,
		kindModifiers: '',
		textSpan: { start: node.getStart(sourceFile), length: node.getWidth(sourceFile) },
		displayParts: [{ text: description, kind: 'text' }]
	};
}

/** Resolves one JSX component's finite props without relying on contextual return typing. */
function jsxOpeningComponentProps(
	typescript: TypeScript,
	checker: tsModule.TypeChecker,
	opening: tsModule.JsxOpeningLikeElement
): tsModule.Type | undefined {
	const symbol = checker.getSymbolAtLocation(opening.tagName);
	const componentType = symbol
		? checker.getTypeOfSymbolAtLocation(symbol, opening.tagName)
		: checker.getTypeAtLocation(opening.tagName);
	const signatures = checker.getSignaturesOfType(componentType, typescript.SignatureKind.Call);
	if (signatures.length !== 1 || !signatures[0].parameters[0]) return undefined;
	return checker.getTypeOfSymbolAtLocation(signatures[0].parameters[0], opening.tagName);
}

function isIntrinsicOpening(
	typescript: TypeScript,
	opening: tsModule.JsxOpeningLikeElement
): boolean {
	return typescript.isIdentifier(opening.tagName) && /^[a-z]/.test(opening.tagName.text);
}

function distributedTypes(typescript: TypeScript, type: tsModule.Type): readonly tsModule.Type[] {
	return type.flags & typescript.TypeFlags.Union ? (type as tsModule.UnionType).types : [type];
}

function supportedCallbackType(
	typescript: TypeScript,
	checker: tsModule.TypeChecker,
	symbol: tsModule.Symbol,
	location: tsModule.Node
): boolean {
	const authored = checker.getTypeOfSymbolAtLocation(symbol, location);
	if (
		distributedTypes(typescript, authored).some(
			(member) => member.flags & typescript.TypeFlags.Null
		)
	)
		return false;
	const signatures = checker.getSignaturesOfType(
		checker.getNonNullableType(authored),
		typescript.SignatureKind.Call
	);
	const first = signatures[0]?.parameters[0];
	const firstDeclaration = signatures[0]?.getDeclaration()?.parameters[0];
	if (
		signatures.length !== 1 ||
		!first ||
		first.flags & typescript.SymbolFlags.Optional ||
		!!firstDeclaration?.dotDotDotToken
	)
		return false;
	const returns = checker.getReturnTypeOfSignature(signatures[0]);
	return distributedTypes(typescript, returns).every(
		(member) => member.flags & (typescript.TypeFlags.Void | typescript.TypeFlags.Undefined)
	);
}

function jsxOpeningAtPosition(
	typescript: TypeScript,
	sourceFile: tsModule.SourceFile,
	position: number
): tsModule.JsxOpeningLikeElement | undefined {
	let result: tsModule.JsxOpeningLikeElement | undefined;
	const visit = (node: tsModule.Node): void => {
		if (position < node.getFullStart() || position > node.getEnd()) return;
		if (typescript.isJsxOpeningLikeElement(node)) result = node;
		typescript.forEachChild(node, visit);
	};
	visit(sourceFile);
	return result;
}

function jsxOpeningAtCompletion(
	typescript: TypeScript,
	sourceFile: tsModule.SourceFile,
	position: number
): tsModule.JsxOpeningLikeElement | undefined {
	const direct = jsxOpeningAtPosition(typescript, sourceFile, position);
	if (direct) return direct;
	const before = sourceFile.text.slice(0, position);
	const openingStart = before.lastIndexOf('<');
	if (openingStart < 0 || openingStart < before.lastIndexOf('>')) return undefined;
	let found: tsModule.JsxOpeningLikeElement | undefined;
	const visit = (node: tsModule.Node): void => {
		if (node.getFullStart() > position) return;
		if (
			typescript.isJsxOpeningLikeElement(node) &&
			node.getStart(sourceFile) >= openingStart &&
			(!found || node.getStart(sourceFile) > found.getStart(sourceFile))
		)
			found = node;
		typescript.forEachChild(node, visit);
	};
	visit(sourceFile);
	return found;
}

function deepestNodeAtPosition(
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
