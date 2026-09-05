import { unwrap } from '@exactjs/reactive/framework/values';
import type { Child } from '../component/contracts.js';
import { encodeExactMarkerPart } from '../protocol.js';
import { normalizeRenderResult } from '../render-children.js';
import { createOpaqueOperation, sharedOpaqueOperationStore } from './opaque-operation.js';

declare const exactServerBoundaryReceiptBrand: unique symbol;
declare const exactServerSlotReceiptBrand: unique symbol;

/** Opaque compiler-owned client-island publication operation. */
export type ExactServerBoundaryReceipt = object & {
	readonly [exactServerBoundaryReceiptBrand]: never;
};

/** Opaque compiler-owned retained server-range operation. */
export type ExactServerSlotReceipt = object & { readonly [exactServerSlotReceiptBrand]: never };

/** Private compiler-selected client-island publication inputs consumed by SSR. */
export type ExactServerBoundaryReceiptData = Readonly<{
	id: string;
	name: string;
	props: Readonly<Record<string, unknown>>;
	children: readonly Child[];
}>;

/** Private retained server-range inputs and compiler-owned protocol authority. */
export type ExactServerSlotReceiptData = Readonly<{
	id: string;
	children: readonly Child[];
	key?: string;
	planVersion?: unknown;
	buildKey?: unknown;
	planEdgeId?: unknown;
	ownerComponentId?: unknown;
	discriminator?: unknown;
	generation?: unknown;
}>;

const boundaries = sharedOpaqueOperationStore<ExactServerBoundaryReceiptData>('server-boundary');
const slots = sharedOpaqueOperationStore<ExactServerSlotReceiptData>('server-slot');
/** Dispatch key implemented by SSR targets that publish a client island. */
export const exactServerBoundaryOperation = Symbol.for('@exactjs/target-operation/server-boundary');
/** Dispatch key implemented by SSR targets that retain a server-owned range. */
export const exactServerSlotOperation = Symbol.for('@exactjs/target-operation/server-slot');
/** Target contract selected by an opaque client-island publication. */
export type ExactServerBoundaryOperationTarget<Result = unknown> = Readonly<{
	[exactServerBoundaryOperation](
		operation: ExactServerBoundaryReceipt,
		data: ExactServerBoundaryReceiptData
	): Result;
}>;
/** Target contract selected by an opaque retained server range. */
export type ExactServerSlotOperationTarget<Result = unknown> = Readonly<{
	[exactServerSlotOperation](
		operation: ExactServerSlotReceipt,
		data: ExactServerSlotReceiptData
	): Result;
}>;

function executeServerBoundaryOperation(this: object, target: object): unknown {
	const data = boundaries.get(this);
	if (!data) throw new TypeError('Server-boundary operation lost its compiler-issued payload');
	return (target as ExactServerBoundaryOperationTarget)[exactServerBoundaryOperation](
		this as ExactServerBoundaryReceipt,
		data
	);
}

function executeServerSlotOperation(this: object, target: object): unknown {
	const data = slots.get(this);
	if (!data) throw new TypeError('Server-slot operation lost its compiler-issued payload');
	return (target as ExactServerSlotOperationTarget)[exactServerSlotOperation](
		this as ExactServerSlotReceipt,
		data
	);
}

/** Issues one compiler-owned client-island publication operation. */
export function createServerBoundaryReceipt(
	id: string,
	name: string,
	props: Record<string, unknown> = {},
	...children: unknown[]
): ExactServerBoundaryReceipt {
	const receipt = createOpaqueOperation<ExactServerBoundaryReceipt>(executeServerBoundaryOperation);
	boundaries.set(receipt, {
		id: String(unwrap(id) ?? ''),
		name: String(unwrap(name) ?? ''),
		props,
		children: normalizeRenderResult(children)
	});
	return receipt;
}

/** Creates a compiler-owned client-island publication operation. */
export const createServerBoundary = createServerBoundaryReceipt;

/** Issues a client boundary from compiler-lowered JSX props. */
export function createCompiledServerBoundaryReceipt(
	input: Record<string, unknown> | null,
	...children: unknown[]
): ExactServerBoundaryReceipt {
	const props = input ?? {};
	return createServerBoundaryReceipt(
		String(unwrap(props.id) ?? ''),
		String(unwrap(props.name) ?? ''),
		(unwrap(props.props) ?? {}) as Record<string, unknown>,
		...children
	);
}

/** Issues one compiler-owned retained server-range operation. */
export function createServerSlotReceipt(
	id: string,
	authority: Record<string, unknown> = {},
	...children: unknown[]
): ExactServerSlotReceipt {
	return issueServerSlotReceipt(String(unwrap(id) ?? ''), authority, children);
}

/** Creates or adopts one compiler-owned retained server range. */
export const createServerSlot = createServerSlotReceipt;

/** Issues a retained server range from compiler-lowered JSX props. */
export function createCompiledServerSlotReceipt(
	input: Record<string, unknown> | null,
	...children: unknown[]
): ExactServerSlotReceipt {
	const { id, ...authority } = input ?? {};
	return createServerSlotReceipt(String(unwrap(id) ?? ''), authority, ...children);
}

/** Issues one canonically keyed retained server range. */
export function createKeyedServerSlotReceipt(
	id: string,
	list: string,
	key: unknown,
	authority: Record<string, unknown> = {},
	...children: unknown[]
): ExactServerSlotReceipt {
	const rawKey = unwrap(key);
	if (rawKey === null || rawKey === undefined)
		throw new Error('Keyed server ranges require a canonical key');
	const keyToken = String(rawKey);
	return issueServerSlotReceipt(
		`${id}:key:${encodeExactMarkerPart(keyToken)}`,
		{ ...authority, key: keyToken, discriminator: { kind: 'keyed', list, keyToken } },
		children
	);
}

/** Creates one canonical keyed server range. */
export const createKeyedServerSlot = createKeyedServerSlotReceipt;

function issueServerSlotReceipt(
	id: string,
	authority: Record<string, unknown>,
	children: unknown[]
): ExactServerSlotReceipt {
	const { key, ...protocolAuthority } = authority;
	const receipt = createOpaqueOperation<ExactServerSlotReceipt>(executeServerSlotOperation);
	slots.set(receipt, {
		id,
		children: normalizeRenderResult(children),
		...(key === null || key === undefined ? {} : { key: String(unwrap(key)) }),
		...protocolAuthority
	});
	return receipt;
}

/** Reads a compiler-issued client-island publication operation without accepting arbitrary objects. */
export function readServerBoundaryReceipt(
	value: unknown
): ExactServerBoundaryReceiptData | undefined {
	return typeof value === 'object' && value !== null ? boundaries.get(value) : undefined;
}

/** Reads a compiler-issued retained server-range operation without accepting arbitrary objects. */
export function readServerSlotReceipt(value: unknown): ExactServerSlotReceiptData | undefined {
	return typeof value === 'object' && value !== null ? slots.get(value) : undefined;
}
