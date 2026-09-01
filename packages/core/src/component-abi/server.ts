import type {
	AnyExactComponentCallable,
	ExactComponentReactiveAllocation
} from './executable-fields.js';
import type { ExactCompiledComponentCapability } from '../component-definition-contracts.js';
import type { CompiledComponentInstanceConstructor } from '../component/instance-construction.js';

/** Request protocol key that creates and owns one request-local server frame. */
export const exactServerIssue = Symbol.for('@exactjs/server-component-issue');

/** Writer protocol key that serializes one issued frame in authored output order. */
export const exactServerWrite = Symbol.for('@exactjs/server-component-write');

/** Frame protocol key that releases request-local ownership exactly once. */
export const exactServerDispose = Symbol.for('@exactjs/server-component-dispose');

/** Request-owned issuance service invoked by a current server artifact. */
export type ExactRequestExecution = Readonly<{
	[exactServerIssue](
		artifact: ExactServerComponentArtifact,
		parent: object | undefined,
		props: Record<string, unknown>
	): object | Promise<object>;
}>;

/** Ordered HTML writer invoked by a current server artifact. */
export type ExactHtmlWriter = Readonly<{
	[exactServerWrite](artifact: ExactServerComponentArtifact, frame: object): void | Promise<void>;
}>;

/** Request-local frame capable of releasing all ownership established during issuance. */
export type ExactServerFrame = Readonly<{
	[exactServerDispose](
		artifact: ExactServerComponentArtifact,
		reason: unknown
	): void | Promise<void>;
}>;

/** Server-only scheduling and publication facts used by the current executable server artifact. */
export type ExactServerComponentExecution = Readonly<{
	version: 1;
	classification: 'synchronous' | 'scheduled' | 'dynamic';
	lane: 'direct' | 'generic' | 'compatibility';
	deferredTaskProps?: readonly string[];
	render?: AnyExactComponentCallable;
	/** Compiler-proven setup entry without a returned render closure; stateless mode also omits a frame. */
	mode?: 'direct' | 'stateless';
	frame?: AnyExactComponentCallable;
	lifecycle?: Readonly<{
		rendered: AnyExactComponentCallable;
		dispose: AnyExactComponentCallable;
	}>;
	publication?: Readonly<{
		kind: 'resumption';
		name: string;
	}>;
}>;

/** Complete executable ABI carried by one compiler-produced server component export. */
export type ExactServerComponentArtifact = Readonly<{
	version: 1;
	target: 'server';
	id: string;
	issue: AnyExactComponentCallable;
	write: AnyExactComponentCallable;
	dispose: AnyExactComponentCallable;
	execute?: AnyExactComponentCallable;
	/** Setup implementation invoked only inside request-local artifact issuance. */
	instantiate: AnyExactComponentCallable;
	/** Current request-frame construction entry selected statically by the compiler. */
	construct: CompiledComponentInstanceConstructor;
	abi: number;
	state: readonly string[];
	props: readonly string[];
	/** Foreign-owned prop values retained by identity without recursive reactive proxying. */
	opaqueProps?: readonly PropertyKey[];
	tasks?: readonly string[];
	reactive?: readonly ExactComponentReactiveAllocation[];
	render?: 'returned-function';
	capabilities: readonly ExactCompiledComponentCapability[];
	execution: ExactServerComponentExecution;
	/** Finite registry selection resolved before request-local issuance. */
	selection?: Readonly<{
		key: string;
		resolve: () => AnyExactComponentCallable | Promise<AnyExactComponentCallable>;
	}>;
}>;
