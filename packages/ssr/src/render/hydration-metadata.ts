import type { ExactOutputExtension } from '@exactjs/plugin-api';
import { processExactOutputSync } from '@exactjs/plugin-host/runtime';
import type { SsrResumptionLayout, SsrSerializedResumption } from '../resumption.js';
import type { HydrationScriptOptions } from '../types.js';

/** Constructs the already-final compiler-closed envelope without generic output transformation. */
export function createDirectHydrationMetadata(
	options: HydrationScriptOptions,
	resumptions: readonly SsrSerializedResumption[]
): Record<string, unknown> {
	const output: Record<string, unknown> = {};
	assignDefined(output, 'pluginRegistryFingerprint', options.pluginRegistryFingerprint);
	assignDefined(output, 'endpoint', options.endpoint);
	if (options.endpoints) {
		const endpoints = compactEndpointRoutes(options.endpoints);
		if (Object.keys(endpoints).length) output.endpoints = endpoints;
	}
	assignDefined(output, 'state', options.state);
	if (options.markerlessRoot) output.m = 1;
	if (options.continuations) output.continuations = compactContinuations(options.continuations);
	if (resumptions.length) output.resumptions = resumptions;
	if (options.publicContexts && !isEmptyRecord(options.publicContexts))
		output.publicContexts = options.publicContexts;
	assignDefined(output, 'wallClockSnapshot', options.wallClockSnapshot);
	assignDefined(output, 'h', options.hydrationTable);
	assignDefined(output, 'executionRoot', options.executionRoot);
	assignDefined(output, 'binding', options.binding);
	assignDefined(output, 'buildKey', options.buildKey);
	assignDefined(output, 'componentAuthorization', options.componentAuthorization);
	return output;
}

/** Applies the explicit extension boundary before compacting authored hydration metadata. */
export function createExtensibleHydrationMetadata(
	options: HydrationScriptOptions,
	resumptionLayouts?: ReadonlyMap<string, SsrResumptionLayout>
): Record<string, unknown> {
	const payloadValue = processExactOutputSync<Record<string, unknown>>(
		omitUndefinedProperties({
			pluginRegistryFingerprint: options.pluginRegistryFingerprint,
			endpoint: options.endpoint,
			endpoints: options.endpoints,
			state: options.state,
			m: options.markerlessRoot ? 1 : undefined,
			continuations: options.continuations,
			resumptions: options.resumptions,
			publicContexts: options.publicContexts,
			wallClockSnapshot: options.wallClockSnapshot,
			h: options.hydrationTable,
			executionRoot: options.executionRoot,
			binding: options.binding,
			buildKey: options.buildKey,
			componentAuthorization: options.componentAuthorization
		}),
		{ kind: 'hydration' },
		(options.outputExtensions ?? []) as readonly ExactOutputExtension<Record<string, unknown>>[]
	);
	return compactHydrationMetadata(payloadValue, resumptionLayouts);
}

function compactHydrationMetadata(
	value: Record<string, unknown>,
	resumptionLayouts?: ReadonlyMap<string, SsrResumptionLayout>
): Record<string, unknown> {
	const output = { ...value };
	compactOptionalRecord(output, 'endpoints', compactEndpointRoutes);
	compactOptionalRecord(output, 'continuations', compactContinuations);
	compactOptionalArray(output, 'resumptions', (resumption) =>
		compactResumption(resumption, resumptionLayouts)
	);
	if (isEmptyRecord(output.publicContexts)) delete output.publicContexts;
	return output;
}

function compactEndpointRoutes(value: Record<string, unknown>): Record<string, unknown> {
	const output = { ...value };
	for (const field of ['invocations', 'boundaries'] as const) {
		if (isEmptyRecord(output[field])) delete output[field];
	}
	return output;
}

function compactContinuations(value: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(value).map(([id, continuation]) => [
			id,
			isPlainRecord(continuation) ? compactContinuation(continuation) : continuation
		])
	);
}

function compactContinuation(value: Record<string, unknown>): Record<string, unknown> {
	const output = omitEmptyArrays(value, [
		'dependencies',
		'stateReads',
		'stateWrites',
		'publicContexts',
		'contextWrites',
		'boundaries'
	]);
	delete output.serverContexts;
	delete output.serverContextWrites;
	return output;
}

function compactResumption(
	value: unknown,
	layouts?: ReadonlyMap<string, SsrResumptionLayout>
): unknown {
	if (!isPlainRecord(value)) return value;
	const output = omitEmptyArrays(value, ['settledContinuations']);
	for (const field of ['values', 'contexts'] as const) {
		if (isEmptyRecord(output[field])) delete output[field];
	}
	const componentId = output.componentId;
	const layout = typeof componentId === 'string' ? layouts?.get(componentId) : undefined;
	if (typeof componentId !== 'string') return output;
	const values = compactEntries(output.values, layout?.statePaths);
	const contexts = compactEntries(output.contexts, layout?.contexts);
	if (!values || !contexts) return output;
	const settled = Array.isArray(output.settledContinuations) ? output.settledContinuations : [];
	const tuple: unknown[] = [componentId];
	if (values.length || contexts.length || settled.length) tuple.push(values);
	if (contexts.length || settled.length) tuple.push(contexts);
	if (settled.length) tuple.push(settled);
	return tuple;
}

/** Replaces compiler-declared field names with their stable contract indexes. */
function compactEntries(
	value: unknown,
	fields?: readonly string[]
): readonly (readonly [number | string, unknown])[] | undefined {
	if (value === undefined) return [];
	if (!isPlainRecord(value)) return undefined;
	const entries: Array<readonly [number | string, unknown]> = [];
	for (const [field, item] of Object.entries(value)) {
		const index = fields?.indexOf(field);
		if (fields && index === -1) return undefined;
		entries.push([index ?? field, item]);
	}
	return entries;
}

function compactOptionalRecord(
	owner: Record<string, unknown>,
	field: string,
	compact: (value: Record<string, unknown>) => Record<string, unknown>
): void {
	const value = owner[field];
	if (!isPlainRecord(value)) return;
	const compacted = compact(value);
	if (Object.keys(compacted).length) owner[field] = compacted;
	else delete owner[field];
}

function compactOptionalArray(
	owner: Record<string, unknown>,
	field: string,
	compact: (value: unknown) => unknown
): void {
	const value = owner[field];
	if (!Array.isArray(value)) return;
	if (!value.length) delete owner[field];
	else owner[field] = value.map(compact);
}

function omitEmptyArrays(
	value: Record<string, unknown>,
	fields: readonly string[]
): Record<string, unknown> {
	const output = { ...value };
	for (const field of fields) {
		const item = output[field];
		if (Array.isArray(item) && !item.length) delete output[field];
	}
	const invocation = output.invocation;
	if (isPlainRecord(invocation)) output.invocation = omitEmptyArrays(invocation, ['arguments']);
	return output;
}

function isEmptyRecord(value: unknown): boolean {
	return isPlainRecord(value) && Object.keys(value).length === 0;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function omitUndefinedProperties(value: Record<string, unknown>): Record<string, unknown> {
	const output: Record<string, unknown> = {};
	for (const [key, item] of Object.entries(value)) {
		if (item !== undefined) output[key] = item;
	}
	return output;
}

function assignDefined(owner: Record<string, unknown>, field: string, value: unknown): void {
	if (value !== undefined) owner[field] = value;
}
