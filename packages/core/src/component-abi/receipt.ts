import { unwrap } from '@exactjs/reactive/framework/values';
import type { Child, CompiledEnhancementNode, ComponentDomain } from '../component/contracts.js';
import { currentComponentDomain } from '../component/domain.js';
import {
	readPreparedExactExecutableComponentContract,
	type ExactExecutableComponentContract
} from '../component-contracts.js';
import { normalizeRenderResult } from '../render-children.js';
import type { AnyExactComponentCallable } from './executable-fields.js';
import { createOpaqueOperation, sharedOpaqueOperationStore } from './opaque-operation.js';
import type {
	ExactNarrowComponentUpdateContract,
	ExactWideComponentUpdateContract
} from '../component-contracts.js';

declare const exactComponentReceiptBrand: unique symbol;
const PreparedServerComponentReference = Symbol.for('@exactjs/prepared-server-component-reference');
const emptyServerComponentChildren: readonly Child[] = Object.freeze([]);

/** Opaque compiler-owned request to invoke one already-selected target component artifact. */
export type ExactComponentReceipt = object & {
	readonly [exactComponentReceiptBrand]: never;
};

/** Private receipt contents readable only by the selected target renderer. */
export type ExactComponentReceiptData = Readonly<{
	contract: ExactExecutableComponentContract;
	props: Readonly<Record<string, unknown>>;
	children: readonly Child[];
	key?: string;
	domain?: ComponentDomain;
	enhancement?: CompiledEnhancementNode;
	update?: ExactComponentReceiptUpdate;
	/** Renderer-injected provider whose descendants retain the authored update owner. */
	transparentUpdateOwner?: true;
}>;

/** Direct target-local component reference emitted only into compiler-closed server artifacts. */
export type ExactPreparedServerComponentReference = ExactComponentReceiptData &
	Readonly<Record<never, never>>;

/** Compiler-owned parent update target carried opaquely to the selected target renderer. */
export type ExactComponentReceiptUpdate = Readonly<{
	target: number;
	contract: ExactNarrowComponentUpdateContract | ExactWideComponentUpdateContract;
}>;

const receipts = sharedOpaqueOperationStore<ExactComponentReceiptData>('component');
/** Dispatch key implemented by render targets that accept component operations. */
export const exactComponentOperation = Symbol.for('@exactjs/target-operation/component');

/** Target-owned component invocation selected by the operation rather than by caller inspection. */
export type ExactComponentOperationTarget<Result = unknown> = Readonly<{
	[exactComponentOperation](
		operation: ExactComponentReceipt,
		data: ExactComponentReceiptData
	): Result;
}>;

function executeComponentOperation(this: object, target: object): unknown {
	const data = receipts.get(this);
	if (!data) throw new TypeError('Component operation lost its compiler-issued payload');
	return (target as ExactComponentOperationTarget)[exactComponentOperation](
		this as ExactComponentReceipt,
		data
	);
}

/**
 * Publishes a direct component-ABI operation without exposing component shape.
 * The compiler selects this operation only after resolving the target artifact at build time.
 */
export function createCompiledComponentReceipt(
	type: AnyExactComponentCallable,
	props: Record<string, unknown> | null,
	...children: unknown[]
): ExactComponentReceipt {
	const { key: authoredKey, __exactEnhancements: enhancement, ...componentProps } = props ?? {};
	const rawKey = unwrap(authoredKey);
	const domain = currentComponentDomain();
	const key = rawKey === null || rawKey === undefined ? undefined : String(rawKey);
	const receipt = createOpaqueOperation<ExactComponentReceipt>(executeComponentOperation, {
		...(key === undefined ? {} : { key }),
		...(domain ? { domain } : {})
	});
	receipts.set(receipt, {
		contract: readPreparedExactExecutableComponentContract(type),
		props: componentProps,
		children: normalizeRenderResult(children),
		...(key === undefined ? {} : { key }),
		...(domain ? { domain } : {}),
		...(enhancement ? { enhancement: enhancement as CompiledEnhancementNode } : {})
	});
	return receipt;
}

export function createPreparedServerComponentReference(
	type: AnyExactComponentCallable,
	props: Record<string, unknown> | null,
	...children: unknown[]
): ExactPreparedServerComponentReference;
/**
 * Creates one direct server component reference without an opaque operation or WeakMap payload.
 *
 * The compiler emits this function only into server-target artifacts. The returned object remains
 * request-local and is consumed directly by the server renderer; it must never cross a client or
 * compatibility boundary.
 */
export function createPreparedServerComponentReference(
	type: AnyExactComponentCallable,
	props: Record<string, unknown> | null,
	...authoredChildren: unknown[]
): ExactPreparedServerComponentReference {
	const source = props ?? {};
	const authoredKey = source.key;
	const enhancement = source.__exactEnhancements;
	const rawKey = unwrap(authoredKey);
	const key = rawKey === null || rawKey === undefined ? undefined : String(rawKey);
	const domain = currentComponentDomain();
	let componentProps = source;
	if (Object.hasOwn(source, 'key') || Object.hasOwn(source, '__exactEnhancements')) {
		componentProps = { ...source };
		delete componentProps.key;
		delete componentProps.__exactEnhancements;
	}
	let children: readonly Child[] = emptyServerComponentChildren;
	if (authoredChildren.length > 0) children = normalizeRenderResult(authoredChildren);
	const reference = {
		[PreparedServerComponentReference]: true,
		contract: readPreparedExactExecutableComponentContract(type),
		props: componentProps,
		children
	} as {
		readonly [key: symbol]: unknown;
		contract: ExactExecutableComponentContract;
		props: Record<string, unknown>;
		children: readonly Child[];
		key?: string;
		domain?: ComponentDomain;
		enhancement?: CompiledEnhancementNode;
	};
	if (key !== undefined) reference.key = key;
	if (domain) reference.domain = domain;
	if (enhancement) reference.enhancement = enhancement as CompiledEnhancementNode;
	return reference as ExactPreparedServerComponentReference;
}

/** Reads only the direct reference representation issued by a compiler-closed server artifact. */
export function readPreparedServerComponentReference(
	value: unknown
): ExactPreparedServerComponentReference | undefined {
	return typeof value === 'object' && value !== null && PreparedServerComponentReference in value
		? (value as unknown as ExactPreparedServerComponentReference)
		: undefined;
}

/** Reads a compiler-issued receipt; arbitrary objects never become component candidates. */
export function readCompiledComponentReceipt(
	value: unknown
): ExactComponentReceiptData | undefined {
	return typeof value === 'object' && value !== null ? receipts.get(value) : undefined;
}

/** Attaches one compiler-indexed parent-to-child prop receipt operation. */
export function withCompiledComponentReceiptUpdate(
	value: ExactComponentReceipt,
	target: number,
	contract: ExactNarrowComponentUpdateContract | ExactWideComponentUpdateContract
): ExactComponentReceipt {
	const data = receipts.get(value);
	if (!data) throw new TypeError('Component update metadata requires a compiled component receipt');
	const receipt = createOpaqueOperation<ExactComponentReceipt>(executeComponentOperation, data);
	receipts.set(receipt, { ...data, update: { target, contract } });
	return receipt;
}

/** Marks a renderer-injected provider without changing its semantic component parentage. */
export function withTransparentComponentUpdateOwner(
	value: ExactComponentReceipt
): ExactComponentReceipt {
	const data = receipts.get(value);
	if (!data)
		throw new TypeError('Transparent update ownership requires a compiled component receipt');
	const receipt = createOpaqueOperation<ExactComponentReceipt>(executeComponentOperation, data);
	receipts.set(receipt, { ...data, transparentUpdateOwner: true });
	return receipt;
}

/** Removes declaration metadata while preserving one compiler-issued component operation. */
export function withoutCompiledComponentReceiptEnhancement(
	value: unknown
): ExactComponentReceipt | undefined {
	const data = readCompiledComponentReceipt(value);
	if (!data) return undefined;
	if (!data.enhancement) return value as ExactComponentReceipt;
	const receipt = createOpaqueOperation<ExactComponentReceipt>(executeComponentOperation, data);
	const { enhancement: _enhancement, ...plain } = data;
	receipts.set(receipt, plain);
	return receipt;
}
