import { unwrap } from '@exactjs/reactive/framework/values';
import type { AnyComponentInstance, Child, ComponentDomain } from '../component/contracts.js';
import { currentComponentDomain } from '../component/domain.js';
import { normalizeRenderResult } from '../render-children.js';
import { createOpaqueOperation, sharedOpaqueOperationStore } from './opaque-operation.js';

declare const exactTargetReceiptBrand: unique symbol;

/** Opaque compiler-issued semantic-target child-range operation. */
export type ExactTargetReceipt = object & { readonly [exactTargetReceiptBrand]: never };

/** Private DOM and SSR inputs for one semantic target range. */
export type ExactTargetReceiptData = Readonly<{
	props: Readonly<Record<string, unknown>>;
	children: readonly Child[];
	/** A compiler-known host contribution survives server-only callback projection. */
	declaredHostProps?: boolean;
	/** Prepared contributions ordered outer-to-inner, independent of rendered wrapper topology. */
	contributions?: readonly ExactTargetContribution[];
	key?: string;
	domain?: ComponentDomain;
}>;

/** One independently released owner on a prepared shared target. Identity is runtime-local. */
export type ExactTargetContribution = Readonly<{
	identity: object | symbol;
	props: Readonly<Record<string, unknown>>;
	owner?: AnyComponentInstance;
}>;

const targets = sharedOpaqueOperationStore<ExactTargetReceiptData>('target');
/** Dispatch key implemented by render targets that accept semantic target ranges. */
export const exactTargetOperation = Symbol.for('@exactjs/target-operation/target');
/** Target contract selected by an opaque semantic-target operation. */
export type ExactTargetOperationTarget<Result = unknown> = Readonly<{
	[exactTargetOperation](operation: ExactTargetReceipt, data: ExactTargetReceiptData): Result;
}>;

function executeTargetOperation(this: object, target: object): unknown {
	const data = targets.get(this);
	if (!data) throw new TypeError('Target operation lost its compiler-issued payload');
	return (target as ExactTargetOperationTarget)[exactTargetOperation](
		this as ExactTargetReceipt,
		data
	);
}

/** Issues a semantic-target range operation directly. */
export function createCompiledTargetReceipt(
	props: Record<string, unknown> | null,
	...children: unknown[]
): ExactTargetReceipt {
	const { key: authoredKey, __exactTargetHostProps, ...targetProps } = props ?? {};
	const rawKey = unwrap(authoredKey);
	const domain = currentComponentDomain();
	const key = rawKey === null || rawKey === undefined ? undefined : String(rawKey);
	const receipt = createOpaqueOperation<ExactTargetReceipt>(executeTargetOperation, {
		key,
		domain
	});
	targets.set(receipt, {
		props: targetProps,
		children: normalizeRenderResult(children),
		declaredHostProps: __exactTargetHostProps === true ? true : undefined,
		key,
		domain
	});
	return receipt;
}

/**
 * Places one implicitly supplied logical child. Empty values stay empty; several independent
 * children require an explicit fragment. This validates cardinality without executing components
 * or interpreting the child's physical output. The compiler observes reactive inputs before calling.
 */
export function createCompiledSuppliedTargetReceipt(
	props: Record<string, unknown> | null,
	supplied: unknown
): ExactTargetReceipt {
	const value = unwrap(supplied);
	if (!Array.isArray(value)) return createCompiledTargetReceipt(props, value);
	let selected: Child;
	let found = false;
	for (const child of normalizeRenderResult(value)) {
		if (child === null || child === undefined || typeof child === 'boolean') continue;
		if (found)
			throw new TypeError(
				'_target requires one logical child; wrap multiple children in an explicit fragment'
			);
		selected = child;
		found = true;
	}
	return createCompiledTargetReceipt(props, selected);
}

/**
 * Issues one target placement with separately owned layers, avoiding a rendered node per owner.
 * Caller-provided identities are retained only for the lifetime of this operation and its mount.
 * The target is already prepared; this helper does not evaluate children or choose enhancements.
 */
export function createCompiledTargetContributions(
	contributions: readonly ExactTargetContribution[],
	target: Child
): ExactTargetReceipt {
	const identities = new Set<object | symbol>();
	for (const contribution of contributions) {
		if (identities.has(contribution.identity))
			throw new TypeError('Duplicate target contribution owner');
		identities.add(contribution.identity);
	}
	const receipt = createCompiledTargetReceipt(null, target);
	targets.set(receipt, {
		...targets.get(receipt)!,
		contributions: Object.freeze([...contributions])
	});
	return receipt;
}

/** Reads only compiler-issued semantic-target operations. */
export function readCompiledTargetReceipt(value: unknown): ExactTargetReceiptData | undefined {
	return typeof value === 'object' && value !== null ? targets.get(value) : undefined;
}
