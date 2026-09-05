import {
	type AnyAuthoredComponentFunction,
	type AnyStateAuthoredComponentFunction,
	type Activity,
	type Child,
	type Fragment,
	type Portal,
	type Suspense,
	type Target,
	type UnsafeHtml
} from '@exactjs/core';
import type { ServerBoundary, ServerSlot } from '@exactjs/core/runtime/render-operations';
import {
	createCompiledActivityReceipt,
	createCompiledComponentReceipt,
	createCompiledFragmentReceipt,
	createCompiledIntrinsicReceipt,
	createCompiledPortalReceipt,
	createCompiledServerBoundaryReceipt,
	createCompiledServerSlotReceipt,
	createCompiledSuspenseReceipt,
	createCompiledTargetReceipt,
	createCompiledUnsafeHtmlReceipt
} from '@exactjs/core/runtime/component-operations';
import { createExactFrameworkFixtureArtifact } from '@exactjs/core/testing';
import {
	attachExactCompiledClientComponent,
	disposeExactClientComponent,
	disposeExactServerComponent,
	issueExactServerComponent,
	receiveExactClientComponentProps,
	writeExactServerComponent
} from '@exactjs/core/runtime/compatibility-component-abi';
import {
	componentDomainTarget,
	currentComponentDomain
} from '@exactjs/core/framework/component-domains';
import '@exactjs/core/runtime/lifecycle';
import {
	exactComponentContract,
	exactComponentType,
	type AnyExactComponentCallable,
	type ExactComponentContract,
	type ExactComponentExecutableArtifact
} from '@exactjs/core/framework/component-contracts';

let nextFixtureId = 0;
type TargetFixtureRecord = {
	identity: string;
	client?: AnyExactComponentCallable;
	server?: AnyExactComponentCallable;
};
const targetFixtures = new WeakMap<AnyExactComponentCallable, TargetFixtureRecord>();

type TestJsxProps = Record<string, unknown> & {
	children?: Child | Child[];
	key?: string;
};

type TestJsxType =
	| string
	| symbol
	| typeof Activity
	| typeof Fragment
	| typeof Portal
	| typeof ServerBoundary
	| typeof ServerSlot
	| typeof Suspense
	| typeof Target
	| typeof UnsafeHtml
	| AnyAuthoredComponentFunction;

/** Gives a raw renderer-test function the identity application components receive from the compiler. */
function testType<T extends TestJsxType>(
	type: T,
	target: 'client' | 'server' = currentComponentDomain()
		? componentDomainTarget(currentComponentDomain()!)
		: 'client',
	props?: Record<string, unknown> | null
): T {
	const authoredName = typeof type === 'function' ? type.name : '';
	if (typeof type !== 'function') return type;
	let variants = targetFixtures.get(type);
	const cached = variants?.[target];
	if (cached) {
		recordFixtureProps(cached, props);
		return cached as T;
	}
	const attachedIdentity = Reflect.get(type, Symbol.for('@exactjs/component'));
	const identity =
		variants?.identity ??
		(typeof attachedIdentity === 'string' && attachedIdentity
			? attachedIdentity
			: `@exactjs/testing:fixture:${authoredName || 'anonymous'}:${++nextFixtureId}`);
	let fixture = type as AnyExactComponentCallable;
	try {
		createExactFrameworkFixtureArtifact(fixture, identity, target);
	} catch (error) {
		if (!(error instanceof TypeError) || !error.message.includes('target-local artifact target'))
			throw error;
		fixture = function (this: unknown, ...args: unknown[]) {
			return Reflect.apply(type, this, args);
		};
		Object.defineProperty(fixture, 'name', { configurable: true, value: authoredName });
		const sourceContract = Reflect.get(type, exactComponentContract) as
			| ExactComponentContract
			| undefined;
		if (sourceContract) {
			const { artifact: sourceArtifact, ...metadata } = sourceContract;
			Object.defineProperty(fixture, exactComponentContract, {
				configurable: true,
				value: {
					...metadata,
					placement: target,
					role: target === 'client' ? 'client' : 'executor',
					artifact: pairedFixtureArtifact(sourceArtifact, fixture, identity, target, sourceContract)
				}
			});
			Object.defineProperty(fixture, exactComponentType, {
				configurable: true,
				value: identity
			});
		}
		createExactFrameworkFixtureArtifact(fixture, identity, target);
	}
	variants ??= { identity };
	variants[target] = fixture;
	targetFixtures.set(type, variants);
	recordFixtureProps(fixture, props);
	return fixture as T;
}

/** Records the prop-slot order otherwise supplied by compilation for nested test fixtures. */
function recordFixtureProps(
	fixture: AnyExactComponentCallable,
	props: Record<string, unknown> | null | undefined
): void {
	if (!props) return;
	const artifact = Reflect.get(fixture, exactComponentContract)?.artifact as
		| ExactComponentExecutableArtifact
		| undefined;
	if (!artifact?.capabilities.includes('compatibility') || Object.isFrozen(artifact.props)) return;
	const slots = artifact.props as string[];
	for (const name of Object.keys(props)) if (!slots.includes(name)) slots.push(name);
}

/** Preserves compiler-selected common ABI facts while replacing only target-local operations. */
function pairedFixtureArtifact(
	source: ExactComponentExecutableArtifact,
	instantiate: AnyExactComponentCallable,
	id: string,
	target: 'client' | 'server',
	contract: ExactComponentContract
): ExactComponentExecutableArtifact {
	const common = {
		version: 1 as const,
		id,
		instantiate,
		construct: source.construct,
		abi: source.abi,
		state: source.state,
		props: source.props,
		...(source.tasks ? { tasks: source.tasks } : {}),
		...(source.reactive ? { reactive: source.reactive } : {}),
		...(source.render ? { render: source.render } : {}),
		capabilities: source.capabilities
	};
	if (target === 'client')
		return {
			...common,
			target,
			attach: attachExactCompiledClientComponent,
			receive: receiveExactClientComponentProps,
			dispose: disposeExactClientComponent
		};
	return {
		...common,
		target,
		issue: issueExactServerComponent,
		write: writeExactServerComponent,
		dispose: disposeExactServerComponent,
		execution: {
			version: 1,
			classification: 'dynamic',
			lane: 'generic',
			...(contract.resumption && contract.continuations.length !== 0
				? { publication: { kind: 'resumption' as const, name: instantiate.name || id } }
				: {})
		}
	};
}

/** Explicitly brands one raw function for a low-level framework test. */
export function markTestComponent<T extends AnyExactComponentCallable>(component: T): T {
	return testType(component) as T;
}

/** Explicitly brands one raw function as a server-target low-level framework fixture. */
export function markServerTestComponent<T extends AnyExactComponentCallable>(component: T): T {
	return testType(component, 'server') as T;
}

/** Explicitly brands every raw function in a low-level component registry fixture. */
export function markTestComponents<T extends Record<string, unknown>>(components: T): T {
	for (const component of Object.values(components)) {
		if (typeof component === 'function') markTestComponent(component as AnyExactComponentCallable);
	}
	return components;
}

/** Creates a compiler-operation-shaped client fixture without a runtime tree representation. */
export function createTestOperation(
	type: TestJsxType,
	props: Record<string, unknown> | null,
	...children: unknown[]
): Child {
	return createTargetOperation(type, props, children, 'client');
}

/** Creates a compiler-operation-shaped server fixture. */
export function createServerTestOperation(
	type: TestJsxType,
	props: Record<string, unknown> | null,
	...children: unknown[]
): Child {
	return createTargetOperation(type, props, children, 'server');
}

/** Alias used where a fixture explicitly models compiler-closed output. */
export const createCompiledTestOperation = createTestOperation;

/** Issues the receipt shape emitted by the compiler while keeping fixture branding test-only. */
export function createTestComponentReceipt(
	type: AnyAuthoredComponentFunction,
	props: Record<string, unknown> | null,
	...children: unknown[]
) {
	return createCompiledComponentReceipt(
		testType(type as AnyExactComponentCallable, undefined, props),
		props,
		...children
	);
}

/** Issues a server-target component operation while keeping fixture branding test-only. */
export function createServerTestComponentReceipt(
	type: AnyAuthoredComponentFunction,
	props: Record<string, unknown> | null,
	...children: unknown[]
) {
	return createCompiledComponentReceipt(
		testType(type as AnyExactComponentCallable, 'server', props),
		props,
		...children
	);
}

/** Server counterpart used where a fixture explicitly models compiler-closed output. */
export const createCompiledServerTestOperation = createServerTestOperation;

/** Creates an automatic-JSX-shaped renderer fixture with an explicit test component identity. */
export function createTestJsx<P extends TestJsxProps>(
	type: AnyStateAuthoredComponentFunction<P>,
	props: P | null,
	key?: string
): Child;
export function createTestJsx(
	type: string | symbol | typeof Activity | typeof Fragment | typeof Suspense,
	props: TestJsxProps | null,
	key?: string
): Child;
export function createTestJsx(
	type: TestJsxType,
	props: Record<string, unknown> | null,
	key?: string
): Child {
	return createTestRuntimeOperation(type, props, key);
}

/** Multi-child counterpart to {@link createTestJsx}. */
export function createTestJsxs<P extends TestJsxProps>(
	type: AnyStateAuthoredComponentFunction<P>,
	props: P | null,
	key?: string
): Child;
export function createTestJsxs(
	type: string | symbol | typeof Activity | typeof Fragment | typeof Suspense,
	props: TestJsxProps | null,
	key?: string
): Child;
export function createTestJsxs(
	type: TestJsxType,
	props: Record<string, unknown> | null,
	key?: string
): Child {
	return createTestRuntimeOperation(type, props, key);
}

function createTestRuntimeOperation(
	type: TestJsxType,
	props: Record<string, unknown> | null,
	key?: string
): Child {
	const { children, key: authoredKey, ...ordinaryProps } = props ?? {};
	const normalizedKey = key ?? (authoredKey === undefined ? undefined : String(authoredKey));
	const childList = Array.isArray(children) ? children : children === undefined ? [] : [children];
	return createTargetOperation(
		type,
		normalizedKey === undefined ? ordinaryProps : { ...ordinaryProps, key: normalizedKey },
		childList,
		'client'
	);
}

function createTargetOperation(
	type: TestJsxType,
	props: Record<string, unknown> | null,
	children: unknown[],
	target: 'client' | 'server'
): Child {
	if (typeof type === 'string') return createCompiledIntrinsicReceipt(type, props, ...children);
	if (type === (Symbol.for('exact.fragment') as typeof Fragment))
		return createCompiledFragmentReceipt(props, ...children);
	if (type === (Symbol.for('exact.activity') as typeof Activity))
		return createCompiledActivityReceipt(props, ...children);
	if (type === (Symbol.for('exact.suspense') as typeof Suspense))
		return createCompiledSuspenseReceipt(props, ...children);
	if (type === (Symbol.for('exact.target') as typeof Target))
		return createCompiledTargetReceipt(props, ...children);
	if (type === (Symbol.for('exact.portal') as typeof Portal))
		return createCompiledPortalReceipt(props, ...children);
	if (type === (Symbol.for('exact.server-boundary') as typeof ServerBoundary))
		return createCompiledServerBoundaryReceipt(props, ...children);
	if (type === (Symbol.for('exact.server-slot') as typeof ServerSlot))
		return createCompiledServerSlotReceipt(props, ...children);
	if (type === (Symbol.for('exact.unsafe-html') as typeof UnsafeHtml))
		return createCompiledUnsafeHtmlReceipt(props);
	return createCompiledComponentReceipt(
		testType(type as AnyExactComponentCallable, target, props),
		props,
		...children
	);
}
