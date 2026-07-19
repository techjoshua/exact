import type { BoundModule, ExpressionDirective, NodeRef } from '@exact/expressions';

/** Defines the exact annotation key type contract. */
export type ExactAnnotationKey = 'key' | 'cleanup' | 'own' | 'track' | 'client' | 'server' | 'keep';

/** Defines the exact keep policy type contract. */
export type ExactKeepPolicy = 'server' | 'client' | 'secret';

/** Defines the exact annotation diagnostic interface contract. */
export interface ExactAnnotationDiagnostic {
	readonly message: string;
	readonly start: number;
}

/** Describes the planned exact annotation operation. */
export interface ExactAnnotationPlan {
	readonly diagnostics: readonly ExactAnnotationDiagnostic[];
	readonly trackedCallbacks: ReadonlyMap<string, readonly ExactTrackedCallback[]>;
}

/** Defines the exact tracked callback interface contract. */
export interface ExactTrackedCallback {
	readonly parameter: number;
	readonly property?: string;
}

/** Defines the exact key contract interface contract. */
export interface ExactKeyContract {
	readonly member?: string;
	readonly method: boolean;
	readonly primitive: boolean;
}

const supported = new Set<ExactAnnotationKey>([
	'key',
	'cleanup',
	'own',
	'track',
	'client',
	'server',
	'keep'
]);
const identifier = /^[A-Za-z_$][\w$]*$/;

/** Validates the closed directive language and indexes call-site callback contracts. */
export function analyzeExactAnnotations(module: BoundModule): ExactAnnotationPlan {
	const diagnostics: ExactAnnotationDiagnostic[] = [];
	const directiveSites = new Map<string, { reference: NodeRef; directive: ExpressionDirective }>();
	for (const reference of module.walk()) {
		for (const directive of reference.node.directives ?? []) {
			const identity = `${directive.span?.start ?? reference.node.span?.start ?? -1}:${directive.key}:${directive.value ?? ''}`;
			const existing = directiveSites.get(identity);
			const key = supported.has(directive.key as ExactAnnotationKey)
				? (directive.key as ExactAnnotationKey)
				: undefined;
			const candidateValid = key ? validDirectiveLocation(key, reference) : false;
			const existingValid =
				key && existing ? validDirectiveLocation(key, existing.reference) : false;
			if (
				!existing ||
				(candidateValid && !existingValid) ||
				(candidateValid === existingValid && nodeWidth(reference) < nodeWidth(existing.reference))
			) {
				directiveSites.set(identity, { reference, directive });
			}
		}
	}
	for (const { reference, directive } of directiveSites.values()) {
		const start = directive.span?.start ?? reference.node.span?.start ?? 0;
		// Namespaced directives are owned and validated by prepared compiler
		// plugins. Core keeps its own directive language closed.
		if (directive.key.includes('.')) continue;
		if (!supported.has(directive.key as ExactAnnotationKey)) {
			diagnostics.push({
				message: `error: unknown @exact directive '${directive.key}'; supported directives are key, cleanup, own, track, client, server, and keep`,
				start
			});
			continue;
		}
		if (directive.key === 'keep') {
			if (!directive.value) {
				diagnostics.push({
					message: 'error: @exact keep requires one of server, client, or secret',
					start
				});
				continue;
			}
			if (!isExactKeepPolicy(directive.value)) {
				diagnostics.push({
					message:
						directive.value === 'isomorphic'
							? 'error: @exact keep=isomorphic is not supported; safe isomorphic residency is inferred'
							: `error: unknown @exact keep policy '${directive.value}'; expected server, client, or secret`,
					start
				});
				continue;
			}
		} else if (
			(directive.key === 'own' ||
				directive.key === 'track' ||
				directive.key === 'client' ||
				directive.key === 'server') &&
			directive.value !== undefined
		) {
			diagnostics.push({
				message: `error: @exact ${directive.key} does not accept a value`,
				start
			});
		} else if (directive.value !== undefined && !identifier.test(directive.value)) {
			diagnostics.push({
				message: `error: @exact ${directive.key} value must be a member identifier, not executable source`,
				start
			});
		} else if (!validDirectiveLocation(directive.key as ExactAnnotationKey, reference)) {
			diagnostics.push({
				message: `error: @exact ${directive.key} is not valid on ${directiveLocationKind(reference)}`,
				start
			});
		} else if (
			(reference.node.kind === 'InterfaceDeclaration' ||
				reference.node.kind === 'ClassDeclaration' ||
				reference.node.kind === 'TypeAliasDeclaration') &&
			(directive.key === 'key' || directive.key === 'cleanup') &&
			!directive.value
		) {
			diagnostics.push({
				message: `error: type-level @exact ${directive.key} requires a member name`,
				start
			});
		}
		if (directive.key === 'keep' && !validDirectiveLocation(directive.key, reference)) {
			diagnostics.push({
				message: `error: @exact ${directive.key} is not valid on ${directiveLocationKind(reference)}`,
				start
			});
		}
	}

	for (const reference of module.walk()) {
		if (
			hasExactDirective(reference.node.directives, 'client') &&
			hasExactDirective(reference.node.directives, 'server')
		) {
			diagnostics.push({
				message: 'error: a declaration cannot be both @exact client and @exact server',
				start: reference.node.span?.start ?? 0
			});
		}
		const keep =
			reference.node.directives?.filter(
				(value) => value.namespace === 'exact' && value.key === 'keep'
			) ?? [];
		const policies = new Set(keep.map((value) => value.value).filter(isExactKeepPolicy));
		if (policies.size > 1)
			diagnostics.push({
				message: 'error: a declaration cannot have contradictory @exact keep policies',
				start: keep[0]?.span?.start ?? reference.node.span?.start ?? 0
			});
	}

	const trackedCallbacks = new Map<string, readonly ExactTrackedCallback[]>();
	for (const call of module.walk().calls()) {
		const signature = call.node.resolvedSignature;
		if (!signature) continue;
		const tracked = signature.parameters.flatMap((parameter, index): ExactTrackedCallback[] => [
			...(hasExactDirective(parameter.directives, 'track') ? [{ parameter: index }] : []),
			...parameter.type.propertyTypes
				.filter((property) => hasExactDirective(property.directives, 'track'))
				.map((property) => ({ parameter: index, property: property.name }))
		]);
		if (!tracked.length) continue;
		for (const contract of tracked) {
			const parameter = signature.parameters[contract.parameter]!;
			const callbackType = contract.property
				? parameter.type.propertyTypes.find((property) => property.name === contract.property)?.type
				: parameter.type;
			if (!callbackType?.callable)
				diagnostics.push({
					message: `error: @exact track may only annotate a callable parameter`,
					start: call.node.span?.start ?? 0
				});
		}
		trackedCallbacks.set(call.node.id, Object.freeze(tracked));
	}

	for (const call of module.walk().calls()) {
		const cleanupDeclared = callDeclaresCleanup(call);
		const cleanup = exactCleanupForCall(call);
		if (cleanupDeclared && !cleanup)
			diagnostics.push({
				message: 'error: @exact cleanup must identify a callable member on the owned value',
				start: call.node.span?.start ?? 0
			});
		if (
			exactOwnsReturn(call) &&
			!cleanup &&
			!call.type?.callable &&
			!isStandardDisposable(call.type)
		)
			diagnostics.push({
				message:
					'error: @exact own requires a cleanup annotation, a callable cleanup result, or a standard disposable result',
				start: call.node.span?.start ?? 0
			});
	}

	const uniqueDiagnostics = [
		...new Map(
			diagnostics.map((diagnostic) => [`${diagnostic.start}:${diagnostic.message}`, diagnostic])
		).values()
	];
	return Object.freeze({ diagnostics: Object.freeze(uniqueDiagnostics), trackedCallbacks });
}

export {
	exactCleanup,
	exactCleanupForCall,
	exactDirective,
	exactKeepPolicy,
	exactKeyContract,
	exactOwnsReturn,
	hasExactDirective,
	trackedCallbackArguments,
	trackedParameter
} from './annotations/queries.js';
import {
	callDeclaresCleanup,
	directiveLocationKind,
	exactCleanupForCall,
	exactOwnsReturn,
	hasExactDirective,
	isExactKeepPolicy,
	isStandardDisposable,
	nodeWidth,
	validDirectiveLocation
} from './annotations/queries.js';
