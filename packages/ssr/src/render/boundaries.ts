import { isFiniteClientBoundary, type VNode } from '@exactjs/core';
import {
	exactComponentIdentity,
	readPreparedExactCompiledComponentContract
} from '@exactjs/core/framework/component-contracts';
import { isReactive, isReactiveValue, peek, unwrap } from '@exactjs/reactive';
import { escapeAttr } from '../html.js';
import { jsonUnsafePath, serializeHydrationPayload } from '../hydration.js';
import { markerId, markerPair } from '../markup.js';
import type {
	AnyComponentInstance,
	RenderToDocumentStreamOptions,
	RenderToStringOptions,
	SsrContext
} from '../types.js';
import { renderChildrenAsync } from './async-tree.js';
import { publishClientBoundary } from './client-boundary-publication.js';
import { componentName } from './component-vnode.js';
import { renderChildren } from './sync-tree.js';

/** Transforms server boundary into its required representation. */
export function renderServerBoundary(context: SsrContext, vnode: VNode): string {
	const id = String(unwrap(vnode.props.id) ?? '');
	const name = String(unwrap(vnode.props.name) ?? '');
	const hydration = clientBoundaryHydration(vnode);
	const props = clientBoundaryProps(context, vnode);
	const finite = isFiniteClientBoundary(vnode);
	const unsafePath = jsonUnsafePath(props);
	if (unsafePath) {
		throw new Error(clientBoundarySerializationMessage(name, id, unsafePath));
	}
	const fallback = clientBoundaryHydrationFallback(vnode);
	const children = fallback
		? renderChildren(context, [fallback], undefined)
		: renderServerBoundaryChildren(context, vnode, undefined);
	// Client boundary props are serialized into an attribute, while children are
	// represented as server slots so the client bundle does not need server-only code.
	const html = publishClientBoundary(context, name, id, props, hydration, finite, children);
	return markerPair(context, markerId(context, 'client-boundary', name, id), () => html);
}

/** Wraps one SSR-rendered resumable component in its eager client activation boundary. */
export function renderResumableComponentBoundary(
	context: SsrContext,
	vnode: VNode,
	id: string,
	html: string,
	props: Record<string, unknown>
): string {
	if (typeof vnode.type !== 'function') return markerPair(context, id, () => html);
	const contract = readPreparedExactCompiledComponentContract(vnode.type);
	if (!contract.resumption || !contract.continuations.length)
		return markerPair(context, id, () => html);
	const name =
		contract.implementations.find((implementation) => implementation.role === 'root')?.name ??
		componentName(vnode.type);
	const snapshot = peek(() => snapshotResumptionProps(props));
	const unsafePath = jsonUnsafePath(snapshot);
	if (unsafePath) throw new Error(clientBoundarySerializationMessage(name, id, unsafePath));
	const payload = serializeHydrationPayload({ props: snapshot });
	const boundary = `<div data-exact-client-boundary="${escapeAttr(id)}" data-exact-client-name="${escapeAttr(name)}" data-exact-client-props="${escapeAttr(payload)}" data-exact-client-resumption="true">${html}</div>`;
	return markerPair(context, markerId(context, 'client-boundary', name, id), () => boundary);
}

/** Detaches resumable boundary props from reactive proxies without invoking accessors. */
function snapshotResumptionProps(
	value: Record<string, unknown>,
	seen = new WeakMap<object, unknown>()
): Record<string, unknown> {
	return snapshotResumptionValue(value, seen) as Record<string, unknown>;
}

function snapshotResumptionValue(value: unknown, seen: WeakMap<object, unknown>): unknown {
	return snapshotResumptionValueWithPolicy(value, seen, true);
}

function snapshotResumptionValueWithPolicy(
	value: unknown,
	seen: WeakMap<object, unknown>,
	evaluateReactiveValues: boolean
): unknown {
	// Authored activation props must resolve to the value the component
	// consumed. Children remain a server-owned graph and must never be
	// traversed by evaluating their reactive VNode cells.
	if (isReactiveValue(value)) {
		if (!evaluateReactiveValues) return value;
		value = unwrap(value);
	}
	const raw = isReactive(value) ? unwrap(value) : value;
	if (!raw || typeof raw !== 'object') return raw;
	if (!Array.isArray(raw) && Object.getPrototypeOf(raw) !== Object.prototype) return raw;
	const previous = seen.get(raw);
	if (previous) return previous;
	const output: unknown[] | Record<string, unknown> = Array.isArray(raw) ? [] : {};
	seen.set(raw, output);
	for (const key of Object.keys(raw)) {
		const descriptor = Object.getOwnPropertyDescriptor(raw, key);
		if (!descriptor) continue;
		if (!('value' in descriptor)) {
			Object.defineProperty(output, key, {
				configurable: true,
				enumerable: true,
				get: descriptor.get
			});
			continue;
		}
		Object.defineProperty(output, key, {
			configurable: true,
			enumerable: true,
			writable: true,
			value: snapshotResumptionValueWithPolicy(
				descriptor.value,
				seen,
				evaluateReactiveValues && key !== 'children'
			)
		});
	}
	return output;
}

/** Transforms server boundary async into its required representation. */
export async function renderServerBoundaryAsync(
	context: SsrContext,
	vnode: VNode,
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions
): Promise<string> {
	const id = String(unwrap(vnode.props.id) ?? '');
	const name = String(unwrap(vnode.props.name) ?? '');
	const hydration = clientBoundaryHydration(vnode);
	const props = clientBoundaryProps(context, vnode);
	const finite = isFiniteClientBoundary(vnode);
	const unsafePath = jsonUnsafePath(props);
	if (unsafePath) {
		throw new Error(clientBoundarySerializationMessage(name, id, unsafePath));
	}
	const fallback = clientBoundaryHydrationFallback(vnode);
	const slots = serverBoundarySlotReferences(vnode);
	const children = fallback
		? await renderChildrenAsync(context, [fallback], parent, options)
		: slots
			? await boundedServerRangeChildrenAsync(context, vnode, slots, parent, options)
			: vnode.children.length
				? `<span data-exact-server-slot="${escapeAttr(serverSlotId(id))}" style="display: contents;">${await renderChildrenAsync(context, vnode.children, parent, options)}</span>`
				: '';
	const html = publishClientBoundary(context, name, id, props, hydration, finite, children);
	return markerPair(context, markerId(context, 'client-boundary', name, id), () => html);
}

/** Performs the client boundary props domain operation. */
export function clientBoundaryProps(context: SsrContext, vnode: VNode): Record<string, unknown> {
	const id = String(unwrap(vnode.props.id) ?? '');
	const rawProps = unwrap(vnode.props.props) ?? {};
	const props =
		rawProps && typeof rawProps === 'object' && !Array.isArray(rawProps)
			? { ...(rawProps as Record<string, unknown>) }
			: rawProps;
	if (props && typeof props === 'object' && !Array.isArray(props)) {
		delete (props as Record<string, unknown>).__exactHydration;
		delete (props as Record<string, unknown>).__exactHydrationFallback;
		delete (props as Record<string, unknown>).__exactServerSlots;
	}
	const slots = serverBoundarySlotReferences(vnode);
	for (const slot of slots ?? []) {
		if (slot.buildKey && context.buildKey && slot.buildKey !== context.buildKey)
			throw new Error('Client boundary partition build does not match the SSR build');
	}
	if (
		vnode.children.length &&
		props &&
		typeof props === 'object' &&
		!Array.isArray(props) &&
		!('children' in props)
	) {
		const children = slots?.map((slot) => serverSlotPayload(slot, context));
		(props as Record<string, unknown>).children = children
			? children.length === 1
				? children[0]
				: children
			: serverSlotPayload({ id: serverSlotId(id) }, context);
	}
	return props as Record<string, unknown>;
}

/** Reads compiler-owned interaction hydration metadata without exposing it as component props. */
export function clientBoundaryHydration(vnode: VNode): 'interaction' | undefined {
	const props = unwrap(vnode.props.props);
	if (!props || typeof props !== 'object' || Array.isArray(props)) return undefined;
	return (props as Record<string, unknown>).__exactHydration === 'interaction'
		? 'interaction'
		: undefined;
}

/** Reads the inert server-rendered VNode used by an interaction-activated client island. */
export function clientBoundaryHydrationFallback(vnode: VNode): VNode | undefined {
	const props = unwrap(vnode.props.props);
	if (!props || typeof props !== 'object' || Array.isArray(props)) return undefined;
	const fallback = (props as Record<string, unknown>).__exactHydrationFallback;
	return fallback && typeof fallback === 'object' && 'type' in fallback
		? (fallback as VNode)
		: undefined;
}

/** Performs the client boundary serialization message domain operation. */
export function clientBoundarySerializationMessage(
	name: string,
	id: string,
	unsafePath: string
): string {
	const label = name || id;
	const location = name && id ? `${label} (${id})` : label;
	const generatedBucket = clientBoundaryGeneratedBucket(unsafePath);
	const generatedHint = generatedBucket ? ` in generated ${generatedBucket} payload` : '';
	return `Client boundary ${location} props must be JSON-serializable; non-serializable value at ${unsafePath}${generatedHint}`;
}

/** Performs the client boundary generated bucket domain operation. */
export function clientBoundaryGeneratedBucket(path: string): string | undefined {
	const match = /^\$\.(__exact[A-Za-z0-9_$]*)(?:\.|\[|$)/.exec(path);
	return match?.[1];
}

/** Transforms server boundary children into its required representation. */
export function renderServerBoundaryChildren(
	context: SsrContext,
	vnode: VNode,
	parent: AnyComponentInstance | undefined
): string {
	if (!vnode.children.length) return '';
	const slots = serverBoundarySlotReferences(vnode);
	if (slots) {
		return vnode.children
			.map(
				(child, index) =>
					`${serverSlotOpening(slots[index]!, context)}${renderChildren(context, [child], parent)}</span>`
			)
			.join('');
	}
	const slotId = serverSlotId(String(unwrap(vnode.props.id) ?? ''));
	return `<span data-exact-server-slot="${escapeAttr(slotId)}" style="display: contents;">${renderChildren(context, vnode.children, parent)}</span>`;
}

/** Reads and validates compiler-owned independent range identities. */
export function serverBoundarySlotIds(vnode: VNode): readonly string[] | undefined {
	return serverBoundarySlotReferences(vnode)?.map((slot) => slot.id);
}

/** Reads and validates compiler-owned independent range authority. */
export function serverBoundarySlotReferences(
	vnode: VNode
): readonly ExactServerSlotReference[] | undefined {
	const props = unwrap(vnode.props.props);
	if (!props || typeof props !== 'object' || Array.isArray(props)) return undefined;
	const value = (props as Record<string, unknown>).__exactServerSlots;
	if (value === undefined) return undefined;
	if (
		!Array.isArray(value) ||
		value.length !== vnode.children.length ||
		value.some((entry) => !serverSlotReference(entry))
	) {
		throw new Error('Client boundary partition slots must uniquely identify every server child');
	}
	const slots = value.map((entry) =>
		typeof entry === 'string'
			? ({ id: entry } satisfies ExactServerSlotReference)
			: {
					id: (entry as Record<string, unknown>).__exactServerSlot,
					planVersion: (entry as Record<string, unknown>).planVersion,
					buildKey: (entry as Record<string, unknown>).buildKey,
					planEdgeId: (entry as Record<string, unknown>).planEdgeId,
					ownerComponentId: (entry as Record<string, unknown>).ownerComponentId,
					discriminator: (entry as Record<string, unknown>).discriminator,
					generation: (entry as Record<string, unknown>).generation
				}
	) as ExactServerSlotReference[];
	if (new Set(slots.map((slot) => slot.id)).size !== slots.length)
		throw new Error('Client boundary partition slots must uniquely identify every server child');
	return slots;
}

async function boundedServerRangeChildrenAsync(
	context: SsrContext,
	vnode: VNode,
	slots: readonly ExactServerSlotReference[],
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions
): Promise<string> {
	const ranges = await Promise.all(
		vnode.children.map(
			async (child, index) =>
				`${serverSlotOpening(slots[index]!, context)}${await renderChildrenAsync(context, [child], parent, options)}</span>`
		)
	);
	return ranges.join('');
}

/** Performs the server slot id domain operation. */
export function serverSlotId(boundaryId: string): string {
	return `${boundaryId}:children`;
}

/** Performs the server slot payload domain operation. */
export function serverSlotPayload(
	slot: ExactServerSlotReference,
	context: Pick<SsrContext, 'executionRoot'>
): Record<string, unknown> {
	return slot.planVersion === undefined
		? { __exactServerSlot: slot.id }
		: {
				__exactServerSlot: slot.id,
				planVersion: slot.planVersion,
				buildKey: slot.buildKey,
				executionRoot: context.executionRoot,
				planEdgeId: slot.planEdgeId,
				ownerComponentId: slot.ownerComponentId,
				discriminator: slot.discriminator,
				generation: slot.generation
			};
}

/** Static authority attached to one compiler-planned server slot. */
export type ExactServerSlotReference = Readonly<{
	id: string;
	planVersion?: number;
	buildKey?: string;
	planEdgeId?: string;
	ownerComponentId?: string;
	discriminator?:
		| Readonly<{ kind: 'single' }>
		| Readonly<{ kind: 'branch'; branch: string }>
		| Readonly<{ kind: 'keyed'; list: string; keyToken: string }>;
	generation?: number;
}>;

/** Reads one standalone compiler-emitted server-range vnode. */
export function serverSlotVNodeReference(vnode: VNode): ExactServerSlotReference {
	const props = unwrap(vnode.props) as Record<string, unknown>;
	const id = props.id;
	const candidate = {
		__exactServerSlot: id,
		planVersion: props.planVersion,
		buildKey: props.buildKey,
		planEdgeId: props.planEdgeId,
		ownerComponentId: props.ownerComponentId,
		discriminator: props.discriminator,
		generation: props.generation
	};
	if (!serverSlotReference(candidate))
		throw new Error('Compiler-planned server range has malformed runtime authority');
	return {
		id: id as string,
		planVersion: props.planVersion as number,
		buildKey: props.buildKey as string,
		planEdgeId: props.planEdgeId as string,
		ownerComponentId: props.ownerComponentId as string,
		discriminator: props.discriminator as NonNullable<ExactServerSlotReference['discriminator']>,
		generation: props.generation as number
	};
}

function serverSlotReference(value: unknown): value is ExactServerSlotReference | string {
	if (typeof value === 'string') return value.length > 0;
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const slot = value as Record<string, unknown>;
	return (
		typeof slot.__exactServerSlot === 'string' &&
		slot.__exactServerSlot.length > 0 &&
		slot.planVersion === 1 &&
		typeof slot.buildKey === 'string' &&
		slot.buildKey.length > 0 &&
		(slot.planEdgeId === slot.__exactServerSlot ||
			(validServerSlotDiscriminator(slot.discriminator) &&
				(slot.discriminator as Record<string, unknown>).kind === 'keyed' &&
				slot.__exactServerSlot.startsWith(`${slot.planEdgeId}:key:`))) &&
		typeof slot.ownerComponentId === 'string' &&
		slot.ownerComponentId.length > 0 &&
		validServerSlotDiscriminator(slot.discriminator) &&
		Number.isSafeInteger(slot.generation) &&
		(slot.generation as number) > 0
	);
}

function validServerSlotDiscriminator(value: unknown): boolean {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const discriminator = value as Record<string, unknown>;
	if (discriminator.kind === 'single') return Object.keys(discriminator).length === 1;
	if (discriminator.kind === 'branch')
		return (
			Object.keys(discriminator).length === 2 &&
			typeof discriminator.branch === 'string' &&
			!!discriminator.branch
		);
	return (
		discriminator.kind === 'keyed' &&
		Object.keys(discriminator).length === 3 &&
		typeof discriminator.list === 'string' &&
		!!discriminator.list &&
		typeof discriminator.keyToken === 'string' &&
		!!discriminator.keyToken
	);
}

/** Emits the compact runtime authority tuple on one retained server range. */
export function serverSlotOpening(
	slot: ExactServerSlotReference,
	context: Pick<SsrContext, 'executionRoot' | 'buildKey'>
): string {
	if (slot.buildKey && context.buildKey && slot.buildKey !== context.buildKey)
		throw new Error('Client boundary partition slot build does not match the SSR build');
	const discriminator = slot.discriminator;
	const authority =
		slot.planVersion === undefined
			? ''
			: ` data-exact-partition-version="${slot.planVersion}" data-exact-partition-build="${escapeAttr(slot.buildKey!)}" data-exact-partition-root="${escapeAttr(context.executionRoot)}" data-exact-partition-edge="${escapeAttr(slot.planEdgeId!)}" data-exact-partition-owner="${escapeAttr(slot.ownerComponentId!)}" data-exact-partition-discriminator="${discriminator!.kind}"${discriminator?.kind === 'branch' ? ` data-exact-partition-branch="${escapeAttr(discriminator.branch)}"` : ''}${discriminator?.kind === 'keyed' ? ` data-exact-partition-list="${escapeAttr(discriminator.list)}" data-exact-partition-key="${escapeAttr(discriminator.keyToken)}"` : ''} data-exact-partition-generation="${slot.generation}"`;
	return `<span data-exact-server-slot="${escapeAttr(slot.id)}"${authority} style="display: contents;">`;
}

/** Reports whether emit document hydration. */
export function shouldEmitDocumentHydration(options: RenderToDocumentStreamOptions): boolean {
	if (options.hydration === false) return false;
	if (options.hydration === true) return true;
	return (
		options.endpoint !== undefined ||
		options.endpoints !== undefined ||
		options.state !== undefined ||
		options.continuations !== undefined ||
		options.publicContexts !== undefined ||
		options.executionRoot !== undefined ||
		options.binding !== undefined ||
		options.buildKey !== undefined ||
		options.scriptId !== undefined ||
		options.nonce !== undefined
	);
}

/** Returns the stable protocol identity embedded in a hydratable component marker. */
export function componentMarkerIdentity(type: VNode['type']): string {
	return typeof type === 'function' ? exactComponentIdentity(type) : String(type);
}

/** Allocates one component marker from its compiler identity and authored key. */
export function componentMarkerId(context: SsrContext, vnode: VNode): string {
	return markerId(context, 'component', componentMarkerIdentity(vnode.type), vnode.key);
}
