import { describe, expect, it, vi } from 'vitest';
import { flushSync, reactive, watch } from '@exactjs/reactive';
import {
	LoggerContext,
	logFrameworkEvent,
	type Component,
	type LogEvent,
	type Logger
} from './index.js';
import { createFrameworkFixtureComponentInstance } from './runtime/render.js';
import { componentLogMethod } from './runtime/logging.js';

describe('@exactjs/core logging', () => {
	it('provides a default component logger', () => {
		const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

		try {
			createFrameworkFixtureComponentInstance(function Logged(this: Component<{}>) {
				this.log.info('hello', { answer: 42 });
				return () => null;
			}, {});

			expect(info).toHaveBeenCalledTimes(1);
			const [message, data] = info.mock.calls[0]!;
			expect(message).toMatch(/^\[exact\] \[component:Logged#c\d+\] hello$/);
			expect(data).toEqual({ answer: 42 });
		} finally {
			info.mockRestore();
		}
	});

	it('does not evaluate lazy log payloads for disabled levels', () => {
		const log = vi.fn();
		const logger: Logger = {
			isEnabled: () => false,
			log
		};

		const parent = createFrameworkFixtureComponentInstance(function Parent(this: Component<{}>) {
			this.setContext(LoggerContext, logger);
			return () => null;
		}, {});

		createFrameworkFixtureComponentInstance(
			function Child(this: Component<{}>) {
				this.log.debug(
					() => {
						throw new Error('message should not be evaluated');
					},
					() => {
						throw new Error('data should not be evaluated');
					}
				);
				return () => null;
			},
			{},
			parent
		);

		expect(log).not.toHaveBeenCalled();
	});

	it('passes error objects as separate console arguments', () => {
		const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const error = new Error('boom');

		try {
			createFrameworkFixtureComponentInstance(function Broken(this: Component<{}>) {
				this.log.error('failed', error, { taskId: 'task-1' });
				return () => null;
			}, {});

			expect(errorLog).toHaveBeenCalledTimes(1);
			const [message, actualError, data] = errorLog.mock.calls[0]!;
			expect(message).toMatch(/^\[exact\] \[component:Broken#c\d+\] failed$/);
			expect(actualError).toBe(error);
			expect(data).toEqual({ taskId: 'task-1' });
		} finally {
			errorLog.mockRestore();
		}
	});

	it('resolves logger context at call time', () => {
		const firstEvents: LogEvent[] = [];
		const secondEvents: LogEvent[] = [];
		const firstLogger: Logger = {
			log: (event) => firstEvents.push(event)
		};
		const secondLogger: Logger = {
			log: (event) => secondEvents.push(event)
		};
		let callback!: () => void;

		const parent = createFrameworkFixtureComponentInstance(function Parent(this: Component<{}>) {
			this.setContext(LoggerContext, firstLogger);
			return () => null;
		}, {});

		createFrameworkFixtureComponentInstance(
			function Child(this: Component<{}>) {
				callback = () => this.log.info('later');
				return () => null;
			},
			{},
			parent
		);

		parent.setContext(LoggerContext, secondLogger);
		callback();

		expect(firstEvents).toHaveLength(0);
		expect(secondEvents).toHaveLength(1);
		expect(secondEvents[0]!.message).toBe('later');
	});

	it('prepares compiler log calls from the currently enabled runtime level', () => {
		const events: LogEvent[] = [];
		let debugEnabled = false;
		const logger: Logger = {
			isEnabled: (level) => level !== 'debug' || debugEnabled,
			log: (event) => events.push(event)
		};
		const parent = createFrameworkFixtureComponentInstance(function Parent(this: Component<{}>) {
			this.setContext(LoggerContext, logger);
			return () => null;
		}, {});
		const child = createFrameworkFixtureComponentInstance(
			function Child(this: Component<{}>) {
				return () => null;
			},
			{},
			parent
		);

		let argumentReads = 0;
		componentLogMethod(
			child,
			'debug'
		)?.(() => {
			argumentReads++;
			return ['disabled'];
		});
		expect(argumentReads).toBe(0);
		debugEnabled = true;
		componentLogMethod(child, 'debug')?.(() => ['enabled without rebuilding', { version: 2 }]);
		debugEnabled = false;
		expect(componentLogMethod(child, 'debug')).toBeUndefined();

		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			level: 'debug',
			message: 'enabled without rebuilding',
			data: { version: 2 }
		});
	});

	it('does not materialize the public log facade for disabled compiled trace checks', () => {
		const instance = {
			id: 'compiled-log-owner',
			type: function CompiledLogOwner() {},
			mounted: true,
			parent: undefined,
			ambientContexts: undefined,
			get contexts() {
				return new Map<symbol, unknown>();
			},
			get log(): never {
				throw new Error('compiled logging read the dynamic facade');
			}
		};

		expect(componentLogMethod(instance as never, 'trace')).toBeUndefined();
	});

	it('peeks compiler log arguments without subscribing the caller', () => {
		const events: LogEvent[] = [];
		const logger: Logger = { log: (event) => events.push(event) };
		const parent = createFrameworkFixtureComponentInstance(function Parent(this: Component<{}>) {
			this.setContext(LoggerContext, logger);
			return () => null;
		}, {});
		const child = createFrameworkFixtureComponentInstance(
			function Child(this: Component<{}>) {
				return () => null;
			},
			{},
			parent
		);
		const state = reactive({ count: 1 });
		let runs = 0;
		const stop = watch(() => {
			runs++;
			componentLogMethod(child, 'debug')?.(() => ['current count', { count: state.count }]);
		});

		state.count = 2;
		flushSync();
		stop();

		expect(runs).toBe(1);
		expect(events).toHaveLength(1);
		expect(events[0]!.data).toEqual({ count: 1 });
	});

	it('emits framework-scoped logs through the console logger contract', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

		try {
			logFrameworkEvent('warn', 'dom', 'patch', 'placement skipped', { reason: 'stable' });

			expect(warn).toHaveBeenCalledTimes(1);
			expect(warn.mock.calls[0]).toEqual([
				'[exact] [framework:dom:patch] placement skipped',
				{ reason: 'stable' }
			]);
		} finally {
			warn.mockRestore();
		}
	});

	it('contains logger failures', () => {
		const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const logger: Logger = {
			log() {
				throw new Error('logger failed');
			}
		};

		try {
			const parent = createFrameworkFixtureComponentInstance(function Parent(this: Component<{}>) {
				this.setContext(LoggerContext, logger);
				return () => null;
			}, {});

			expect(() =>
				createFrameworkFixtureComponentInstance(
					function Child(this: Component<{}>) {
						this.log.info('hello');
						return () => null;
					},
					{},
					parent
				)
			).not.toThrow();

			expect(() =>
				logFrameworkEvent('warn', 'dom', 'patch', 'placement skipped', undefined, logger)
			).not.toThrow();
			expect(errorLog).toHaveBeenCalledWith(
				'[exact] [framework:core:logger] logger failed while handling eXact log event',
				expect.any(Error)
			);
		} finally {
			errorLog.mockRestore();
		}
	});

	it('does not evaluate lazy log payloads when logger enable checks fail', () => {
		const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const logger: Logger = {
			isEnabled() {
				throw new Error('logger failed');
			},
			log() {
				throw new Error('log should not be called');
			}
		};

		try {
			expect(() =>
				logFrameworkEvent(
					'debug',
					'dom',
					'patch',
					() => {
						throw new Error('message should not be evaluated');
					},
					undefined,
					logger
				)
			).not.toThrow();

			expect(errorLog).toHaveBeenCalledWith(
				'[exact] [framework:core:logger] logger failed while handling eXact log event',
				expect.any(Error)
			);
		} finally {
			errorLog.mockRestore();
		}
	});
});
