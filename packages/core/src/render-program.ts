import type { CompiledEnhancementNode } from './component/contracts.js';
import { currentComponentDomain } from './component/domain.js';
import {
	createOpaqueOperation,
	sharedOpaqueOperationStore
} from './component-abi/opaque-operation.js';

/** DOM namespace selected statically or from the program's physical attachment context. */
export type ExactRenderProgramNamespace = 'html' | 'svg' | 'mathml' | 'contextual';

/** Compact compiler-emitted DOM-node tuple: identity, tag, namespace. */
export type ExactRenderProgramNode = readonly [
	id: number,
	tag: string,
	namespace?: ExactRenderProgramNamespace
];

/** Compiler-owned server output containing serialized spans and deferred child ranges. */
export type ExactRenderProgramSsrOutput = Array<string | readonly unknown[] | object>;

/** Compiler-selected native SSR attribute: behavior, source property, serialized name. */
export type ExactRenderProgramSsrAttribute = readonly [
	kind: 0 | 1 | 2 | 3 | 4 | 5 | 6,
	property: string,
	attribute: string
];

/** Stateless server operations invoked directly by compiler-generated component wiring. */
export type ExactRenderProgramSsrOperations = Readonly<{
	/** Private sentinel returned when generated slot validation rejects malformed output. */
	unprepared: symbol;
	/** Allocates the typed invocation-local output owned by the generated writer. */
	output(): ExactRenderProgramSsrOutput;
	/** Reads and validates one compiler-known scalar before serialization mutates request state. */
	prepareText(invocation: ExactRenderProgramInvocation, index: number): unknown;
	/** Reads and validates one recursive child before serialization mutates request state. */
	prepareChild(invocation: ExactRenderProgramInvocation, index: number): unknown;
	/** Reads one compiler-proven native component before serialization mutates request state. */
	prepareComponent(invocation: ExactRenderProgramInvocation, index: number): unknown;
	/** Reads finalized props for a statically selected native component. */
	prepareComponentProps(invocation: ExactRenderProgramInvocation, index: number): unknown;
	/** Reads and validates one host value before serialization mutates request state. */
	prepareAttribute(invocation: ExactRenderProgramInvocation, index: number): unknown;
	/** Reserves the finite region's ownership identities and charges its request limit once. */
	begin(
		context: object,
		nodeCount: number,
		slotCount: number,
		staticCharacters: number,
		staticBytes?: number
	): void;
	/** Appends compiler-owned static markup already charged by the generated program. */
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
	/** Publishes one component through its compiler-owned parent slot boundary. */
	component(
		context: object,
		output: ExactRenderProgramSsrOutput,
		value: unknown,
		id: string,
		characters: number,
		markerless?: true
	): number;
	/** Issues a statically selected component without materializing a request-local reference. */
	directComponent(
		context: object,
		output: ExactRenderProgramSsrOutput,
		component: unknown,
		props: unknown,
		id: string,
		characters: number,
		markerless?: true
	): number;
	/** Serializes one prepared host value with ordinary SSR attribute semantics. */
	attribute(
		context: object,
		output: ExactRenderProgramSsrOutput,
		value: unknown,
		name: string,
		tag: string,
		characters: number
	): number;
	/** Serializes one prepared host value through a compiler-selected native attribute operation. */
	compiledAttribute(
		context: object,
		output: ExactRenderProgramSsrOutput,
		value: unknown,
		kind: ExactRenderProgramSsrAttribute[0],
		name: string,
		attributeName: string,
		tag: string,
		characters: number
	): number;
	/** Serializes one prepared host spread through ordinary SSR attribute policy. */
	attributes(
		context: object,
		output: ExactRenderProgramSsrOutput,
		value: unknown,
		tag: string,
		characters: number
	): number;
	/** Serializes the first intrinsic's complete authored props with active target contributions. */
	rootAttributes(
		context: object,
		output: ExactRenderProgramSsrOutput,
		value: unknown,
		tag: string,
		characters: number,
		staticAttributes?: readonly [
			html: string,
			propNames: readonly string[],
			dynamic?: readonly ExactRenderProgramSsrAttribute[]
		]
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

/** Compact host spread slot: kind and target node index. */
export type ExactRenderProgramSpreadSlot = readonly [kind: 'spread', node: number];

/** Compact structural child slot: kind and marker identity. */
export type ExactRenderProgramChildSlot = readonly [kind: 'child', id: string];

/** Compact native-component lifecycle slot: kind and marker identity. */
export type ExactRenderProgramComponentSlot = readonly [kind: 'component', id: string];

/** One compiler-owned slot. The reader remains invocation-local. */
export type ExactRenderProgramSlot =
	| ExactRenderProgramTextSlot
	| ExactRenderProgramPropertySlot
	| ExactRenderProgramSpreadSlot
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

/** Compact compiler-local claim operation consumed by the focused DOM claim executor. */
export type ExactRenderProgramClaimOperation = readonly [
	kind: number,
	first?: number | string | boolean,
	second?: number | string | boolean,
	third?: number | string | boolean,
	fourth?: string | boolean
];

/** Compact compiler-local binding operation consumed by the focused DOM binding executor. */
export type ExactRenderProgramBindingOperation = readonly [
	kind: number,
	first: number | readonly number[],
	second?:
		| number
		| boolean
		| readonly [source: 0 | 1, slot: number]
		| readonly (readonly [slot: number])[]
		| object,
	third?: number | boolean | object
];

/** Immutable component-local claim and binding data emitted instead of a generated binder closure. */
export type ExactRenderProgramWiring = readonly [
	root: readonly [
		tag: string,
		namespace: ExactRenderProgramNamespace,
		nodes: number,
		slots: number
	],
	claims: readonly ExactRenderProgramClaimOperation[],
	bindings: readonly ExactRenderProgramBindingOperation[]
];

type ExactRenderProgramBase = Readonly<{
	version: 6;
	id: string;
	namespace: ExactRenderProgramNamespace;
	/** Root intrinsic used to resolve a contextual namespace at physical attachment time. */
	attachmentTag?: string;
	/** Marks a direct binder that owns one grouped keyed-list render lane. */
	listBindings?: true;
	/** Compiler-keyed child slots, encoded as a compact bit mask or explicit indexes. */
	keyedChildren?: number | readonly number[];
	/** Static root attributes paired with their authored prop names for the server fast path. */
	ssrRootStatic?: readonly [
		html: string,
		propNames: readonly string[],
		dynamic?: readonly ExactRenderProgramSsrAttribute[]
	];
}>;

/** Closed client program whose executable lanes own topology instead of descriptor tables. */
export type ExactDirectRenderProgram = ExactRenderProgramBase &
	Readonly<{ template: string }> &
	(
		| Readonly<{
				directClaims: true;
				wire: ExactRenderProgramWiring;
				bind?: never;
				root?: never;
				work?: never;
		  }>
		| Readonly<{
				directClaims: true;
				bind?: never;
				wire?: never;
				root: readonly [tag: string, namespace?: ExactRenderProgramNamespace];
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
		wire?: never;
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
		wire?: never;
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
const PreparedServerRenderProgram = Symbol.for('@exactjs/prepared-server-render-program');
declare const exactRenderProgramReceiptBrand: unique symbol;
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
}>;

/** Opaque compiler-issued client operation for one finite render program. */
export type ExactRenderProgramReceipt = object & {
	readonly [exactRenderProgramReceiptBrand]: never;
};

/** Private client render-program inputs readable only by the DOM target. */
export type ExactRenderProgramReceiptData = Readonly<{
	invocation: ExactRenderProgramInvocation;
	enhancement?: CompiledEnhancementNode;
	domain?: import('./component/contracts.js').ComponentDomain;
}>;

const renderProgramReceipts =
	sharedOpaqueOperationStore<ExactRenderProgramReceiptData>('render-program');
const emptyServerRenderProgramReaders: ExactRenderProgramReaders = Object.freeze([]);
/** Dispatch key implemented by targets that execute compiler-closed render programs. */
export const exactRenderProgramOperation = Symbol.for('@exactjs/target-operation/render-program');

/** Target-owned render-program placement selected without caller-side shape inspection. */
export type ExactRenderProgramOperationTarget<Result = unknown> = Readonly<{
	[exactRenderProgramOperation](
		operation: ExactRenderProgramReceipt,
		data: ExactRenderProgramReceiptData
	): Result;
}>;

function executeRenderProgramOperation(this: object, target: object): unknown {
	const data = renderProgramReceipts.get(this);
	if (!data) throw new TypeError('Render-program operation lost its compiler-issued payload');
	return (target as ExactRenderProgramOperationTarget)[exactRenderProgramOperation](
		this as ExactRenderProgramReceipt,
		data
	);
}

/** Compiler-issued server invocation consumed directly by the compiler-closed SSR lane. */
export type ExactPreparedServerRenderProgram = ExactRenderProgramInvocation &
	Readonly<{
		[PreparedServerRenderProgram]: true;
		enhancement?: CompiledEnhancementNode;
		domain?: import('./component/contracts.js').ComponentDomain;
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
	if ((program as { version: number }).version !== 6)
		throw new TypeError('Unsupported eXact render-program ABI; expected version 6');
	return program as BrandedRenderProgram;
}

/** Joins invocation-local readers to one compiler-hoisted immutable descriptor. */
export function createPreparedRenderProgram(
	branded: BrandedRenderProgram,
	readers: ExactRenderProgramReaders,
	owner?: object,
	propertyWriter?: (group: number, apply: (name: string, value: unknown) => void) => void,
	enhancement?: CompiledEnhancementNode
): ExactRenderProgramReceipt {
	const domain = currentComponentDomain();
	const receipt = createOpaqueOperation<ExactRenderProgramReceipt>(executeRenderProgramOperation, {
		...(domain ? { domain } : {})
	});
	renderProgramReceipts.set(receipt, {
		invocation: {
			program: branded,
			readers,
			owner,
			...(propertyWriter ? { propertyWriter } : {})
		},
		...(enhancement ? { enhancement } : {}),
		...(domain ? { domain } : {})
	});
	return receipt;
}

/**
 * Captures compiler-known server slots while the enclosing component issuance scope is active.
 * This preserves eager sibling task execution without retaining lazy reader closures through the
 * later HTML traversal. Client and hydration artifacts continue to use lazy readers.
 */
export function createPreparedServerRenderProgram(
	branded: BrandedRenderProgram,
	eagerValues: readonly unknown[],
	enhancement?: CompiledEnhancementNode
): ExactPreparedServerRenderProgram {
	// The nominal wrapper prevents ordinary child normalization from flattening the values array.
	// Its empty client-reader table is shared because server slots always use eager values.
	const domain = enhancement ? currentComponentDomain() : undefined;
	const invocation = {
		[PreparedServerRenderProgram]: true,
		program: branded,
		readers: emptyServerRenderProgramReaders,
		eagerValues
	} as {
		readonly [key: symbol]: unknown;
		program: BrandedRenderProgram;
		readers: ExactRenderProgramReaders;
		eagerValues: readonly unknown[];
		enhancement?: CompiledEnhancementNode;
		domain?: import('./component/contracts.js').ComponentDomain;
	};
	if (enhancement) invocation.enhancement = enhancement;
	if (domain) invocation.domain = domain;
	return invocation as ExactPreparedServerRenderProgram;
}

/** Recognizes only the realm-stable compiler-issued direct server invocation shape. */
export function readPreparedServerRenderProgram(
	value: unknown
): ExactPreparedServerRenderProgram | undefined {
	return typeof value === 'object' && value !== null && PreparedServerRenderProgram in value
		? (value as ExactPreparedServerRenderProgram)
		: undefined;
}

/** Reads the invocation carried by a compiler-only render-program operation. */
export function readRenderProgram(value: unknown): ExactRenderProgramInvocation | undefined {
	const receipt = readRenderProgramReceipt(value);
	return receipt?.invocation;
}

/** Reads only compiler-issued client render-program operations. */
export function readRenderProgramReceipt(
	value: unknown
): ExactRenderProgramReceiptData | undefined {
	return typeof value === 'object' && value !== null ? renderProgramReceipts.get(value) : undefined;
}

/** Removes declaration metadata while preserving one compiler-owned render program invocation. */
export function withoutRenderProgramReceiptEnhancement(
	value: unknown
): ExactRenderProgramReceipt | undefined {
	const data = readRenderProgramReceipt(value);
	if (!data) return undefined;
	if (!data.enhancement) return value as ExactRenderProgramReceipt;
	const receipt = createOpaqueOperation<ExactRenderProgramReceipt>(
		executeRenderProgramOperation,
		data
	);
	const { enhancement: _enhancement, ...plain } = data;
	renderProgramReceipts.set(receipt, plain);
	return receipt;
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
