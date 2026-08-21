import {
	type AnyAuthoredComponentFunction,
	type AnyStateAuthoredComponentFunction,
	createVNode,
	type Activity,
	type Child,
	type Fragment,
	type Suspense,
	type VNode,
	type VNodeType
} from '@exactjs/core';
import { createCompiledVNode } from '@exactjs/core/runtime/render';
import { createExactFrameworkFixtureArtifact } from '@exactjs/core/framework/component-contracts';
import type { AnyExactComponentCallable } from '@exactjs/core/framework/component-contracts';
import { jsx, jsxs } from '@exactjs/jsx';

let nextFixtureId = 0;

type TestJsxProps = Record<string, unknown> & {
	children?: Child | Child[];
	key?: string;
};

type TestJsxType = VNodeType | AnyAuthoredComponentFunction;

/** Gives a raw renderer-test function the identity application components receive from the compiler. */
function testType<T extends TestJsxType>(type: T): T {
	const authoredName = typeof type === 'function' ? type.name : '';
	if (typeof type === 'function')
		createExactFrameworkFixtureArtifact(
			type,
			`@exactjs/testing:fixture:${authoredName || 'anonymous'}:${++nextFixtureId}`
		);
	return type;
}

/** Explicitly brands one raw function for a low-level framework test. */
export function markTestComponent<T extends AnyExactComponentCallable>(component: T): T {
	return testType(component) as T;
}

/** Explicitly brands every raw function in a low-level component registry fixture. */
export function markTestComponents<T extends Record<string, unknown>>(components: T): T {
	for (const component of Object.values(components)) {
		if (typeof component === 'function') markTestComponent(component as AnyExactComponentCallable);
	}
	return components;
}

/** Creates a low-level renderer fixture without bypassing native component identity checks. */
export function createTestVNode(
	type: VNodeType,
	props: Record<string, unknown> | null,
	...children: unknown[]
): VNode {
	return createVNode(testType(type), props, ...children);
}

/** Creates a compiled-cell-shaped renderer fixture with an explicit test component identity. */
export function createCompiledTestVNode(
	type: VNodeType,
	props: Record<string, unknown> | null,
	...children: unknown[]
): VNode {
	return createCompiledVNode(testType(type), props, ...children);
}

/** Creates an automatic-JSX-shaped renderer fixture with an explicit test component identity. */
export function createTestJsx<P extends TestJsxProps>(
	type: AnyStateAuthoredComponentFunction<P>,
	props: P | null,
	key?: string
): VNode<P>;
export function createTestJsx(
	type: string | typeof Activity | typeof Fragment | typeof Suspense,
	props: TestJsxProps | null,
	key?: string
): VNode;
export function createTestJsx(
	type: TestJsxType,
	props: Record<string, unknown> | null,
	key?: string
): VNode {
	return (jsx as (type: TestJsxType, props: Record<string, unknown> | null, key?: string) => VNode)(
		testType(type),
		props,
		key
	);
}

/** Multi-child counterpart to {@link createTestJsx}. */
export function createTestJsxs<P extends TestJsxProps>(
	type: AnyStateAuthoredComponentFunction<P>,
	props: P | null,
	key?: string
): VNode<P>;
export function createTestJsxs(
	type: string | typeof Activity | typeof Fragment | typeof Suspense,
	props: TestJsxProps | null,
	key?: string
): VNode;
export function createTestJsxs(
	type: TestJsxType,
	props: Record<string, unknown> | null,
	key?: string
): VNode {
	return (
		jsxs as (type: TestJsxType, props: Record<string, unknown> | null, key?: string) => VNode
	)(testType(type), props, key);
}
