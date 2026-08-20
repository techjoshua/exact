import type { ComponentFunction, ContextToken } from '@exactjs/core';

/** Defines the state of type contract. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Props are erased only so the conditional type can infer component state.
export type StateOf<C> = C extends ComponentFunction<infer State, any> ? State : never;
/** Defines the props of type contract. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- State is erased only so the conditional type can infer component props.
export type PropsOf<C> = C extends ComponentFunction<any, infer Props> ? Props : never;
/** Configures test. */
export type TestConfiguration = {
	timeout?: number;
	settleTasks?: boolean;
	attachToDocument?: boolean;
	/** Bundle-local enhancement components installed for this test renderer. */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Catalog entries may own any internal state while accepting the canonical enhancement props record.
	enhancementCatalog?: ReadonlyMap<string, ComponentFunction<any, Record<string, unknown>>>;
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
