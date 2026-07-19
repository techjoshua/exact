import { unwrap } from '@exact/reactive';
import type { ComponentInstance, ErrorReport } from './contracts.js';

import { LoggerContext } from './contexts.js';

import {
	createConsoleLogger,
	type ComponentLog,
	type LazyLogValue,
	type Logger,
	type LogEvent,
	type LogLevel,
	type LogScope
} from '../logging.js';

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

export function createNoopComponentLog(): ComponentLog {
	const noop = () => undefined;
	return {
		trace: noop,
		debug: noop,
		info: noop,
		warn: noop,
		error: noop
	};
}

export function createComponentLog(instance: ComponentInstance<any>): ComponentLog {
	return {
		trace(message, data) {
			emitComponentLog(instance, 'trace', message, data);
		},
		debug(message, data) {
			emitComponentLog(instance, 'debug', message, data);
		},
		info(message, data) {
			emitComponentLog(instance, 'info', message, data);
		},
		warn(message, data) {
			emitComponentLog(instance, 'warn', message, data);
		},
		error(message, errorOrData, data) {
			emitComponentLog(instance, 'error', message, errorOrData, data);
		}
	};
}

function emitComponentLog(
	instance: ComponentInstance<any>,
	level: LogLevel,
	message: LazyLogValue<string>,
	errorOrData?: LazyLogValue<unknown>,
	data?: LazyLogValue<unknown>
): void {
	const scope = componentLogScope(instance);
	const logger = resolveLogger(instance);
	if (!isLogEnabled(logger, level, scope)) return;

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

function resolveLogger(instance: ComponentInstance<any>): Logger {
	let cursor: ComponentInstance<any> | undefined = instance.parent;
	while (cursor) {
		if (cursor.contexts.has(LoggerContext.id)) {
			return unwrap(cursor.contexts.get(LoggerContext.id)) as Logger;
		}
		cursor = cursor.parent;
	}

	return defaultConsoleLogger;
}

export function componentLogScope(instance: ComponentInstance<any>): LogScope {
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

export function isErrorReport(value: unknown): value is ErrorReport {
	return (
		!!value && typeof value === 'object' && 'id' in value && 'error' in value && 'source' in value
	);
}

export function formatError(error: unknown): string {
	if (error instanceof Error) {
		return error.stack ?? error.message;
	}
	return String(error);
}
