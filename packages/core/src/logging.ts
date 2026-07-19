export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

export type LogScope = {
	source: 'component' | 'framework';
	packageName?: string;
	category?: string;
	component?: {
		id: string;
		name: string;
		mounted: boolean;
	};
};

export type LogEvent = {
	level: LogLevel;
	message: string;
	data?: unknown;
	error?: unknown;
	scope: LogScope;
};

export type Logger = {
	isEnabled?(level: LogLevel, scope: LogScope): boolean;
	log(event: LogEvent): void;
};

export type LazyLogValue<T> = T | (() => T);

export type ComponentLog = {
	trace(message: LazyLogValue<string>, data?: LazyLogValue<unknown>): void;
	debug(message: LazyLogValue<string>, data?: LazyLogValue<unknown>): void;
	info(message: LazyLogValue<string>, data?: LazyLogValue<unknown>): void;
	warn(message: LazyLogValue<string>, data?: LazyLogValue<unknown>): void;
	error(
		message: LazyLogValue<string>,
		error?: LazyLogValue<unknown>,
		data?: LazyLogValue<unknown>
	): void;
};

export type ConsoleLoggerOptions = {
	level?: LogLevel;
};

const logLevelOrder: Record<LogLevel, number> = {
	trace: 0,
	debug: 1,
	info: 2,
	warn: 3,
	error: 4
};

/** Creates a logger implementation that writes formatted eXact events to the console. */
export function createConsoleLogger(options: ConsoleLoggerOptions = {}): Logger {
	const minimumLevel = options.level ?? 'info';

	return {
		isEnabled(level) {
			return logLevelOrder[level] >= logLevelOrder[minimumLevel];
		},
		log(event) {
			const prefix = `${formatLogScope(event.scope)} ${event.message}`;
			const consoleMethod = getConsoleMethod(event.level);
			if (event.error !== undefined && event.data !== undefined) {
				consoleMethod(prefix, event.error, event.data);
			} else if (event.error !== undefined) {
				consoleMethod(prefix, event.error);
			} else if (event.data !== undefined) {
				consoleMethod(prefix, event.data);
			} else {
				consoleMethod(prefix);
			}
		}
	};
}

/** Formats a structured log scope into the compact prefix used by framework logs. */
export function formatLogScope(scope: LogScope): string {
	if (scope.source === 'component' && scope.component) {
		return `[exact] [component:${scope.component.name}#${scope.component.id}]`;
	}

	const frameworkName = ['framework', scope.packageName, scope.category].filter(Boolean).join(':');
	return `[exact] [${frameworkName}]`;
}

function getConsoleMethod(level: LogLevel): (...args: unknown[]) => void {
	if (level === 'trace') return console.trace?.bind(console) ?? console.debug.bind(console);
	if (level === 'debug') return console.debug.bind(console);
	if (level === 'info') return console.info.bind(console);
	if (level === 'warn') return console.warn.bind(console);
	return console.error.bind(console);
}
