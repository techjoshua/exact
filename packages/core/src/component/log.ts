import { peek, unwrap } from '@exactjs/reactive/framework/runtime';
import type {
	AnyComponent,
	AnyComponentFunction,
	AnyComponentInstance,
	ComponentContextValues,
	ComponentDomain,
	ErrorReport
} from './contracts.js';

import { LoggerContext } from './contexts.js';
import { componentDomainLogging } from './domain.js';

import {
	createConsoleLogger,
	type ComponentLog,
	type LazyLogValue,
	type LogEvent,
	type Logger,
	type LogLevel,
	type LogScope
} from '../logging.js';

/** Provides the canonical default console logger value. */
export const defaultConsoleLogger = createConsoleLogger();

/** Emits a framework-scoped log event through the supplied or default logger. */
export function logFrameworkEvent(
	level: LogLevel,
	packageName: string,
	category: string,
	message: LazyLogValue<string>,
	data?: LazyLogValue<unknown>,
	logger: Logger = defaultConsoleLogger
): void {
	const scope: LogScope = {
		source: 'framework',
		packageName,
		category
	};
	if (!isLogEnabled(logger, level, scope)) return;
	emitLogEvent(logger, {
		level,
		message: evaluateLogValue(message),
		data: data === undefined ? undefined : evaluateLogValue(data),
		scope
	});
}

/** Creates a component log. */
export function createComponentLog(instance: AnyComponentInstance): ComponentLog {
	return new ComponentLogFacade(instance);
}

/**
 * Represents an enabled component-log invocation prepared for an immediate call.
 * Compiler output uses the optional presence of this function to defer authored
 * argument evaluation until after the logger's runtime level check. The supplied
 * reader runs exactly once inside a reactive `peek()` boundary.
 */
export type ComponentLogMethod = (
	readArguments: () => readonly [
		message: LazyLogValue<string>,
		errorOrData?: LazyLogValue<unknown>,
		data?: LazyLogValue<unknown>
	]
) => void;

/** Minimum durable or request-local ownership needed by compiler-lowered component logging. */
export type ComponentLogOwner = Readonly<{
	domain: ComponentDomain;
	parent?: AnyComponentInstance;
	ambientContexts?: ComponentContextValues;
	id: string;
	type: AnyComponentFunction;
	mounted: boolean;
}>;

/**
 * Resolves an enabled component-log method without evaluating authored log arguments.
 * The result is intentionally decided at call time so a running application can change
 * logger contexts or enabled levels without rebuilding its artifact.
 */
export function componentLogMethod(
	instance: AnyComponent | ComponentLogOwner,
	level: LogLevel
): ComponentLogMethod | undefined {
	// Compiler-generated component bodies receive either a durable instance or a compiler-selected
	// request-local server frame. Both deliberately expose only this logging ownership contract.
	return prepareComponentLogMethod(instance as ComponentLogOwner, level);
}

class ComponentLogFacade implements ComponentLog {
	private readonly scope: LogScope;

	constructor(private readonly instance: AnyComponentInstance) {
		this.scope = componentLogScope(instance);
	}

	trace(message: LazyLogValue<string>, data?: LazyLogValue<unknown>): void {
		this.method('trace')?.(() => [message, data]);
	}

	debug(message: LazyLogValue<string>, data?: LazyLogValue<unknown>): void {
		this.method('debug')?.(() => [message, data]);
	}

	info(message: LazyLogValue<string>, data?: LazyLogValue<unknown>): void {
		this.method('info')?.(() => [message, data]);
	}

	warn(message: LazyLogValue<string>, data?: LazyLogValue<unknown>): void {
		this.method('warn')?.(() => [message, data]);
	}

	error(
		message: LazyLogValue<string>,
		errorOrData?: LazyLogValue<unknown>,
		data?: LazyLogValue<unknown>
	): void {
		this.method('error')?.(() => [message, errorOrData, data]);
	}

	/**
	 * Prepares one immediate invocation against the current logger and component scope.
	 * The cached scope keeps the disabled path allocation-free after component creation;
	 * mounted state is refreshed because the facade outlives activation transitions.
	 */
	method(level: LogLevel): ComponentLogMethod | undefined {
		return prepareComponentLogMethod(this.instance, level, this.scope);
	}
}

/** Prepares one shared compiled/runtime logging operation for a specific component instance. */
function prepareComponentLogMethod(
	instance: ComponentLogOwner,
	level: LogLevel,
	cachedScope?: LogScope
): ComponentLogMethod | undefined {
	const logger = resolveLogger(instance);
	// The built-in logger's enablement is scope-independent. Avoid constructing a component scope
	// for the overwhelmingly common disabled trace/debug checks on interaction and task hot paths.
	if (
		logger === defaultConsoleLogger &&
		!isLogEnabled(logger, level, defaultComponentEnablementScope)
	)
		return undefined;
	const scope = cachedScope ?? componentLogScope(instance);
	if (scope.component) scope.component.mounted = instance.mounted;
	if (logger !== defaultConsoleLogger && !isLogEnabled(logger, level, scope)) return undefined;
	return (readArguments) => {
		peek(() => {
			const [message, errorOrData, data] = readArguments();
			emitPreparedComponentLog(logger, scope, level, message, errorOrData, data);
		});
	};
}

const defaultComponentEnablementScope: LogScope = Object.freeze({ source: 'component' });

function emitPreparedComponentLog(
	logger: Logger,
	scope: LogScope,
	level: LogLevel,
	message: LazyLogValue<string>,
	errorOrData?: LazyLogValue<unknown>,
	data?: LazyLogValue<unknown>
): void {
	const evaluatedMessage = evaluateLogValue(message);
	let evaluatedError: unknown;
	let evaluatedData: unknown;

	if (level === 'error' && data !== undefined) {
		evaluatedError = evaluateLogValue(errorOrData);
		evaluatedData = evaluateLogValue(data);
	} else if (level === 'error' && errorOrData !== undefined) {
		const value = evaluateLogValue(errorOrData);
		if (isErrorLike(value)) {
			evaluatedError = value;
		} else {
			evaluatedData = value;
		}
	} else if (errorOrData !== undefined) {
		evaluatedData = evaluateLogValue(errorOrData);
	}

	emitLogEvent(logger, {
		level,
		message: evaluatedMessage,
		error: evaluatedError,
		data: evaluatedData,
		scope
	});
}

function isLogEnabled(logger: Logger, level: LogLevel, scope: LogScope): boolean {
	try {
		return !logger.isEnabled || logger.isEnabled(level, scope);
	} catch (error) {
		reportLoggerFailure(error);
		return false;
	}
}

function emitLogEvent(logger: Logger, event: LogEvent): void {
	try {
		logger.log(event);
	} catch (error) {
		reportLoggerFailure(error);
	}
}

function reportLoggerFailure(error: unknown): void {
	try {
		defaultConsoleLogger.log({
			level: 'error',
			message: 'logger failed while handling eXact log event',
			error,
			scope: {
				source: 'framework',
				packageName: 'core',
				category: 'logger'
			}
		});
	} catch {
		// Logging failures must not become application failures.
	}
}

function resolveLogger(instance: ComponentLogOwner): Logger {
	const shared = componentDomainLogging(instance.domain);
	if (shared && !shared.componentOverride) return shared.logger ?? defaultConsoleLogger;
	let cursor: AnyComponentInstance | undefined = instance.parent;
	while (cursor) {
		if (cursor.contexts.has(LoggerContext.id)) {
			return unwrap(cursor.contexts.get(LoggerContext.id)) as Logger;
		}
		cursor = cursor.parent;
	}
	if (instance.ambientContexts?.has(LoggerContext.id)) {
		return unwrap(instance.ambientContexts.get(LoggerContext.id)) as Logger;
	}

	return defaultConsoleLogger;
}

/** Performs the component log scope domain operation. */
export function componentLogScope(instance: ComponentLogOwner): LogScope {
	return {
		source: 'component',
		component: {
			id: instance.id,
			name: instance.type.name || 'anonymous',
			mounted: instance.mounted
		}
	};
}

function evaluateLogValue<T>(value: LazyLogValue<T>): T {
	return typeof value === 'function' ? (value as () => T)() : value;
}

function isErrorLike(value: unknown): boolean {
	return value instanceof Error;
}

/** Reports whether error report. */
export function isErrorReport(value: unknown): value is ErrorReport {
	return (
		!!value && typeof value === 'object' && 'id' in value && 'error' in value && 'source' in value
	);
}

/** Performs the format error domain operation. */
export function formatError(error: unknown): string {
	if (error instanceof Error) {
		return error.stack ?? error.message;
	}
	return String(error);
}
