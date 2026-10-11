import type {
	AnyEnhancementComponentFunction,
	ComponentFunction,
	ContextToken
} from '@exactjs/core';
import type { ExactPreparedServerComponentReference } from '@exactjs/core/runtime/component-operations';

/** Infers authored instance state, or exposes captured generated-server state as unknown values. */
export type StateOf<C> =
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Props are erased only so the conditional type can infer component state.
	C extends ComponentFunction<infer State, any>
		? State
		: C extends (...args: never[]) => ExactPreparedServerComponentReference
			? Record<string, unknown>
			: never;
/** Preserves authored props for normalized components and prepared server artifact factories. */
export type PropsOf<C> =
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- State is erased only so the conditional type can infer component props.
	C extends ComponentFunction<any, infer Props>
		? Props
		: C extends (props: infer Props) => ExactPreparedServerComponentReference
			? Props
			: never;
/** Configures test. */
export type TestConfiguration = {
	timeout?: number;
	settleTasks?: boolean;
	attachToDocument?: boolean;
	/** Bundle-local enhancement components installed for this test renderer. */
	enhancementCatalog?: ReadonlyMap<string, AnyEnhancementComponentFunction>;
};
/** Configures action. */
export type ActionOptions = { settleTasks?: boolean };
/** Defines the accessible name type contract. */
export type AccessibleName = string | RegExp;
/** Configures role query. */
export type RoleQueryOptions = { name?: AccessibleName };
/** Defines the context entry type contract. */
export type ContextEntry = { token: ContextToken<unknown>; value: unknown };
/** Configures internal. */
export type InternalConfiguration = Required<Pick<TestConfiguration, 'timeout' | 'settleTasks'>>;
