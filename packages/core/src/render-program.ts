import type { VNode } from './component/contracts.js';
import { currentComponentDomain } from './component/domain.js';
import { RenderProgram } from './symbols.js';

const preparedRenderPrograms = new WeakSet<ExactRenderProgram>();

/** One immutable compiler-owned DOM node in a render program. */
export type ExactRenderProgramNode = Readonly<{
	id: string;
	path: readonly number[];
	hydrationPath?: readonly number[];
	tag?: string;
	/** Omitted when the node inherits its containing program's namespace. */
	namespace?: 'html' | 'svg' | 'mathml';
}>;

/** One server-only marker or slot operation between immutable program strings. */
export type ExactRenderProgramSsrOperation = Readonly<{
	kind: 'node-open' | 'node-close' | 'slot';
	index: number;
}>;

/** One compiler-owned scalar slot. The reader remains invocation-local. */
export type ExactRenderProgramSlot = Readonly<{
	/** Required only for text slots whose SSR marker is claimed by identity. */
	id?: string;
	kind: 'text' | 'property' | 'attribute' | 'style' | 'class' | 'url';
	path: readonly number[];
	hydrationPath?: readonly number[];
	name?: string;
}>;

/** Immutable shape emitted by the compiler for a finite intrinsic region. */
export type ExactRenderProgram = Readonly<{
	version: 1;
	id: string;
	namespace: 'html' | 'svg' | 'mathml';
	template: string;
	/** Server/universal interpolation strings; closed client artifacts omit this SSR-only table. */
	parts?: readonly string[];
	slots: readonly ExactRenderProgramSlot[];
	nodes: readonly ExactRenderProgramNode[];
	ssrParts?: readonly string[];
	ssrOperations?: readonly ExactRenderProgramSsrOperation[];
}>;

type BrandedRenderProgram = ExactRenderProgram & { readonly __exactPreparedRenderProgram: never };

/** Per-instance readers and generic fallback joined to one cached compiled program. */
export type ExactRenderProgramInvocation = Readonly<{
	program: BrandedRenderProgram;
	readers: readonly (() => unknown)[] | ((index: number) => unknown);
	/** Generic recovery retained only when the artifact can execute outside the closed client path. */
	fallback?: () => VNode;
}>;

const programs = new Map<string, BrandedRenderProgram>();
const maximumCachedPrograms = 2_048;

/** Clears compiler artifacts retained by an obsolete build/HMR generation. */
export function clearCompiledRenderPrograms(): void {
	programs.clear();
}

/** Returns cache occupancy for framework diagnostics and bounded-cache tests. */
export function compiledRenderProgramCacheSize(): number {
	return programs.size;
}

/**
 * Creates a branded compiled render result. The revision-specific cache key
 * constructs the immutable descriptor once without retaining stale HMR output.
 * This helper is compiler-facing; renderers reject authored objects because
 * the brand is module-private.
 */
export function createCompiledRenderProgram(
	cacheKey: string,
	createProgram: () => ExactRenderProgram,
	readers: readonly (() => unknown)[] | ((index: number) => unknown),
	fallback?: () => VNode
): VNode {
	let prepared = programs.get(cacheKey);
	if (!prepared) {
		prepared = prepareCompiledRenderProgram(createProgram());
		programs.set(cacheKey, prepared);
		if (programs.size > maximumCachedPrograms) programs.delete(programs.keys().next().value!);
	}
	return createPreparedRenderProgram(prepared, readers, fallback);
}

/**
 * Registers one compiler-emitted descriptor without copying its trusted executable data.
 *
 * The module-private weak identity is the renderer's authority boundary. Descriptors are emitted
 * as module-local constants by the compiler, so recursively cloning and freezing their nested
 * tables during browser startup adds allocation and traversal without validating an external
 * input. Network and plugin payloads remain subject to their own boundary validation before they
 * can reach this compiler-only operation.
 */
export function prepareCompiledRenderProgram(program: ExactRenderProgram): BrandedRenderProgram {
	preparedRenderPrograms.add(program);
	return program as BrandedRenderProgram;
}

/** Joins invocation-local readers to one compiler-hoisted immutable descriptor. */
export function createPreparedRenderProgram(
	branded: BrandedRenderProgram,
	readers: readonly (() => unknown)[] | ((index: number) => unknown),
	fallback?: () => VNode
): VNode {
	const domain = currentComponentDomain();
	return {
		type: RenderProgram,
		props: { program: branded, readers, ...(fallback ? { fallback } : {}) },
		children: [],
		...(domain ? { domain } : {})
	};
}

/** Reads a compiler-owned invocation, failing closed for authored lookalikes. */
export function readRenderProgram(vnode: VNode): ExactRenderProgramInvocation | undefined {
	if (vnode.type !== RenderProgram) return undefined;
	const invocation = vnode.props as Partial<ExactRenderProgramInvocation>;
	if (
		!invocation.program ||
		!preparedRenderPrograms.has(invocation.program) ||
		invocation.program.version !== 1 ||
		(!Array.isArray(invocation.readers) && typeof invocation.readers !== 'function') ||
		(invocation.fallback !== undefined && typeof invocation.fallback !== 'function') ||
		(Array.isArray(invocation.readers) &&
			invocation.readers.length !== invocation.program.slots.length)
	)
		return undefined;
	return invocation as ExactRenderProgramInvocation;
}

/** Evaluates one invocation-local slot through either legacy readers or a combined dispatcher. */
export function readRenderProgramSlot(
	invocation: ExactRenderProgramInvocation,
	index: number
): unknown {
	return typeof invocation.readers === 'function'
		? invocation.readers(index)
		: invocation.readers[index]!();
}

/** Materializes the region-local generic path after an executor rejection. */
export function renderProgramFallback(vnode: VNode): VNode | undefined {
	const invocation = readRenderProgram(vnode);
	if (!invocation) throw new Error('Invalid compiler-owned render program');
	return invocation.fallback?.();
}
