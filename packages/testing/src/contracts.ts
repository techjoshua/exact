import type { ComponentFunction, ContextToken } from '@exact/core';

export type StateOf<C> = C extends ComponentFunction<infer State, any> ? State : never;
export type PropsOf<C> = C extends ComponentFunction<any, infer Props> ? Props : never;
export type TestConfiguration = {
	timeout?: number;
	settleTasks?: boolean;
	attachToDocument?: boolean;
};
export type ActionOptions = { settleTasks?: boolean };
export type AccessibleName = string | RegExp;
export type RoleQueryOptions = { name?: AccessibleName };
export type ContextEntry = { token: ContextToken<any>; value: unknown };
export type InternalConfiguration = Required<Pick<TestConfiguration, 'timeout' | 'settleTasks'>>;
