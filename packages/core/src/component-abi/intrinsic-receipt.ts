import { unwrap } from '@exactjs/reactive/framework/values';
import type { Child, CompiledEnhancementNode, ComponentDomain } from '../component/contracts.js';
import { currentComponentDomain, withComponentDomainSnapshot } from '../component/domain.js';
import { normalizeRenderResult } from '../render-children.js';
import { createOpaqueOperation, sharedOpaqueOperationStore } from './opaque-operation.js';

declare const exactIntrinsicReceiptBrand: unique symbol;

/** Opaque compiler-issued operation for one intrinsic element. */
export type ExactIntrinsicReceipt = object & {
	readonly [exactIntrinsicReceiptBrand]: never;
};

/** Private target-renderer inputs for a compiler-selected intrinsic operation. */
export type ExactIntrinsicReceiptData = Readonly<{
	tag: string;
	props: Readonly<Record<string, unknown>>;
	children: readonly Child[];
	key?: string;
	domain?: ComponentDomain;
	enhancement?: CompiledEnhancementNode;
}>;

const intrinsics = sharedOpaqueOperationStore<ExactIntrinsicReceiptData>('intrinsic');
const compositionViews = sharedOpaqueOperationStore<{
	factory?: () => unknown;
	domain?: ComponentDomain;
	data?: ExactIntrinsicReceiptData;
}>('intrinsic-composition');

/**
 * Retains a compiler-proven side-effect-free structural view beside an optimized operation.
 * Rendering does not evaluate this view. Public child composition redeems it once in its original
 * creation domain, without constructing any component instances or changing dispatch identity.
 */
export function withIntrinsicComposition<Receipt extends object>(
	receipt: Receipt,
	factory: () => unknown
): Receipt {
	compositionViews.set(receipt, { factory, domain: currentComponentDomain() });
	return receipt;
}

/** Redeems authored intrinsic structure only for explicit child inspection or derivation. */
export function readComposableIntrinsicReceipt(
	value: unknown
): ExactIntrinsicReceiptData | undefined {
	const direct = readCompiledIntrinsicReceipt(value);
	if (direct || typeof value !== 'object' || value === null) return direct;
	const view = compositionViews.get(value);
	if (!view) return undefined;
	if (!view.data) {
		const described = withComponentDomainSnapshot(view.domain, view.factory!);
		const data = readCompiledIntrinsicReceipt(described);
		if (!data)
			throw new TypeError('An intrinsic composition view must describe an intrinsic receipt');
		view.data = data;
		view.factory = undefined;
		view.domain = undefined;
	}
	return view.data;
}
/** Dispatch key implemented by render targets that accept intrinsic operations. */
export const exactIntrinsicOperation = Symbol.for('@exactjs/target-operation/intrinsic');

/** Target-owned intrinsic placement selected by the operation rather than by caller inspection. */
export type ExactIntrinsicOperationTarget<Result = unknown> = Readonly<{
	[exactIntrinsicOperation](
		operation: ExactIntrinsicReceipt,
		data: ExactIntrinsicReceiptData
	): Result;
}>;

function executeIntrinsicOperation(this: object, target: object): unknown {
	const data = intrinsics.get(this);
	if (!data) throw new TypeError('Intrinsic operation lost its compiler-issued payload');
	return (target as ExactIntrinsicOperationTarget)[exactIntrinsicOperation](
		this as ExactIntrinsicReceipt,
		data
	);
}

/** Issues a direct intrinsic operation. */
export function createCompiledIntrinsicReceipt(
	tag: string,
	props: Record<string, unknown> | null,
	...children: unknown[]
): ExactIntrinsicReceipt {
	if (typeof tag !== 'string')
		throw new TypeError('Compiled intrinsic receipt requires an intrinsic tag');
	const { key: authoredKey, __exactEnhancements: enhancement, ...intrinsicProps } = props ?? {};
	return issueIntrinsicReceipt(tag, intrinsicProps, children, authoredKey, enhancement);
}

/** Preserves compiler-deferred clock attributes until their server enhancement configures its environment. */
export function createDeferredServerIntrinsicReceipt(
	tag: string,
	props: Record<string, unknown> | null,
	...children: unknown[]
): ExactIntrinsicReceipt {
	if (typeof tag !== 'string')
		throw new TypeError('Compiled intrinsic receipt requires an intrinsic tag');
	const descriptors = Object.getOwnPropertyDescriptors(props ?? {});
	const authoredKey = props?.key;
	const enhancement = props?.__exactEnhancements;
	delete descriptors.key;
	delete descriptors.__exactEnhancements;
	const intrinsicProps = Object.defineProperties({}, descriptors) as Record<string, unknown>;
	return issueIntrinsicReceipt(tag, intrinsicProps, children, authoredKey, enhancement);
}

/**
 * Defers one clock-bearing server property group until enhancement preparation completes.
 * Eager metadata establishes key and enhancement ownership. The reader evaluates spreads once
 * in source order, and its resulting keys are retained without allocating reactive observers.
 */
export function createDeferredServerIntrinsicSpreadReceipt(
	tag: string,
	metadata: Record<string, unknown>,
	readProps: () => Record<string, unknown>,
	...children: unknown[]
): ExactIntrinsicReceipt {
	if (typeof tag !== 'string')
		throw new TypeError('Compiled intrinsic receipt requires an intrinsic tag');
	let resolved: Record<string, unknown> | undefined;
	const operation = issueIntrinsicReceipt(
		tag,
		{},
		children,
		metadata.key,
		metadata.__exactEnhancements
	);
	const data = intrinsics.get(operation)!;
	Object.defineProperty(data, 'props', {
		enumerable: true,
		configurable: true,
		get() {
			if (!resolved) {
				const { key: _key, __exactEnhancements: _enhancement, ...props } = readProps();
				resolved = props;
			}
			return resolved;
		}
	});
	return operation;
}

/** Issues the shared opaque operation after each constructor establishes its property evaluation contract. */
function issueIntrinsicReceipt(
	tag: string,
	intrinsicProps: Record<string, unknown>,
	children: unknown[],
	authoredKey: unknown,
	enhancement: unknown
): ExactIntrinsicReceipt {
	const rawKey = unwrap(authoredKey);
	const domain = currentComponentDomain();
	const key = rawKey === null || rawKey === undefined ? undefined : String(rawKey);
	const receipt = createOpaqueOperation<ExactIntrinsicReceipt>(executeIntrinsicOperation, {
		key,
		domain
	});
	intrinsics.set(receipt, {
		tag,
		props: intrinsicProps,
		children: normalizeRenderResult(children),
		key,
		domain,
		enhancement: enhancement ? (enhancement as CompiledEnhancementNode) : undefined
	});
	return receipt;
}

/** Reads only compiler-issued intrinsic operations. */
export function readCompiledIntrinsicReceipt(
	value: unknown
): ExactIntrinsicReceiptData | undefined {
	return typeof value === 'object' && value !== null ? intrinsics.get(value) : undefined;
}

/** Derives an intrinsic while retaining every attribute and ownership capability by identity. */
export function withIntrinsicReceiptChildren(
	value: unknown,
	children: readonly Child[]
): ExactIntrinsicReceipt {
	const data = readComposableIntrinsicReceipt(value);
	if (!data) throw new TypeError('withChildren requires a composable intrinsic element');
	const receipt = createOpaqueOperation<ExactIntrinsicReceipt>(executeIntrinsicOperation, {
		key: data.key,
		domain: data.domain
	});
	// Ordinary receipts retain the small object-copy path. Lazy host groups must keep
	// their accessor without observing it before enhancement preparation.
	const derived = Object.getOwnPropertyDescriptor(data, 'props')?.get
		? (Object.defineProperty(
				Object.defineProperties({}, Object.getOwnPropertyDescriptors(data)),
				'children',
				{ value: children, enumerable: true, configurable: true }
			) as ExactIntrinsicReceiptData)
		: { ...data, children };
	intrinsics.set(receipt, derived);
	return receipt;
}

/** Removes declaration metadata while preserving one compiler-issued intrinsic operation. */
export function withoutCompiledIntrinsicReceiptEnhancement(
	value: unknown
): ExactIntrinsicReceipt | undefined {
	const data = readCompiledIntrinsicReceipt(value);
	if (!data) return undefined;
	if (!data.enhancement) return value as ExactIntrinsicReceipt;
	const receipt = createOpaqueOperation<ExactIntrinsicReceipt>(executeIntrinsicOperation, {
		key: data.key,
		domain: data.domain
	});
	if (Object.getOwnPropertyDescriptor(data, 'props')?.get) {
		const descriptors: Record<string, PropertyDescriptor> = Object.getOwnPropertyDescriptors(data);
		delete descriptors.enhancement;
		intrinsics.set(receipt, Object.defineProperties({}, descriptors) as ExactIntrinsicReceiptData);
	} else {
		const { enhancement: _enhancement, ...plain } = data;
		intrinsics.set(receipt, plain);
	}
	return receipt;
}
