import type { VNode } from './component/contracts.js';
import { currentComponentDomain } from './component/domain.js';
import { RenderProgram } from './symbols.js';

const renderProgramBrand = Symbol('exact.render-program.brand');

/** One immutable compiler-owned DOM node in a render program. */
export type ExactRenderProgramNode = Readonly<{
	id: string;
	path: readonly number[];
	tag?: string;
	namespace: 'html' | 'svg' | 'mathml';
}>;

/** One compiler-owned scalar slot. The reader remains invocation-local. */
export type ExactRenderProgramSlot = Readonly<{
	id: string;
	kind: 'text' | 'property' | 'attribute' | 'style' | 'class' | 'url';
	path: readonly number[];
	name?: string;
}>;

/** Immutable shape emitted by the compiler for a finite intrinsic region. */
export type ExactRenderProgram = Readonly<{
	version: 1;
	id: string;
	namespace: 'html' | 'svg' | 'mathml';
	template: string;
	parts: readonly string[];
	slots: readonly ExactRenderProgramSlot[];
	nodes: readonly ExactRenderProgramNode[];
}>;

type BrandedRenderProgram = ExactRenderProgram & { readonly [renderProgramBrand]: true };

/** Per-instance readers and generic fallback joined to one cached compiled program. */
export type ExactRenderProgramInvocation = Readonly<{
	program: BrandedRenderProgram;
	readers: readonly (() => unknown)[];
	fallback: () => VNode;
}>;

const programs = new Map<string, BrandedRenderProgram>();

/**
 * Creates a branded compiled render result. The revision-specific cache key
 * constructs the immutable descriptor once without retaining stale HMR output.
 * This helper is compiler-facing; renderers reject authored objects because
 * the brand is module-private.
 */
export function createCompiledRenderProgram(
	cacheKey: string,
	createProgram: () => ExactRenderProgram,
	readers: readonly (() => unknown)[],
	fallback: () => VNode
): VNode {
	let branded = programs.get(cacheKey);
	if (!branded) {
		const program = createProgram();
		branded = Object.freeze({
			...program,
			parts: Object.freeze([...program.parts]),
			slots: Object.freeze(
				program.slots.map((slot) => Object.freeze({ ...slot, path: Object.freeze([...slot.path]) }))
			),
			nodes: Object.freeze(
				program.nodes.map((node) => Object.freeze({ ...node, path: Object.freeze([...node.path]) }))
			),
			[renderProgramBrand]: true as const
		});
		programs.set(cacheKey, branded);
	}
	const domain = currentComponentDomain();
	return {
		type: RenderProgram,
		props: { program: branded, readers, fallback },
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
		invocation.program[renderProgramBrand] !== true ||
		invocation.program.version !== 1 ||
		!Array.isArray(invocation.readers) ||
		typeof invocation.fallback !== 'function' ||
		invocation.readers.length !== invocation.program.slots.length
	)
		return undefined;
	return invocation as ExactRenderProgramInvocation;
}

/** Materializes the region-local generic path after an executor rejection. */
export function renderProgramFallback(vnode: VNode): VNode {
	const invocation = readRenderProgram(vnode);
	if (!invocation) throw new Error('Invalid compiler-owned render program');
	return invocation.fallback();
}
