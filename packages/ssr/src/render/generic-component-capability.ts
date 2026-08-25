import type { AnyComponentInstance, VNode } from '@exactjs/core';
import type { DirectSsrComponentContent } from './direct-component.js';
import type { SsrContext } from '../types.js';
import type { SsrRenderOptions } from './entrypoints.js';
import type { SsrComponentExecutionBlueprint } from './root-execution-cache.js';
import type { SyncComponentOperations } from './sync-component.js';
import { ssrCapabilities } from './capability-registry.js';

/** Inputs needed to execute one durable component through asynchronous generic SSR. */
export type GenericSsrComponentInput = Readonly<{
	context: SsrContext;
	vnode: VNode;
	parent: AnyComponentInstance | undefined;
	options: SsrRenderOptions;
	blueprint: SsrComponentExecutionBlueprint;
	rawProps: Record<string, unknown>;
	componentId: string;
	enhancement: boolean;
	documentProbe: boolean;
	hasComponentAncestor: boolean;
}>;

type GenericSsrComponentRenderer = (input: GenericSsrComponentInput) => Promise<string>;

/** Inputs needed to execute one durable component through synchronous generic SSR. */
export type GenericSyncSsrComponentInput = Readonly<{
	context: SsrContext;
	vnode: VNode;
	parent: AnyComponentInstance | undefined;
	operations: SyncComponentOperations;
	blueprint: SsrComponentExecutionBlueprint;
	rawProps: Record<string, unknown>;
	onInstance(instance: AnyComponentInstance): void;
}>;

/** Stabilized synchronous generic output returned to the shared boundary writer. */
export type GenericSyncSsrComponentResult = Readonly<{
	html: string;
	props: Record<string, unknown>;
}>;

type GenericSyncSsrComponentRenderer = (
	input: GenericSyncSsrComponentInput
) => GenericSyncSsrComponentResult;

/** Inputs needed to materialize one durable component for synchronous chunk streaming. */
export type GenericSyncSsrChunkInput = Readonly<{
	context: SsrContext;
	vnode: VNode;
	parent: AnyComponentInstance | undefined;
	blueprint: SsrComponentExecutionBlueprint;
	rawProps: Record<string, unknown>;
}>;

/** Durable instance and rendered children consumed by synchronous chunk streaming. */
export type GenericSyncSsrChunkResult = Readonly<{
	instance: AnyComponentInstance;
	content: DirectSsrComponentContent;
	props: Record<string, unknown>;
}>;

type GenericSyncSsrChunkRenderer = (input: GenericSyncSsrChunkInput) => GenericSyncSsrChunkResult;

const asyncCapability = 'generic-component-async';
const syncCapability = 'generic-component-sync';
const syncChunkCapability = 'generic-component-sync-chunks';

/** Installs the generic component fallback selected by a compiler-produced server artifact. */
export function registerGenericSsrComponentRenderer(next: GenericSsrComponentRenderer): void {
	ssrCapabilities[asyncCapability] = next;
}

/** Installs the synchronous generic fallback selected by a compiler-produced server artifact. */
export function registerGenericSyncSsrComponentRenderer(
	next: GenericSyncSsrComponentRenderer
): void {
	ssrCapabilities[syncCapability] = next;
}

/** Installs the streaming synchronous generic fallback for compiler-selected artifacts. */
export function registerGenericSyncSsrChunkRenderer(next: GenericSyncSsrChunkRenderer): void {
	ssrCapabilities[syncChunkCapability] = next;
}

/** Invokes the generic lane only when a reachable artifact explicitly installed it. */
export function renderGenericSsrComponent(input: GenericSsrComponentInput): Promise<string> {
	const renderer = ssrCapabilities[asyncCapability] as GenericSsrComponentRenderer | undefined;
	if (!renderer)
		throw new TypeError(
			'Generic SSR component execution requires its compiler-selected runtime capability'
		);
	return renderer(input);
}

/** Invokes synchronous generic execution only when a reachable artifact explicitly installed it. */
export function renderGenericSyncSsrComponent(
	input: GenericSyncSsrComponentInput
): GenericSyncSsrComponentResult {
	const syncRenderer = ssrCapabilities[syncCapability] as
		| GenericSyncSsrComponentRenderer
		| undefined;
	if (!syncRenderer)
		throw new TypeError(
			'Generic synchronous SSR component execution requires its compiler-selected runtime capability'
		);
	return syncRenderer(input);
}

/** Materializes a generic component for the synchronous chunk traversal. */
export function renderGenericSyncSsrComponentChunks(
	input: GenericSyncSsrChunkInput
): GenericSyncSsrChunkResult {
	const syncChunkRenderer = ssrCapabilities[syncChunkCapability] as
		| GenericSyncSsrChunkRenderer
		| undefined;
	if (!syncChunkRenderer)
		throw new TypeError(
			'Generic streaming SSR component execution requires its compiler-selected runtime capability'
		);
	return syncChunkRenderer(input);
}
