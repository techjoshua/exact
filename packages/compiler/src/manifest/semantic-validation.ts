import type {
	ExactSemanticDeclarationIR,
	ExactSemanticExportIR,
	ExactSemanticGraphIR,
	ExactSemanticReferenceIR,
	ExactSemanticScopeIR
} from '../types.js';

export function isExactSemanticGraph(value: unknown): value is ExactSemanticGraphIR {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const graph = value as Partial<ExactSemanticGraphIR>;
	return (
		Array.isArray(graph.scopes) &&
		graph.scopes.every(isExactSemanticScope) &&
		Array.isArray(graph.declarations) &&
		graph.declarations.every(isExactSemanticDeclaration) &&
		Array.isArray(graph.references) &&
		graph.references.every(isExactSemanticReference) &&
		Array.isArray(graph.exports) &&
		graph.exports.every(isExactSemanticExport)
	);
}

function isExactSemanticScope(value: unknown): value is ExactSemanticScopeIR {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const scope = value as Partial<ExactSemanticScopeIR>;
	return (
		typeof scope.id === 'string' &&
		(scope.parentId === undefined || typeof scope.parentId === 'string') &&
		(scope.kind === 'module' || scope.kind === 'function' || scope.kind === 'block') &&
		typeof scope.nodeKind === 'string'
	);
}

function isExactSemanticDeclaration(value: unknown): value is ExactSemanticDeclarationIR {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const declaration = value as Partial<ExactSemanticDeclarationIR>;
	return (
		typeof declaration.id === 'string' &&
		typeof declaration.name === 'string' &&
		typeof declaration.scopeId === 'string' &&
		typeof declaration.kind === 'string' &&
		typeof declaration.nodeStart === 'number' &&
		typeof declaration.nodeEnd === 'number'
	);
}

function isExactSemanticReference(value: unknown): value is ExactSemanticReferenceIR {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const reference = value as Partial<ExactSemanticReferenceIR>;
	return (
		typeof reference.name === 'string' &&
		typeof reference.scopeId === 'string' &&
		typeof reference.source === 'string' &&
		typeof reference.nodeStart === 'number' &&
		typeof reference.nodeEnd === 'number'
	);
}

function isExactSemanticExport(value: unknown): value is ExactSemanticExportIR {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const exported = value as Partial<ExactSemanticExportIR>;
	return typeof exported.exportedName === 'string';
}
