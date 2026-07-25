import type ts from 'typescript';
import type { ExactContinuationIR } from './types.js';

/** Emits target-local continuation contracts as inert artifact metadata. */
export function continuationDescriptorExpression(
	continuations: readonly ExactContinuationIR[],
	client: boolean,
	factory: ts.NodeFactory
): ts.Expression {
	return jsonExpression(continuationDescriptorValues(continuations, client), factory);
}

/** Converts compiler continuation IR into target-local inert runtime descriptors. */
export function continuationDescriptorValues(
	continuations: readonly ExactContinuationIR[],
	client: boolean
): readonly Record<string, unknown>[] {
	return continuations.map((continuation) => ({
		id: continuation.id,
		componentId: continuation.componentId,
		readiness: continuation.readiness,
		dependencies: continuation.activation.dependencies.map(({ source }) => ({ source })),
		stateReads: continuation.activation.stateReads.map(statePathDescriptor),
		stateWrites: continuation.effects.stateWrites.map(statePathDescriptor),
		publicContexts: continuation.activation.publicContexts.map((context) => context.token),
		serverContexts: client
			? []
			: continuation.activation.serverContexts.map((context) => context.token),
		contextWrites: continuation.effects.contextWrites.map((context) => context.token),
		boundaries: continuation.effects.boundaries
	}));
}

/** Emits JSON-shaped compiler metadata as inert artifact syntax. */
export function inertMetadataExpression(value: unknown, factory: ts.NodeFactory): ts.Expression {
	return jsonExpression(value, factory);
}

/** Removes compiler-only receiver metadata from a runtime state-path contract. */
function statePathDescriptor(
	effect: ExactContinuationIR['activation']['stateReads'][number]
): Record<string, unknown> {
	return {
		path: effect.path,
		kind: effect.kind,
		confidence: effect.confidence
	};
}

/** Converts JSON-shaped compiler IR into an AST without parsing executable source text. */
function jsonExpression(value: unknown, factory: ts.NodeFactory): ts.Expression {
	if (value === null) return factory.createNull();
	if (typeof value === 'string') return factory.createStringLiteral(value);
	if (typeof value === 'number') return factory.createNumericLiteral(value);
	if (typeof value === 'boolean') return value ? factory.createTrue() : factory.createFalse();
	if (Array.isArray(value)) {
		return factory.createArrayLiteralExpression(
			value.map((item) => jsonExpression(item, factory)),
			true
		);
	}
	if (value && typeof value === 'object') {
		return factory.createObjectLiteralExpression(
			Object.entries(value as Record<string, unknown>).map(([key, item]) =>
				factory.createPropertyAssignment(key, jsonExpression(item, factory))
			),
			true
		);
	}
	throw new TypeError('Continuation descriptor contains an unsupported value');
}
