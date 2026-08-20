import type { ContextToken } from './contracts.js';

import type { AnyComponentInstance } from './contracts.js';

import { ErrorContext, LoggerContext } from './contexts.js';

import { defaultErrorContext } from './errors.js';

import { createComponentLog, defaultConsoleLogger } from './log.js';

type InternalPlugin = {
	readonly name: string;
	readonly defaultContexts?: readonly DefaultContextProvider[];
	augmentComponent?(instance: AnyComponentInstance): void;
};

type DefaultContextProvider = {
	readonly token: ContextToken<unknown>;
	readonly value: unknown;
};

/** Provides the canonical default contexts value. */
export const defaultContexts = new Map<symbol, unknown>();
const internalPlugins: InternalPlugin[] = [
	{
		name: 'exact.logging',
		defaultContexts: [
			{
				token: LoggerContext as ContextToken<unknown>,
				value: defaultConsoleLogger
			},
			{
				token: ErrorContext as ContextToken<unknown>,
				value: defaultErrorContext
			}
		],
		augmentComponent(instance) {
			instance.log = createComponentLog(instance);
		}
	}
];

for (const plugin of internalPlugins) {
	for (const provider of plugin.defaultContexts ?? []) {
		defaultContexts.set(provider.token.id, provider.value);
	}
}

/** Applies an internal plugins to the owned runtime state. */
export function applyInternalPlugins(instance: AnyComponentInstance): void {
	for (const plugin of internalPlugins) {
		plugin.augmentComponent?.(instance);
	}
}
