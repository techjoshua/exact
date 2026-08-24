import type { VNode } from './component/contracts.js';
import { currentComponentDomain } from './component/domain.js';
import { RenderProgram } from './symbols.js';

/** Compact compiler-emitted DOM-node tuple: identity, tag, namespace. */
export type ExactRenderProgramNode = readonly [
	id: string | number,
	tag: string,
	namespace?: 'html' | 'svg' | 'mathml'
];

/** Compiler-owned server output containing serialized spans and deferred child ranges. */
export type ExactRenderProgramSsrOutput = Array<string | readonly unknown[]>;

/** Stateless server operations invoked directly by compiler-generated component wiring. */
export type ExactRenderProgramSsrOperations = Readonly<{
	/** Private sentinel returned when a slot requires the explicit generic fallback. */
	unprepared: symbol;
	/** Allocates the typed invocation-local output owned by the generated writer. */
	output(): ExactRenderProgramSsrOutput;
	/** Reads and validates one compiler-known scalar before serialization mutates request state. */
	prepareText(invocation: ExactRenderProgramInvocation, index: number): unknown;
	/** Reads and validates one recursive child before serialization mutates request state. */
	prepareChild(invocation: ExactRenderProgramInvocation, index: number): unknown;
	/** Reads and validates one host value before serialization mutates request state. */
	prepareAttribute(invocation: ExactRenderProgramInvocation, index: number): unknown;
	/** Reserves the finite region's ownership identities and charges its request limit once. */
	begin(context: object, nodeCount: number, slotCount: number, staticCharacters: number): void;
	/** Appends compiler-owned static markup under the request output limit. */
	static(output: ExactRenderProgramSsrOutput, value: string): void;
	/** Writes one prepared escaped scalar and its delimiters when required. */
	text(
		context: object,
		output: ExactRenderProgramSsrOutput,
		value: unknown,
		id: string,
		characters: number,
		markerless?: true
	): number;
	/** Recursively renders one prepared structural or component child. */
	child(
		context: object,
		output: ExactRenderProgramSsrOutput,
		value: unknown,
		id: string,
		characters: number
	): number;
	/** Renders one compiler-keyed final-child range without serializing delimiters. */
	keyedChild(output: ExactRenderProgramSsrOutput, value: unknown): void;
	/** Serializes one prepared host value with ordinary SSR attribute semantics. */
	attribute(
		context: object,
		output: ExactRenderProgramSsrOutput,
		value: unknown,
		name: string,
		tag: string,
		characters: number
	): number;
}>;

/** Component-specific server execution emitted by the compiler. */
export type ExactRenderProgramSsrWriter = (
	operations: ExactRenderProgramSsrOperations,
	context: object,
	invocation: ExactRenderProgramInvocation
) => ExactRenderProgramSsrOutput | undefined;

/** Compact text slot: kind, fallback identity, template path, and marker-free SSR proof. */
export type ExactRenderProgramTextSlot = readonly [
	kind: 'text',
	id: string,
	path: readonly number[],
	/** The surrounding static markup prevents this value from merging with another text node. */
	markerlessSsr?: true
];

/** Compact property slot: kind, target node index, property name. */
export type ExactRenderProgramPropertySlot = readonly [
	kind: 'property' | 'attribute' | 'style' | 'class' | 'url',
	node: number,
	name: string
];

/** Compact structural child slot: kind and marker identity. */
export type ExactRenderProgramChildSlot = readonly [kind: 'child', id: string];

/** Compact native-component lifecycle slot: kind and marker identity. */
export type ExactRenderProgramComponentSlot = readonly [kind: 'component', id: string];

/** One compiler-owned slot. The reader remains invocation-local. */
export type ExactRenderProgramSlot =
	| ExactRenderProgramTextSlot
	| ExactRenderProgramPropertySlot
	| ExactRenderProgramChildSlot
	| ExactRenderProgramComponentSlot;

/** Compiler-ordered reactive binding: one text slot or every property slot for one element. */
export type ExactRenderProgramBinding =
	| readonly ['text', slot: number]
	| readonly ['child', slot: number]
	| readonly ['component', slot: number]
	| readonly ['lists', slots: readonly number[]]
	| readonly ['properties', slots: readonly number[]];

/** Opaque DOM-owned binding context consumed only by compiler-emitted binding calls. */
export type ExactRenderProgramBindingTarget = object;

/** Direct client claim and binding topology emitted as executable compiler wiring. */
export type ExactRenderProgramBinder = (target: ExactRenderProgramBindingTarget) => void;

/** Component-specific dirty update wiring emitted for compiler-proven direct dependencies. */
export type ExactRenderProgramUpdater = (
	target: ExactRenderProgramBindingTarget,
	dirtyLow: number,
	dirtyHigh: number
) => void;

type ExactRenderProgramBase = Readonly<{
	version: 4;
	id: string;
	namespace: 'html' | 'svg' | 'mathml';
	/** Marks a direct binder that owns one grouped keyed-list render lane. */
	listBindings?: true;
	/** Compiler-keyed child slots, encoded as a compact bit mask or explicit indexes. */
	keyedChildren?: number | readonly number[];
	/** Applies only operations selected by compiler-assigned dirty bits. */
	update?: ExactRenderProgramUpdater;
}>;

/** Closed client program whose executable lanes own topology instead of descriptor tables. */
export type ExactDirectRenderProgram = ExactRenderProgramBase &
	Readonly<{ template: string }> &
	(
		| Readonly<{
				directClaims: true;
				bind: ExactRenderProgramBinder;
				root?: never;
				work?: never;
		  }>
		| Readonly<{
				directClaims: true;
				bind?: never;
				root: readonly [tag: string, namespace?: 'html' | 'svg' | 'mathml'];
				work: readonly [nodes: 1, slots: 0];
		  }>
	) &
	Readonly<{
		nodes?: never;
		slots?: never;
		bindings?: never;
		ssr?: ExactRenderProgramSsrWriter;
	}>;

/** Closed server program whose generated function owns serialization order and topology. */
export type ExactSsrRenderProgram = ExactRenderProgramBase &
	Readonly<{
		ssr: ExactRenderProgramSsrWriter;
		template?: never;
		nodes?: never;
		slots?: never;
		bindings?: never;
		bind?: never;
		directClaims?: never;
		root?: never;
		work?: never;
	}>;

/** Table-backed program retained for complete artifacts and explicit compatibility. */
export type ExactTableRenderProgram = ExactRenderProgramBase &
	Readonly<{
		template: string;
		slots: readonly ExactRenderProgramSlot[];
		/** Generic binding topology retained only by non-client and explicit fallback artifacts. */
		bindings?: readonly ExactRenderProgramBinding[];
		/** Direct browser-safe binding wiring emitted for compiled client artifacts. */
		bind?: ExactRenderProgramBinder;
		nodes: readonly ExactRenderProgramNode[];
		/** Optional generated server lane for an explicitly hybrid artifact. */
		ssr?: ExactRenderProgramSsrWriter;
		directClaims?: never;
		root?: never;
		work?: never;
	}>;

/** Immutable compiler output for one finite intrinsic region. */
export type ExactRenderProgram =
	| ExactDirectRenderProgram
	| ExactSsrRenderProgram
	| ExactTableRenderProgram;

/** Render programs that own a browser template and can execute through the DOM renderer. */
export type ExactDomRenderProgram = ExactDirectRenderProgram | ExactTableRenderProgram;

type BrandedRenderProgram = ExactRenderProgram & { readonly __exactPreparedRenderProgram: never };
type ExactRenderProgramReaders =
	| ReadonlyArray<(() => unknown) | undefined>
	| ((index: number) => unknown);

/** Per-instance readers and generic fallback joined to one cached compiled program. */
export type ExactRenderProgramInvocation = Readonly<{
	program: BrandedRenderProgram;
	readers: ExactRenderProgramReaders;
	/** Durable component instance whose compiler-generated update table owns this region. */
	owner?: object;
	/** Server-only values captured while compiler-issued child work can still start eagerly. */
	eagerValues?: readonly unknown[];
	/** Compiler-emitted direct property-group writers indexed by the binding descriptor. */
	propertyWriter?: (group: number, apply: (name: string, value: unknown) => void) => void;
	/** Generic recovery retained only when the artifact can execute outside the closed client path. */
	fallback?: () => VNode;
}>;

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
	if ((program as { version: number }).version !== 4)
		throw new TypeError('Unsupported eXact render-program ABI; expected version 4');
	return program as BrandedRenderProgram;
}

/** Joins invocation-local readers to one compiler-hoisted immutable descriptor. */
export function createPreparedRenderProgram(
	branded: BrandedRenderProgram,
	readers: ExactRenderProgramReaders,
	owner: object,
	fallback?: () => VNode,
	propertyWriter?: (group: number, apply: (name: string, value: unknown) => void) => void
): VNode {
	const domain = currentComponentDomain();
	return {
		type: RenderProgram,
		props: {
			program: branded,
			readers,
			owner,
			...(fallback ? { fallback } : {}),
			...(propertyWriter ? { propertyWriter } : {})
		},
		children: [],
		...(domain ? { domain } : {})
	};
}

/**
 * Captures compiler-known server slots while the enclosing component issuance scope is active.
 * This preserves eager sibling task execution without retaining lazy reader closures through the
 * later HTML traversal. Client and hydration artifacts continue to use lazy readers.
 */
export function createPreparedServerRenderProgram(
	branded: BrandedRenderProgram,
	readers: ExactRenderProgramReaders,
	slotCount: number,
	fallback?: () => VNode
): VNode {
	const eagerValues = new Array<unknown>(slotCount);
	for (let index = 0; index < slotCount; index++)
		eagerValues[index] = typeof readers === 'function' ? readers(index) : readers[index]?.();
	const domain = currentComponentDomain();
	return {
		type: RenderProgram,
		props: {
			program: branded,
			readers: [],
			eagerValues,
			...(fallback ? { fallback } : {})
		},
		children: [],
		...(domain ? { domain } : {})
	};
}

/** Reads the invocation carried by the compiler-only render-program VNode kind. */
export function readRenderProgram(vnode: VNode): ExactRenderProgramInvocation | undefined {
	if (vnode.type !== RenderProgram) return undefined;
	return vnode.props as ExactRenderProgramInvocation;
}

/** Evaluates one invocation-local slot through per-slot readers or a combined dispatcher. */
export function readRenderProgramSlot(
	invocation: ExactRenderProgramInvocation,
	index: number
): unknown {
	if (invocation.eagerValues) return invocation.eagerValues[index];
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
