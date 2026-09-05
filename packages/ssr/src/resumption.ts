import {
	componentContinuationContextValues,
	settledComponentContinuationIds,
	type AnyComponentInstance,
	type ComponentResumptionActivation
} from '@exactjs/core';
import {
	exactComponentIdentity,
	readPreparedExactServerExecutableComponentContract,
	type ExactServerExecutableComponentContract
} from '@exactjs/core/framework/component-contracts';
import {
	serverComponentContinuationContextValuesForHost,
	settledServerComponentContinuationIdsForHost
} from '@exactjs/core/framework/server-component-execution';
import { type ReactiveOwnPropertyReadCell } from '@exactjs/reactive/framework/indexed-objects';
import type { RenderToStringOptions } from './types.js';
import {
	captureContextEntries,
	captureDirectStateEntries,
	captureStateEntries,
	emptyContextValues,
	emptyContinuationIds,
	emptyIndexedEntries,
	projectActivation,
	publishTuple,
	resumptionSchema,
	type MutableSerializedResumption,
	type SsrResumptionSchema,
	type SsrSerializedResumption
} from './resumption-serialization.js';
export type { SsrResumptionLayout, SsrSerializedResumption } from './resumption-serialization.js';

/** Request-local capture consumed directly by synchronous component execution. */
export type SsrResumptionCapture = Readonly<{
	checkpoint(): number;
	rollback(checkpoint: number): void;
	reserveDirect(
		componentId: string,
		contract: ExactServerExecutableComponentContract
	): number | undefined;
	publishDirect(
		token: number,
		host: object,
		state: Record<string, unknown>,
		props: Record<string, unknown>
	): void;
	serializedRecords(): readonly SsrSerializedResumption[];
	activations(): readonly ComponentResumptionActivation[];
}>;

/** Captures compiler-selected state directly in deterministic indexed construction order. */
export function createSsrResumptionCapture(
	options: RenderToStringOptions,
	publishedRootProps?: Readonly<Record<string, unknown>>,
	rootComponentId?: string
): CreatedSsrResumptionCapture {
	return createResumptionCapture(options, publishedRootProps, rootComponentId);
}

/** Constructs indexed capture without the generic-instance bridge unused by direct artifacts. */
export function createDirectSsrResumptionCapture(
	options: RenderToStringOptions,
	publishedRootProps?: Readonly<Record<string, unknown>>,
	rootComponentId?: string
): CreatedSsrResumptionCapture {
	return new DirectSsrResumptionCapture(options, publishedRootProps, rootComponentId);
}

type CreatedSsrResumptionCapture = {
	options: RenderToStringOptions;
	serializedRecords(): readonly SsrSerializedResumption[];
	activations(): readonly ComponentResumptionActivation[];
};

/** Request-owned direct capture whose fixed operations are shared through its prototype. */
class DirectSsrResumptionCapture implements CreatedSsrResumptionCapture, SsrResumptionCapture {
	readonly options: RenderToStringOptions;
	private readonly records: MutableSerializedResumption[] = [];
	private readonly schemas: SsrResumptionSchema[] = [];
	private readonly pathReadCell: ReactiveOwnPropertyReadCell = { value: undefined };
	private rootInputToken: number | undefined;
	private projectedActivations: readonly ComponentResumptionActivation[] | undefined;

	constructor(
		options: RenderToStringOptions,
		private readonly publishedRootProps: Readonly<Record<string, unknown>> | undefined,
		private readonly rootComponentId: string | undefined
	) {
		this.options = {
			...options,
			resumptionCapture: this,
			allowIndependentComponentObservation:
				!options.onComponentCreated &&
				!options.onComponentRendered &&
				!options.onDirectComponentCreated &&
				!options.onDirectComponentRendered
		};
	}

	checkpoint(): number {
		return this.records.length;
	}

	rollback(checkpoint: number): void {
		this.records.splice(checkpoint);
		this.schemas.splice(checkpoint);
		if (this.rootInputToken !== undefined && this.rootInputToken >= checkpoint)
			this.rootInputToken = undefined;
		this.projectedActivations = undefined;
	}

	reserveDirect(
		componentId: string,
		contract: ExactServerExecutableComponentContract
	): number | undefined {
		if (!contract.resumption) return undefined;
		const token = this.records.length;
		this.records.push([componentId]);
		this.schemas.push(resumptionSchema(contract));
		if (this.rootInputToken === undefined && componentId === this.rootComponentId)
			this.rootInputToken = token;
		this.projectedActivations = undefined;
		return token;
	}

	publishDirect(
		token: number,
		host: object,
		state: Record<string, unknown>,
		props: Record<string, unknown>
	): void {
		const record = this.records[token];
		const schema = this.schemas[token];
		if (!record || !schema) return;
		const values = captureDirectStateEntries(
			token === this.rootInputToken,
			state,
			props,
			schema,
			this.publishedRootProps,
			this.pathReadCell
		);
		const contexts = schema.contexts.length
			? captureContextEntries(
					serverComponentContinuationContextValuesForHost(host, schema.contexts),
					schema.contexts
				)
			: emptyIndexedEntries;
		const settled = schema.continuations.size
			? settledServerComponentContinuationIdsForHost(host).filter((id) =>
					schema.continuations.has(id)
				)
			: emptyContinuationIds;
		publishTuple(record, values, contexts, settled);
		this.projectedActivations = undefined;
	}

	serializedRecords(): readonly SsrSerializedResumption[] {
		return this.records;
	}

	activations(): readonly ComponentResumptionActivation[] {
		return (this.projectedActivations ??= this.records.map((record, index) =>
			projectActivation(record, this.schemas[index]!)
		));
	}
}

function createResumptionCapture(
	options: RenderToStringOptions,
	publishedRootProps: Readonly<Record<string, unknown>> | undefined,
	rootComponentId: string | undefined
): CreatedSsrResumptionCapture {
	const records: MutableSerializedResumption[] = [];
	const schemas: SsrResumptionSchema[] = [];
	const recordsByInstance = new WeakMap<AnyComponentInstance, number>();
	const pathReadCell: ReactiveOwnPropertyReadCell = { value: undefined };
	let rootInputToken: number | undefined;
	let projectedActivations: readonly ComponentResumptionActivation[] | undefined;

	const reserve = (
		componentId: string,
		contract: ExactServerExecutableComponentContract
	): number | undefined => {
		if (!contract.resumption) return undefined;
		const schema = resumptionSchema(contract);
		const token = records.length;
		records.push([componentId]);
		schemas.push(schema);
		if (rootInputToken === undefined && componentId === rootComponentId) rootInputToken = token;
		projectedActivations = undefined;
		return token;
	};

	const publish = (
		token: number,
		state: unknown,
		props: unknown,
		contexts: Record<string, unknown>,
		settledContinuations: readonly string[]
	): void => {
		const record = records[token];
		const schema = schemas[token];
		if (!record || !schema) return;
		const values = captureStateEntries(
			token === rootInputToken,
			state,
			props,
			schema,
			publishedRootProps,
			pathReadCell
		);
		const indexedContexts = schema.contexts.length
			? captureContextEntries(contexts, schema.contexts)
			: emptyIndexedEntries;
		const settled = schema.continuations.size
			? settledContinuations.filter((id) => schema.continuations.has(id))
			: emptyContinuationIds;
		publishTuple(record, values, indexedContexts, settled);
		projectedActivations = undefined;
	};

	const capture: SsrResumptionCapture = {
		checkpoint: () => records.length,
		rollback(checkpoint) {
			records.splice(checkpoint);
			schemas.splice(checkpoint);
			if (rootInputToken !== undefined && rootInputToken >= checkpoint) rootInputToken = undefined;
			projectedActivations = undefined;
		},
		reserveDirect(componentId, contract) {
			return reserve(componentId, contract);
		},
		publishDirect(token, host, state, props) {
			const schema = schemas[token];
			if (!schema) return;
			publish(
				token,
				state,
				props,
				schema.contexts.length
					? serverComponentContinuationContextValuesForHost(host, schema.contexts)
					: emptyContextValues,
				schema.continuations.size
					? settledServerComponentContinuationIdsForHost(host)
					: emptyContinuationIds
			);
		},
		serializedRecords: () => records,
		activations() {
			return (projectedActivations ??= records.map((record, index) =>
				projectActivation(record, schemas[index]!)
			));
		}
	};

	const allowIndependentComponentObservation =
		!options.onComponentCreated &&
		!options.onComponentRendered &&
		!options.onDirectComponentCreated &&
		!options.onDirectComponentRendered;
	const captureOptions: RenderToStringOptions = {
		...options,
		resumptionCapture: capture,
		allowIndependentComponentObservation,
		onComponentCreated(instance) {
			const contract = readPreparedExactServerExecutableComponentContract(instance.type);
			const token = reserve(exactComponentIdentity(instance.type), contract);
			if (token !== undefined) recordsByInstance.set(instance, token);
			options.onComponentCreated?.(instance);
		},
		onComponentRendered(instance) {
			const token = recordsByInstance.get(instance);
			if (token !== undefined) {
				const schema = schemas[token];
				if (schema)
					publish(
						token,
						instance.state,
						instance.props,
						schema.contexts.length
							? componentContinuationContextValues(instance, schema.contexts)
							: emptyContextValues,
						schema.continuations.size
							? settledComponentContinuationIds(instance)
							: emptyContinuationIds
					);
			}
			options.onComponentRendered?.(instance);
		},
		onComponentAttemptCheckpoint: () => [
			capture.checkpoint(),
			options.onComponentAttemptCheckpoint?.()
		],
		onComponentAttemptRollback(checkpoint) {
			if (Array.isArray(checkpoint) && typeof checkpoint[0] === 'number') {
				capture.rollback(checkpoint[0]);
				options.onComponentAttemptRollback?.(checkpoint[1]);
			}
		}
	};
	return {
		options: captureOptions,
		serializedRecords: capture.serializedRecords,
		activations: capture.activations
	};
}
