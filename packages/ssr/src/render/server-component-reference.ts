import type { DirectScheduledSsrComponent } from './direct-component-contracts.js';
import type { SsrContext } from '../types.js';
import { normalizeChildren, type Child } from '@exactjs/core';
import { withComponentDomainSnapshot } from '@exactjs/core/framework/component-domains';
import type { ExactServerExecutableComponentContract } from '@exactjs/core/framework/component-contracts';
import { componentContractVersion } from '../component-contract-version.js';
import {
	inspectComponentInput,
	rethrowComponentInputFailure,
	redeemComponentInput,
	componentInputRecipe,
	acquireComponentPropInputs,
	type ExactAdmittedComponentInput,
	type ExactComponentInputRecipe
} from '@exactjs/core/runtime/component-operations';
import {
	isCompiledPropOperand,
	readCompiledPropOperand
} from '@exactjs/reactive/framework/runtime';
import type { SsrComponentExecutionBlueprint } from './root-execution-cache.js';
/** Independently generated SSR input implementation, never inferred from incoming data. */
export const serverComponentInputProvider = {
	version: componentContractVersion,
	target: 'server'
} as const;
/** One actual server execution's acquired inputs, retained through copies and explicit views. */
export interface ComponentExecutionInputRecord {
	readonly pass: object;
	readonly occurrence: object;
	readonly admitted: ExactAdmittedComponentInput<'server'>;
	readonly inputs: Readonly<{
		props: Readonly<Record<string, unknown>>;
		children: readonly Child[];
	}>;
	readonly constructionProps: Readonly<Record<string, unknown>>;
	readonly publicationProps: Readonly<Record<string, unknown>>;
}
/** Admitted metadata before acquisition, with occurrence-local input ownership after preparation. */
export type ServerComponentReference = Omit<ExactComponentInputRecipe, 'children'> & {
	readonly admitted: ExactAdmittedComponentInput<'server'>;
	readonly source: object;
	readonly children: readonly Child[];
	preparedScheduled?: import('./direct-component-contracts.js').DirectScheduledSsrComponent;
	occurrenceClaimed?: true;
	inputs?: ComponentExecutionInputRecord;
};
/** Reads only admitted identity/recipe data, never a children reader. */
export function readServerComponentReference(value: unknown): ServerComponentReference | undefined {
	const identity = inspectComponentInput(value);
	if (identity.kind === 'noncomponent') return undefined;
	const admitted = redeemComponentInput(value, serverComponentInputProvider);
	const recipe = componentInputRecipe(admitted, serverComponentInputProvider);
	return {
		...recipe,
		admitted,
		source: value as object,
		children: recipe.children.kind === 'eager' ? normalizeChildren([...recipe.children.values]) : []
	};
}
/** Preserves a private admitted view without accepting caller-provided unvalidated recipes. */
export function isComponentReceiptData(reference: ServerComponentReference): boolean {
	componentInputRecipe(reference.admitted, serverComponentInputProvider);
	return true;
}
/** Acquires once under this occurrence. Reuse requires the explicit execution record. */
export function prepareServerComponentInputs(
	admitted: ExactAdmittedComponentInput<'server'>,
	pass: object,
	occurrence: object
): ComponentExecutionInputRecord {
	const recipe = componentInputRecipe(admitted, serverComponentInputProvider);
	try {
		return withComponentDomainSnapshot(recipe.domain, () => {
			const props = acquireComponentPropInputs(
				recipe.props,
				true,
				recipe.contract.artifact.opaqueProps
			);
			const values =
				recipe.children.kind === 'reader' ? recipe.children.read() : recipe.children.values;
			const children = normalizeChildren(
				values.map((child) =>
					isCompiledPropOperand(child) ? readCompiledPropOperand(child) : child
				)
			);
			// An empty eager recipe delegates to the ordinary effective children property.
			// A reader, including its empty result, owns its explicit child selection.
			const explicit = recipe.children.kind === 'reader' || values.length !== 0;
			const child = explicit
				? children.length === 1
					? children[0]
					: children.length
						? children
						: undefined
				: Reflect.get(props, 'children', props);
			const constructionProps = componentChildrenView(props, child);
			return {
				pass,
				occurrence,
				admitted,
				inputs: { props: constructionProps, children },
				constructionProps,
				publicationProps: constructionProps
			};
		});
	} catch (error) {
		rethrowComponentInputFailure(error, serverComponentInputProvider);
	}
}
/** Returns the prepared construction view, without rereading original child demand. */
export function serverComponentProps(reference: ServerComponentReference): Record<string, unknown> {
	if (!reference.inputs)
		throw new Error('Server component inputs require an execution occurrence before acquisition');
	return reference.inputs.constructionProps as Record<string, unknown>;
}
/** Explicitly derives server construction/client publication views for a single accepted occurrence. */
export function deriveResumptionComponentInputs(
	original: ComponentExecutionInputRecord,
	constructionChildren: unknown,
	publicationChildren: unknown
): ComponentExecutionInputRecord {
	const view = (children: unknown) => componentChildrenView(original.inputs.props, children);
	return {
		...original,
		constructionProps: view(constructionChildren),
		publicationProps: view(publicationChildren)
	};
}
/** Resolves receipt-carried server facts without looking up a component type. */
export function receiptExecutionBlueprint(
	receipt: ServerComponentReference
): SsrComponentExecutionBlueprint {
	const contract = receiptExecutionContract(receipt);
	return {
		componentId: contract.artifact.id,
		contract
	};
}

/** Reads the immutable receipt-carried server contract without projecting a request object. */
export function receiptExecutionContract(
	receipt: ServerComponentReference
): ExactServerExecutableComponentContract {
	if (receipt.contract.artifact.target !== 'server')
		throw new TypeError('Server renderer received a client component receipt');
	return receipt.contract as ExactServerExecutableComponentContract;
}

/** Returns authored identity inputs needed by marker publication. */
export function serverComponentReferenceIdentity(reference: ServerComponentReference): {
	readonly componentId: string;
	readonly key?: string;
} {
	return { componentId: reference.contract.artifact.id, key: reference.key };
}

/** Claims one frame issued when compiler-generated parent render code created this component. */
export function takePreparedDirectScheduledSsrComponent(
	context: SsrContext,
	occurrence: object
):
	| {
			component: DirectScheduledSsrComponent | undefined;
			inputs: import('./server-component-reference.js').ComponentExecutionInputRecord;
	  }
	| Promise<{
			component: DirectScheduledSsrComponent | undefined;
			inputs: import('./server-component-reference.js').ComponentExecutionInputRecord;
	  }>
	| undefined {
	const record = context.preparedDirectScheduledComponents?.find(
		(candidate) => candidate.inputs.occurrence === occurrence
	);
	if (!record || record.consumed) return;
	(record as { consumed: boolean }).consumed = true;
	const result = record.component;
	return result instanceof Promise
		? result.then((component) => ({ component, inputs: record.inputs }))
		: { component: result, inputs: record.inputs };
}

/**
 * Acquires one actual occurrence, using the traversal's carried output frame by default.
 * A private writer with no carried record passes false to acquire fresh inputs independently
 * of a parent's pending siblings. Same-execution views retain their accepted record.
 */
export function prepareServerComponentOccurrence(
	context: SsrContext,
	reference: ServerComponentReference,
	claimCurrentFrame = true
): ServerComponentReference | Promise<ServerComponentReference> {
	if (reference.occurrenceClaimed) return reference;
	const pass = (context.componentInputPass ??= {});
	if (context.rootComponentInputs?.source === reference.source) {
		const root = context.rootComponentInputs;
		context.rootComponentInputs = undefined;
		return {
			...reference,
			props: root.inputs.inputs.props,
			children: root.inputs.inputs.children,
			inputs: root.inputs,
			occurrenceClaimed: true
		};
	}
	const frame = claimCurrentFrame ? context.componentInputFrame : undefined;
	const entry = frame?.entries[frame.cursor];
	const record = entry?.kind === 'component' ? entry.record : undefined;
	if (record && record.reference.source === reference.source) {
		frame!.cursor++;
		return claimPreparedServerComponentOccurrence(context, reference, record);
	}

	const inputs =
		reference.inputs?.pass === pass
			? reference.inputs
			: prepareServerComponentInputs(reference.admitted, pass, {});
	return {
		...reference,
		props: inputs.inputs.props,
		children: inputs.inputs.children,
		inputs,
		occurrenceClaimed: true
	};
}

/** Claims only the exact record carried by an actual output position, never a raw lookup. */
export function claimPreparedServerComponentOccurrence(
	context: SsrContext,
	reference: ServerComponentReference,
	record: import('./direct-component-contracts.js').PreparedDirectScheduledSsrComponent
): ServerComponentReference | Promise<ServerComponentReference> {
	if (record.reference.source !== reference.source || record.consumed)
		throw new TypeError('Invalid or already consumed SSR component input occurrence');
	const claimed = takePreparedDirectScheduledSsrComponent(context, record.inputs.occurrence);
	if (!claimed) throw new TypeError('SSR component input occurrence is no longer prepared');
	const finish = (result: Awaited<typeof claimed>): ServerComponentReference => ({
		...reference,
		props: result.inputs.inputs.props,
		children: result.inputs.inputs.children,
		inputs: result.inputs,
		preparedScheduled: result.component,
		occurrenceClaimed: true
	});
	return claimed instanceof Promise ? claimed.then(finish) : finish(claimed);
}

/** Keeps direct children captured while other accessors retain their prepared-props receiver. */
function componentChildrenView(
	props: Readonly<Record<string, unknown>>,
	children: unknown
): Record<string, unknown> {
	const descriptors = Object.getOwnPropertyDescriptors(props);
	const inherited: PropertyDescriptorMap = {};
	const seen = new Set(Reflect.ownKeys(descriptors));
	const prototype = Object.getPrototypeOf(props);
	// Only inherited accessors need a forwarding layer. They stay inherited, so ordinary
	// own-key enumeration and existing preparation do not gain extra accessor reads.
	for (
		let current = prototype;
		current && current !== Object.prototype;
		current = Object.getPrototypeOf(current)
	) {
		for (const key of Reflect.ownKeys(current)) {
			if (seen.has(key)) continue;
			seen.add(key);
			const descriptor = Object.getOwnPropertyDescriptor(current, key)!;
			if (key !== 'children' && (descriptor.get || descriptor.set))
				Object.defineProperty(inherited, key, {
					value: descriptor,
					configurable: true,
					enumerable: true,
					writable: true
				});
		}
	}
	for (const collection of [descriptors, inherited]) {
		for (const key of Reflect.ownKeys(collection)) {
			const descriptor = Reflect.get(collection, key) as PropertyDescriptor;
			if (key === 'children' || (!descriptor.get && !descriptor.set)) continue;
			const { get, set } = descriptor;
			Reflect.set(collection, key, {
				...descriptor,
				get: get ? () => Reflect.apply(get, props, []) : undefined,
				set: set
					? (value: unknown) => {
							Reflect.apply(set, props, [value]);
						}
					: undefined
			});
		}
	}
	descriptors.children = {
		value: children,
		enumerable: descriptors.children?.enumerable ?? true,
		configurable: true,
		writable: true
	};
	const receiverPrototype = Reflect.ownKeys(inherited).length
		? Object.create(prototype, inherited)
		: prototype;
	return Object.create(receiverPrototype, descriptors) as Record<string, unknown>;
}
