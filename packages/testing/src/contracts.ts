import type { ComponentFunction, ContextToken } from '@exactjs/core';

/** Defines the state of type contract. */
export type StateOf<C> = C extends ComponentFunction<infer State, any> ? State : never;
/** Defines the props of type contract. */
export type PropsOf<C> = C extends ComponentFunction<any, infer Props> ? Props : never;
/** Configures test. */
export type TestConfiguration = {
	timeout?: number;
	settleTasks?: boolean;
	attachToDocument?: boolean;
	/** Bundle-local enhancement components installed for this test renderer. */
	enhancementCatalog?: ReadonlyMap<
		string,
		ComponentFunction<any, Record<string, unknown>>
	>;
};
/** Configures action. */
export type ActionOptions = { settleTasks?: boolean };
/** Defines the accessible name type contract. */
export type AccessibleName = string | RegExp;
/** Configures role query. */
export type RoleQueryOptions = { name?: AccessibleName };
/** Defines the context entry type contract. */
export type ContextEntry = { token: ContextToken<any>; value: unknown };
/** Configures internal. */
export type InternalConfiguration = Required<Pick<TestConfiguration, 'timeout' | 'settleTasks'>>;
