import type * as tsModule from 'typescript/lib/tsserverlibrary';
import {
	componentBindingRenameTarget,
	declarationNameNode,
	forEachNamespacedJsx,
	valueCallbackQuickInfo
} from './component-binding-language.js';
import {
	deepestNodeAtPosition,
	enclosingComponentReceiver,
	isExactEnhancementImport
} from './component-language-context.js';
import { enhancementQuickInfo, exactCompletionEntries } from './enhancement-language.js';

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
		const program = service.getProgram();
		const sourceFile = program?.getSourceFile(filename);
		if (!program || !sourceFile) return diagnostics;
		const checker = program.getTypeChecker();
		return diagnostics.filter(
			(diagnostic) => !diagnosticContradictsExactSyntax(typescript, checker, sourceFile, diagnostic)
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
	proxy.getQuickInfoAtPosition = (filename, position) => {
		const ordinary = service.getQuickInfoAtPosition(filename, position);
		const program = service.getProgram();
		const sourceFile = program?.getSourceFile(filename);
		if (!program || !sourceFile) return ordinary;
		const checker = program.getTypeChecker();
		const binding = valueCallbackQuickInfo(typescript, checker, sourceFile, position);
		const enhancement = enhancementQuickInfo(typescript, checker, sourceFile, position);
		if (!binding) return enhancement ?? ordinary;
		if (!enhancement) return binding;
		return {
			...binding,
			displayParts: [
				...(binding.displayParts ?? []),
				{ text: ' · ', kind: 'text' },
				...(enhancement.displayParts ?? [])
			]
		};
	};
	proxy.getRenameInfo = (filename, position, options) => {
		const program = service.getProgram();
		const sourceFile = program?.getSourceFile(filename);
		const target =
			program && sourceFile
				? componentBindingRenameTarget(typescript, program.getTypeChecker(), sourceFile, position)
				: undefined;
		if (!target) return service.getRenameInfo(filename, position, options);
		const declaration = target.symbol.valueDeclaration ?? target.symbol.declarations?.[0];
		if (!declaration) return service.getRenameInfo(filename, position, options);
		const declarationName = declarationNameNode(typescript, declaration);
		if (!declarationName) return service.getRenameInfo(filename, position, options);
		const ordinary = service.getRenameInfo(
			declaration.getSourceFile().fileName,
			declarationName.getStart(),
			options
		);
		return ordinary.canRename
			? {
					...ordinary,
					triggerSpan: {
						start: target.node.getStart(sourceFile),
						length: target.node.getWidth(sourceFile)
					}
				}
			: ordinary;
	};
	proxy.findRenameLocations = (filename, position, findInStrings, findInComments, preferences) => {
		const findOrdinaryRenameLocations = service.findRenameLocations as (
			fileName: string,
			position: number,
			findInStrings: boolean,
			findInComments: boolean,
			preferences?: boolean | tsModule.UserPreferences
		) => readonly tsModule.RenameLocation[] | undefined;
		const program = service.getProgram();
		const sourceFile = program?.getSourceFile(filename);
		const checker = program?.getTypeChecker();
		const target =
			program && sourceFile && checker
				? componentBindingRenameTarget(typescript, checker, sourceFile, position)
				: undefined;
		if (!target || !program || !checker)
			return findOrdinaryRenameLocations(
				filename,
				position,
				findInStrings,
				findInComments,
				preferences
			);
		const declaration = target.symbol.valueDeclaration ?? target.symbol.declarations?.[0];
		const declarationName = declaration && declarationNameNode(typescript, declaration);
		if (!declaration || !declarationName) return undefined;
		const locations = [
			...(findOrdinaryRenameLocations(
				declaration.getSourceFile().fileName,
				declarationName.getStart(),
				findInStrings,
				findInComments,
				preferences
			) ?? [])
		];
		for (const candidateFile of program.getSourceFiles()) {
			if (candidateFile.isDeclarationFile) continue;
			forEachNamespacedJsx(typescript, candidateFile, (name) => {
				const candidate = componentBindingRenameTarget(
					typescript,
					checker,
					candidateFile,
					name.getStart(candidateFile) +
						(target.side === 'value' ? 0 : name.namespace.getWidth(candidateFile) + 1)
				);
				if (!candidate || candidate.side !== target.side || candidate.symbol !== target.symbol)
					return;
				locations.push({
					fileName: candidateFile.fileName,
					textSpan: {
						start: candidate.node.getStart(candidateFile),
						length: candidate.node.getWidth(candidateFile)
					}
				});
			});
		}
		const unique = new Map(
			locations.map((location) => [
				`${location.fileName}:${location.textSpan.start}:${location.textSpan.length}`,
				location
			])
		);
		return [...unique.values()];
	};
	return proxy;
}

/** Reports whether one TypeScript diagnostic describes syntax with different eXact semantics. */
function diagnosticContradictsExactSyntax(
	typescript: TypeScript,
	checker: tsModule.TypeChecker,
	sourceFile: tsModule.SourceFile,
	diagnostic: tsModule.Diagnostic
): boolean {
	if (diagnostic.start === undefined) return false;
	if (diagnostic.code === implicitThisDiagnostic)
		return isComponentOwnedThis(typescript, sourceFile, diagnostic.start);
	if (
		diagnostic.code === 2322 &&
		componentBindingRenameTarget(typescript, checker, sourceFile, diagnostic.start)
	)
		return true;
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
	if (clause.namedBindings && typescript.isNamespaceImport(clause.namedBindings))
		result.push(clause.namedBindings.name);
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

/** Collects value bindings which can name an eXact JSX enhancement namespace. */
function importBindingNames(
	typescript: TypeScript,
	declaration: tsModule.ImportDeclaration
): ReadonlySet<string> {
	const result = new Set<string>();
	const clause = declaration.importClause;
	if (!clause || clause.isTypeOnly) return result;
	if (clause.name) result.add(clause.name.text);
	if (clause.namedBindings && typescript.isNamespaceImport(clause.namedBindings))
		result.add(clause.namedBindings.name.text);
	if (clause.namedBindings && typescript.isNamedImports(clause.namedBindings)) {
		for (const element of clause.namedBindings.elements)
			if (!element.isTypeOnly) result.add(element.name.text);
	}
	return result;
}

export = initialize;
