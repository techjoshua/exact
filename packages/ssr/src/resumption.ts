import { type ComponentResumptionActivation } from '@exactjs/core';
import { type ExactServerExecutableComponentContract } from '@exactjs/core/framework/component-contracts';
import {
	serverComponentContinuationContextValuesForHost,
	settledServerComponentContinuationIdsForHost
} from '@exactjs/core/framework/server-component-execution';
import { type ReactiveOwnPropertyReadCell } from '@exactjs/reactive/framework/indexed-objects';
import {
	captureContextEntries,
	captureDirectStateEntries,
	emptyContinuationIds,
	emptyIndexedEntries,
	projectActivation,
	publishTuple,
	resumptionSchema,
	type MutableSerializedResumption,
	type SsrResumptionSchema,
	type SsrSerializedResumption
} from './resumption-serialization.js';
import type { RenderToStringOptions } from './types.js';
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
