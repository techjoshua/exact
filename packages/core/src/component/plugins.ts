import type { ContextToken } from './contracts.js';

import type { ComponentInstance } from './contracts.js';

import { ErrorContext, LoggerContext } from './contexts.js';

import { defaultErrorContext } from './errors.js';

import { createComponentLog, defaultConsoleLogger } from './log.js';

type InternalPlugin = {
	readonly name: string;
	readonly defaultContexts?: readonly DefaultContextProvider[];
	augmentComponent?(instance: ComponentInstance<any>): void;
};

type DefaultContextProvider = {
	readonly token: ContextToken<unknown>;
	readonly value: unknown;
};

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

export function applyInternalPlugins(instance: ComponentInstance<any>): void {
	for (const plugin of internalPlugins) {
		plugin.augmentComponent?.(instance);
	}
}
