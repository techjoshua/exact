import type {
	ExactCompiledComponentCapability,
	ExactCompiledComponentInputUpdateContract,
	ExactCompiledComponentUpdateContract
} from '../component-definition-contracts.js';
import type {
	AnyExactComponentCallable,
	ExactComponentReactiveAllocation
} from './executable-fields.js';
import type { CompiledComponentInstanceConstructor } from '../component/instance-construction.js';
import type { Child } from '../component/contracts.js';
import type { ExactValueSerializationSchema } from './value-serialization.js';

/** DOM protocol key used only by compiler-produced one-shot component output attachment. */
export const exactCompiledClientAttachment = Symbol.for(
	'@exactjs/compiled-client-component-attachment'
);

/** DOM protocol key used by a foreign renderer's fixed compiled island artifact. */
export const exactCompatibilityClientAttachment = Symbol.for(
	'@exactjs/compatibility-client-component-attachment'
);

/** DOM-owned attachment cursor for output already executed by a compiled client artifact. */
export type ExactCompiledClientAttachmentTarget = Readonly<{
	[exactCompiledClientAttachment](
		artifact: ExactClientComponentArtifact,
		instance: object,
		children: Child[],
		mode: ExactClientAttachMode
	): ExactClientMountedRange;
}>;

/** DOM-owned cursor that delegates a fixed compatibility artifact to its renderer owner. */
export type ExactCompatibilityClientAttachmentTarget = Readonly<{
	[exactCompatibilityClientAttachment](
		artifact: ExactClientComponentArtifact,
		instance: object,
		mode: ExactClientAttachMode
	): ExactClientMountedRange;
}>;

/** Selects fresh topology creation or same-build DOM adoption. */
export type ExactClientAttachMode = 'mount' | 'hydrate';

/** DOM-owned mounted range returned after a client artifact successfully attaches. */
export type ExactClientMountedRange = object;

/** Existing parent-owned values consumed directly by one allocation-free receiver receipt. */
export type ExactClientPropSource = Readonly<Record<string, unknown>>;

/** Complete executable ABI carried by one compiler-produced client component export. */
export type ExactClientComponentArtifact = Readonly<{
	version: 1;
	target: 'client';
	id: string;
	template?: object;
	construct: CompiledComponentInstanceConstructor;
	attach: AnyExactComponentCallable;
	receive: AnyExactComponentCallable;
	dispose: AnyExactComponentCallable;
	/** Setup implementation retained until generated construction subsumes authored setup in Phase 2. */
	instantiate: AnyExactComponentCallable;
	/** Compact compiler/runtime capability bits selecting instance storage and owned sidecars. */
	abi: number;
	updates?: ExactCompiledComponentUpdateContract;
	/** Immutable receiver-owned plan for exact indexed prop-to-state relationships. */
	inputs?: ExactCompiledComponentInputUpdateContract;
	state: readonly string[];
	props: readonly string[];
	/** Finite compiler-owned shape used only for compact root-prop publication. */
	serialization?: ExactValueSerializationSchema;
	/** Foreign-owned prop values retained by identity without recursive reactive proxying. */
	opaqueProps?: readonly PropertyKey[];
	/** Opaque prop identities whose replacement requires a new component-owned range. */
	identityProps?: readonly PropertyKey[];
	tasks?: readonly string[];
	reactive?: readonly ExactComponentReactiveAllocation[];
	render?: 'returned-function';
	capabilities: readonly ExactCompiledComponentCapability[];
}>;
