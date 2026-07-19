import ts from 'typescript';
import type { ExpressionSymbol, ExpressionType, Variable } from '../model.js';
import type { ProjectionCounters } from './contracts.js';
import type { ExpressionDirectiveIndex } from './directives.js';
import { declarationIdentity } from './identity.js';
import { ProjectScope, ProjectVariable } from './projection-model.js';
import {
	declarationBindingName,
	importSource,
	isMutableBinding,
	isScopeNode,
	isTypeOnlyBinding,
	normalizeFile,
	scopeKind
} from './syntax.js';

export type ExpressionBindingProjectionOptions = {
	filename: string;
	sourceFile: ts.SourceFile;
	checker: ts.TypeChecker;
	detailedProfile: boolean;
	counters: ProjectionCounters;
	directives: ExpressionDirectiveIndex;
	typeFor(type: ts.Type, at: ts.Node): ExpressionType;
	symbolIdentities: Map<string, ExpressionSymbol>;
	fileVersion(filename: string): string;
};

/** Projects canonical scopes and variables for one immutable source file. */
export function createExpressionBindingProjection(options: ExpressionBindingProjectionOptions) {
	const {
		filename,
		sourceFile,
		checker,
		detailedProfile,
		counters: projectionCounters,
		directives,
		typeFor
	} = options;
	const scopes = new Map<ts.Node, ProjectScope>();
	const symbolVariables = new Map<ts.Symbol, ProjectVariable>();
	const implicitThisVariables = new Map<ts.Node, ProjectVariable>();
	const usedIdentityKeys = new Set<string>();
	const symbolIdentity = (id: string, name: string): ExpressionSymbol => {
		usedIdentityKeys.add(id);
		const existing = options.symbolIdentities.get(id);
		if (existing) return existing;
		const identity = Object.freeze({ id, name });
		options.symbolIdentities.set(id, identity);
		return identity;
	};

	const scopeFor = (node: ts.Node): ProjectScope => {
		let owner: ts.Node | undefined = node;
		while (owner && !isScopeNode(owner)) owner = owner.parent;
		owner ??= sourceFile;
		const existing = scopes.get(owner);
		if (existing) return existing;
		const parent = owner.parent ? scopeFor(owner.parent) : undefined;
		const scope = new ProjectScope(
			`${filename}:scope:${owner.pos}:${owner.end}:${ts.SyntaxKind[owner.kind]}`,
			scopeKind(owner),
			parent === undefined || parent === existing ? undefined : parent
		);
		scopes.set(owner, scope);
		return scope;
	};

	const variableFor = (identifier: ts.Identifier): Variable | undefined => {
		if (identifier.text === 'this' && ts.isParameter(identifier.parent))
			return variableForThis(identifier);
		if (detailedProfile) projectionCounters.checkerSymbolQueries++;
		const locatedSymbol =
			ts.isShorthandPropertyAssignment(identifier.parent) && identifier.parent.name === identifier
				? (checker.getShorthandAssignmentValueSymbol(identifier.parent) ??
					checker.getSymbolAtLocation(identifier))
				: checker.getSymbolAtLocation(identifier);
		const symbol =
			ts.isExportSpecifier(identifier.parent) && !identifier.parent.parent.parent.moduleSpecifier
				? (checker.getExportSpecifierLocalTargetSymbol(identifier.parent) ?? locatedSymbol)
				: locatedSymbol;
		if (!symbol) return undefined;
		const cached = symbolVariables.get(symbol);
		if (cached) return cached;
		const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0] ?? identifier;
		const declarationFile = normalizeFile(declaration.getSourceFile().fileName);
		const localName = declarationBindingName(declaration) ?? symbol.name;
		const key = declarationIdentity(
			declarationFile,
			declaration,
			localName,
			options.fileVersion(declarationFile)
		);
		usedIdentityKeys.add(key);
		const scope = scopeFor(declaration);
		let variableType: ExpressionType | undefined;
		try {
			if (detailedProfile) projectionCounters.checkerTypeQueries++;
			variableType = typeFor(checker.getTypeOfSymbolAtLocation(symbol, identifier), identifier);
		} catch {
			/* TypeScript can reject incomplete error symbols. */
		}
		const variable = new ProjectVariable(
			symbolIdentity(key, localName),
			localName,
			ts.SyntaxKind[declaration.kind],
			scope,
			isMutableBinding(declaration)
		);
		symbolVariables.set(symbol, variable);
		variable.type = variableType;
		variable.exported = Boolean(symbol.flags & ts.SymbolFlags.ExportValue);
		variable.importedFrom = importSource(declaration);
		variable.typeOnly = isTypeOnlyBinding(declaration);
		variable.directives = directives.forBinding(declaration);
		scope.add(variable);
		Object.freeze(variable);
		return variable;
	};

	const variableForThis = (node: ts.Node): Variable => {
		let owner: ts.Node = sourceFile;
		let declaration: ts.Node | undefined;
		for (let current = node.parent; current; current = current.parent) {
			if (ts.isArrowFunction(current)) continue;
			if (ts.isFunctionLike(current) || ts.isClassLike(current) || ts.isSourceFile(current)) {
				owner = current;
				if (ts.isFunctionLike(current)) {
					declaration = current.parameters.find(
						(candidate) => candidate.name.getText(sourceFile) === 'this'
					);
				}
				break;
			}
		}
		const existing = implicitThisVariables.get(owner);
		if (existing) return existing;
		const scope = scopeFor(declaration ?? owner);
		const key = declarationIdentity(
			filename,
			declaration ?? owner,
			'this',
			options.fileVersion(filename)
		);
		const variable = new ProjectVariable(
			symbolIdentity(key, 'this'),
			'this',
			declaration ? 'Parameter' : 'ThisKeyword',
			scope,
			!!declaration,
			!declaration
		);
		try {
			if (detailedProfile) projectionCounters.checkerTypeQueries++;
			variable.type = typeFor(checker.getTypeAtLocation(node), node);
		} catch {
			/* Invalid implicit this types remain unresolved. */
		}
		variable.typeOnly = false;
		scope.add(variable);
		Object.freeze(variable);
		implicitThisVariables.set(owner, variable);
		return variable;
	};

	return {
		scopeFor,
		variableFor,
		variableForThis,
		usedIdentityKeys,
		scopes,
		symbolVariables
	};
}
