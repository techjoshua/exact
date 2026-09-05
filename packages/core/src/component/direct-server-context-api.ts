import type { Reactive } from '@exactjs/reactive/framework/runtime';

import type {
	ComponentContextValues,
	ComponentDomain,
	ContextToken,
	ErrorContextValue,
	ErrorReport,
	ErrorReportOptions
} from './contracts.js';
import { ErrorContext, LoggerContext } from './contexts.js';
import { defaultConsoleLogger } from './default-logger.js';
import { markComponentDomainLoggerOverride } from './domain.js';

/** Minimal logical ownership required by a request-local direct server frame. */
export type DirectServerContextOwner = {
	parent?: DirectServerContextOwner;
	readonly domain: ComponentDomain;
	readonly contexts: Map<symbol, unknown>;
	readonly ambientContexts?: ComponentContextValues;
};

const requestErrorContexts = new WeakMap<ComponentDomain, ErrorContextValue>();
let nextServerErrorId = 1;

/** Reports whether a direct server frame can resolve a context without allocating its value. */
export function hasDirectServerContext(
	instance: DirectServerContextOwner,
	ambientContexts: ComponentContextValues | undefined,
	token: ContextToken<unknown>
): boolean {
	for (let cursor = instance.parent; cursor; cursor = cursor.parent)
		if (cursor.contexts.has(token.id)) return true;
	return (
		ambientContexts?.has(token.id) === true ||
		token.id === LoggerContext.id ||
		token.id === ErrorContext.id
	);
}

/** Resolves direct server context values without constructing client reactive ownership. */
export function getDirectServerContext<T>(
	instance: DirectServerContextOwner,
	ambientContexts: ComponentContextValues | undefined,
	token: ContextToken<T>
): Reactive<T> {
	for (let cursor = instance.parent; cursor; cursor = cursor.parent) {
		if (cursor.contexts.has(token.id)) return cursor.contexts.get(token.id) as Reactive<T>;
	}

	if (ambientContexts?.has(token.id)) return ambientContexts.get(token.id) as Reactive<T>;
	if (token.id === LoggerContext.id) return defaultConsoleLogger as Reactive<T>;
	if (token.id === ErrorContext.id) return requestErrorContext(instance.domain) as Reactive<T>;

	throw new Error(`Context "${token.description}" was not provided`);
}

/** Publishes a raw request-local value; direct SSR has no later reactive observation pass. */
export function setDirectServerContext<T>(
	instance: DirectServerContextOwner,
	token: ContextToken<T>,
	value: T
): void {
	if (token.id === LoggerContext.id) markComponentDomainLoggerOverride(instance.domain);
	instance.contexts.set(token.id, value);
}

function requestErrorContext(domain: ComponentDomain): ErrorContextValue {
	let context = requestErrorContexts.get(domain);
	if (context) return context;
	const errors: ErrorReport[] = [];
	context = {
		errors,
		report(error, options = {}) {
			const report = isErrorReport(error) ? error : createDirectServerErrorReport(error, options);
			errors.push(report);
			if (errors.length > 100) errors.splice(0, errors.length - 100);
			return report;
		},
		clear(error) {
			const id = typeof error === 'string' ? error : error.id;
			const index = errors.findIndex((item) => item.id === id);
			if (index >= 0) errors.splice(index, 1);
		},
		clearAll() {
			errors.splice(0, errors.length);
		}
	};
	requestErrorContexts.set(domain, context);
	return context;
}

function createDirectServerErrorReport(error: unknown, options: ErrorReportOptions): ErrorReport {
	return {
		id: `se${nextServerErrorId++}`,
		error,
		source: options.source ?? 'component',
		component: options.component,
		phase: options.phase
	};
}

function isErrorReport(value: unknown): value is ErrorReport {
	return (
		!!value && typeof value === 'object' && 'id' in value && 'error' in value && 'source' in value
	);
}
