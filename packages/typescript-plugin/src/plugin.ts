import type * as tsModule from 'typescript/lib/tsserverlibrary';

type TypeScript = typeof tsModule;

const implicitThisDiagnostic = 2683;
const unusedDeclarationDiagnostic = 6133;
const allImportsUnusedDiagnostic = 6192;

/** Initializes the eXact compatibility plugin with the TypeScript instance owned by tsserver. */
function initialize({ typescript }: { typescript: TypeScript }): tsModule.server.PluginModule {
	return {
		create(info) {
			return createLanguageServiceProxy(typescript, info);
		}
	};
}

/** Preserves the host language service while narrowing diagnostics contradicted by eXact syntax. */
function createLanguageServiceProxy(
	typescript: TypeScript,
	info: tsModule.server.PluginCreateInfo
): tsModule.LanguageService {
	const service = info.languageService;
	const proxy = Object.create(null) as tsModule.LanguageService;
	for (const key of Object.keys(service) as (keyof tsModule.LanguageService)[]) {
		const member = service[key];
		if (typeof member === 'function') {
			(proxy as unknown as Record<string, (...args: never[]) => unknown>)[key] = (...args) =>
				(member as (...parameters: never[]) => unknown).apply(service, args);
		}
	}
	proxy.getSemanticDiagnostics = (filename) => {
		const diagnostics = service.getSemanticDiagnostics(filename);
		const sourceFile = service.getProgram()?.getSourceFile(filename);
		if (!sourceFile) return diagnostics;
		return diagnostics.filter(
			(diagnostic) => !diagnosticContradictsExactSyntax(typescript, sourceFile, diagnostic)
		);
	};
	proxy.getCompletionsAtPosition = (filename, position, options, formattingSettings) => {
		const ordinary = service.getCompletionsAtPosition(
			filename,
			position,
			options,
			formattingSettings
		);
		const program = service.getProgram();
		const sourceFile = program?.getSourceFile(filename);
		if (!program || !sourceFile) return ordinary;
		const exactEntries = exactCompletionEntries(typescript, program, sourceFile, position);
		if (!exactEntries.length) return ordinary;
		const ordinaryNames = new Set(ordinary?.entries.map((entry) => entry.name) ?? []);
		const entries = exactEntries.filter((entry) => !ordinaryNames.has(entry.name));
		if (!entries.length) return ordinary;
		return ordinary
			? { ...ordinary, entries: [...ordinary.entries, ...entries] }
			: {
					isGlobalCompletion: false,
					isMemberCompletion: true,
					isNewIdentifierLocation: false,
					entries
				};
	};
	return proxy;
}

/** Creates type-derived completions for eXact receiver and JSX enhancement syntax. */
function exactCompletionEntries(
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
	const binding = enhancementImportBinding(typescript, sourceFile, prefix);
	if (!binding) return [];
	const componentType = checker.getTypeAtLocation(binding);
	const props = checker.getSignaturesOfType(componentType, typescript.SignatureKind.Call)[0]
		?.parameters[0];
	if (!props) return [];
	const propsType = checker.getTypeOfSymbolAtLocation(props, binding);
	return [
		...propertyCompletionEntries(typescript, checker, propsType, binding, true),
		{
			name: 'root',
			kind: typescript.ScriptElementKind.memberVariableElement,
			sortText: '12',
			labelDetails: { detail: ' · enhancement target selector' }
		}
	];
}

/** Projects finite public properties into language-service completion entries. */
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

/** Expands union props because each finite variant contributes valid enhancement members. */
function distributedTypes(typescript: TypeScript, type: tsModule.Type): readonly tsModule.Type[] {
	return type.flags & typescript.TypeFlags.Union ? (type as tsModule.UnionType).types : [type];
}

/** Converts the canonical TypeScript prop spelling to the JSX namespace spelling. */
function camelToKebab(name: string): string {
	return name.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
}

/** Resolves the outer component receiver for a completion immediately following local `this.`. */
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

/** Resolves the exact-enhancement prefix at an incomplete namespaced JSX attribute. */
function enhancementPrefixAtCompletion(
	typescript: TypeScript,
	sourceFile: tsModule.SourceFile,
	position: number
): string | undefined {
	const match = /(?:^|\s)([A-Za-z_$][\w$]*):[\w-]*$/.exec(sourceFile.text.slice(0, position));
	if (!match || !insideJsxOpening(typescript, sourceFile, position)) return undefined;
	return match[1];
}

/** Confirms that a completion offset belongs to JSX attributes, including incomplete syntax. */
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

/** Finds the attributed import binding which owns one enhancement namespace. */
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
		if (clause.namedBindings && typescript.isNamedImports(clause.namedBindings)) {
			const binding = clause.namedBindings.elements.find(
				(element) => !element.isTypeOnly && element.name.text === prefix
			);
			if (binding) return binding.name;
		}
	}
	return undefined;
}

/** Reports whether one TypeScript diagnostic describes syntax with different eXact semantics. */
function diagnosticContradictsExactSyntax(
	typescript: TypeScript,
	sourceFile: tsModule.SourceFile,
	diagnostic: tsModule.Diagnostic
): boolean {
	if (diagnostic.start === undefined) return false;
	if (diagnostic.code === implicitThisDiagnostic)
		return isComponentOwnedThis(typescript, sourceFile, diagnostic.start);
	if (
		diagnostic.code === unusedDeclarationDiagnostic ||
		diagnostic.code === allImportsUnusedDiagnostic
	)
		return isUsedEnhancementImport(typescript, sourceFile, diagnostic.start, diagnostic.code);
	return false;
}

/** Recognizes a local function receiver inherited from an authored component receiver. */
function isComponentOwnedThis(
	typescript: TypeScript,
	sourceFile: tsModule.SourceFile,
	position: number
): boolean {
	const receiver = deepestNodeAtPosition(sourceFile, position);
	if (!receiver || receiver.kind !== typescript.SyntaxKind.ThisKeyword) return false;
	return !!enclosingComponentReceiver(typescript, sourceFile, receiver);
}

/** Finds the authored component receiver outside at least one local function boundary. */
function enclosingComponentReceiver(
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

/** Tests the same explicit receiver signal that gives an eXact component its durable instance. */
function authoredComponentReceiver(
	typescript: TypeScript,
	sourceFile: tsModule.SourceFile,
	functionLike: tsModule.SignatureDeclaration
): tsModule.ParameterDeclaration | undefined {
	return functionLike.parameters.find(
		(parameter) =>
			typescript.isIdentifier(parameter.name) &&
			parameter.name.text === 'this' &&
			!!parameter.type &&
			/\bComponent\s*</.test(parameter.type.getText(sourceFile))
	);
}

/** Recognizes an exact-enhancement binding consumed as a JSX attribute namespace. */
function isUsedEnhancementImport(
	typescript: TypeScript,
	sourceFile: tsModule.SourceFile,
	position: number,
	diagnosticCode: number
): boolean {
	const diagnosticNode = deepestNodeAtPosition(sourceFile, position);
	const declaration = enclosingImportDeclaration(typescript, diagnosticNode);
	if (!declaration || !isExactEnhancementImport(typescript, declaration)) return false;
	const bindings = importBindingNames(typescript, declaration);
	if (!bindings.size) return false;
	const used = new Set<string>();
	visit(sourceFile);
	if (diagnosticCode === allImportsUnusedDiagnostic) return used.size > 0;
	const declaredBindings = importBindingIdentifiers(typescript, declaration);
	const diagnosedBinding =
		declaredBindings.find(
			(binding) => position >= binding.getStart(sourceFile) && position < binding.getEnd()
		) ?? (declaredBindings.length === 1 ? declaredBindings[0] : undefined);
	return !!diagnosedBinding && used.has(diagnosedBinding.text);

	function visit(node: tsModule.Node): void {
		if (typescript.isJsxNamespacedName(node) && bindings.has(node.namespace.text)) {
			used.add(node.namespace.text);
		}
		typescript.forEachChild(node, visit);
	}
}

/** Returns the value identifiers declared by one attributed import. */
function importBindingIdentifiers(
	typescript: TypeScript,
	declaration: tsModule.ImportDeclaration
): readonly tsModule.Identifier[] {
	const result: tsModule.Identifier[] = [];
	const clause = declaration.importClause;
	if (!clause || clause.isTypeOnly) return result;
	if (clause.name) result.push(clause.name);
	if (clause.namedBindings && typescript.isNamedImports(clause.namedBindings)) {
		for (const element of clause.namedBindings.elements)
			if (!element.isTypeOnly) result.push(element.name);
	}
	return result;
}

/** Finds the import declaration owning an unused-binding diagnostic. */
function enclosingImportDeclaration(
	typescript: TypeScript,
	node: tsModule.Node | undefined
): tsModule.ImportDeclaration | undefined {
	for (let current = node; current; current = current.parent)
		if (typescript.isImportDeclaration(current)) return current;
	return undefined;
}

/** Tests the compiler-reserved import attribute without depending on module naming conventions. */
function isExactEnhancementImport(
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

/** Collects value bindings which can name an eXact JSX enhancement namespace. */
function importBindingNames(
	typescript: TypeScript,
	declaration: tsModule.ImportDeclaration
): ReadonlySet<string> {
	const result = new Set<string>();
	const clause = declaration.importClause;
	if (!clause || clause.isTypeOnly) return result;
	if (clause.name) result.add(clause.name.text);
	if (clause.namedBindings && typescript.isNamedImports(clause.namedBindings)) {
		for (const element of clause.namedBindings.elements)
			if (!element.isTypeOnly) result.add(element.name.text);
	}
	return result;
}

/** Returns the narrowest AST node containing a diagnostic start offset. */
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

export = initialize;
