import {
	readCompiledComponentReceipt,
	type ExactComponentReceiptData
} from '@exactjs/core/runtime/component-abi';
import { readPreparedServerComponentReference } from '@exactjs/core/framework/server-render-structure';
import type { ExactServerExecutableComponentContract } from '@exactjs/core/framework/component-contracts';
import { normalizeChildren } from '@exactjs/core';
import { unwrap } from '@exactjs/reactive/framework/values';
import type { SsrComponentExecutionBlueprint } from './root-execution-cache.js';

/** Target-local server view of one opaque compiler-issued component operation. */
export type ServerComponentReference = ExactComponentReceiptData;

/** Accepts only an issued native component operation. */
export function readServerComponentReference(value: unknown): ServerComponentReference | undefined {
	return readPreparedServerComponentReference(value) ?? readCompiledComponentReceipt(value);
}

/** Narrows the private receipt representation. */
export function isComponentReceiptData(
	reference: ServerComponentReference
): reference is ExactComponentReceiptData {
	return !!reference.contract;
}

/** Builds construction props without materializing rendered topology. */
export function serverComponentProps(reference: ServerComponentReference): Record<string, unknown> {
	if (reference.children.length === 0) return reference.props;
	const props = { ...reference.props };
	const children = normalizeChildren(reference.children.map((child) => unwrap(child)));
	if (children.length === 1) props.children = children[0];
	else if (children.length > 1) props.children = children;
	return props;
}

/** Resolves receipt-carried server facts without looking up a component type. */
export function receiptExecutionBlueprint(
	receipt: ExactComponentReceiptData
): SsrComponentExecutionBlueprint {
	if (receipt.contract.artifact.target !== 'server')
		throw new TypeError('Server renderer received a client component receipt');
	return {
		componentId: receipt.contract.artifact.id,
		contract: receipt.contract as ExactServerExecutableComponentContract
	};
}

/** Returns authored identity inputs needed by marker publication. */
export function serverComponentReferenceIdentity(reference: ServerComponentReference): {
	readonly componentId: string;
	readonly key?: string;
} {
	return { componentId: reference.contract.artifact.id, key: reference.key };
}
