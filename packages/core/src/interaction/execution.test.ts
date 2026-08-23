import { describe, expect, it } from 'vitest';

import type { Component } from '../component/contracts.js';
import { LoggerContext } from '../component/contexts.js';
import { createFrameworkFixtureComponentInstance } from '../component/runtime.js';
import type { LogEvent, Logger } from '../logging.js';
import { TaskCancellation } from '../tasks/cancellation.js';
import { joinTask } from '../tasks/frame-runtime.js';
import { defineTask } from '../tasks/runtime.js';
import { taskAwait } from '../tasks/resources.js';
import {
	currentInteraction,
	runCompiledComponentInteraction,
	runComponentInteraction,
	runDirectCompiledComponentInteraction,
	traceInteractionPhase,
	type InteractionScope
} from './execution.js';

describe('component interactions', () => {
	it('runs compiled interactions without a task frame when tracing is disabled', () => {
		const owner = createFrameworkFixtureComponentInstance(() => () => null, {});
		let generationReads = 0;
		const result = runDirectCompiledComponentInteraction(
			owner,
			'event',
			() => ++generationReads,
			'interactive',
			() => {
				expect(currentInteraction()).toBeUndefined();
				return 42;
			}
		);

		expect(result).toBe(42);
		expect(generationReads).toBe(0);
		owner.unmount();
	});

	it('does not require a task owner for a closed untraced compiled interaction', () => {
		const owner = {
			id: 'closed-compiled-owner',
			type: function ClosedCompiledOwner() {},
			mounted: true,
			parent: undefined,
			ambientContexts: undefined,
			contexts: new Map<symbol, unknown>()
		};

		expect(
			runDirectCompiledComponentInteraction(owner as never, 'event', 1, 'interactive', () => 42)
		).toBe(42);
	});

	it('accepts a root-proven disabled trace lane without resolving component logging', () => {
		const owner = {
			id: 'root-untraced-owner',
			type: function RootUntracedOwner() {},
			mounted: true,
			parent: undefined,
			ambientContexts: undefined,
			get contexts(): never {
				throw new Error('disabled root lane resolved component logging');
			}
		};

		expect(
			runDirectCompiledComponentInteraction(
				owner as never,
				'event',
				1,
				'interactive',
				() => 42,
				undefined,
				false
			)
		).toBe(42);
	});

	it('retains observable interaction semantics for trace-enabled closed handlers', async () => {
		const events: LogEvent[] = [];
		const logger: Logger = {
			isEnabled: (level) => level === 'trace',
			log: (event) => events.push(event)
		};
		const parent = createFrameworkFixtureComponentInstance(function Parent(this: Component<{}>) {
			this.setContext(LoggerContext, logger);
			return () => null;
		}, {});
		const owner = createFrameworkFixtureComponentInstance(() => () => null, {}, parent);
		let scope: InteractionScope | undefined;

		await runDirectCompiledComponentInteraction(
			owner,
			'event',
			1,
			'interactive',
			() => {
				expect(currentInteraction()).toBeDefined();
			},
			(value) => {
				scope = value;
			}
		);

		expect(scope).toBeDefined();
		expect(events.map((event) => (event.data as Record<string, unknown>).phase)).toEqual([
			'started',
			'settled'
		]);
		parent.unmount();
	});

	it('materializes a structural frame when a compiled handler starts a task', async () => {
		const owner = createFrameworkFixtureComponentInstance(() => () => null, {});
		let generationReads = 0;
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const child = defineTask({}, () => gate);
		let settled = false;
		const interaction = runDirectCompiledComponentInteraction(
			owner,
			'event',
			() => ++generationReads,
			'interactive',
			() => {
				void child();
			}
		);

		expect(interaction).toBeInstanceOf(Promise);
		expect(generationReads).toBe(1);
		void Promise.resolve(interaction).then(() => {
			settled = true;
		});
		await Promise.resolve();
		expect(settled).toBe(false);
		release();
		await interaction;
		expect(settled).toBe(true);
		owner.unmount();
	});

	it('keeps compiled interactions metadata-free when tracing is disabled', async () => {
		const owner = createFrameworkFixtureComponentInstance(() => () => null, {});
		let traceScopeObserved = false;
		let release!: () => void;
		const joined = new Promise<void>((resolve) => {
			release = resolve;
		});
		let settled = false;
		const interaction = runCompiledComponentInteraction(
			owner,
			'event',
			1,
			'interactive',
			new AbortController(),
			() => {
				expect(currentInteraction()).toBeUndefined();
				joinTask(joined);
			},
			() => {
				traceScopeObserved = true;
			}
		).then(() => {
			settled = true;
		});

		await Promise.resolve();
		expect(settled).toBe(false);
		expect(traceScopeObserved).toBe(false);
		release();
		await interaction;
		owner.unmount();
	});

	it('aggregates work joined synchronously by an interaction host', async () => {
		const owner = createFrameworkFixtureComponentInstance(() => () => null, {});
		let release!: () => void;
		const joined = new Promise<void>((resolve) => {
			release = resolve;
		});
		let settled = false;
		const interaction = runComponentInteraction(
			owner,
			'form',
			1,
			'interactive',
			new AbortController(),
			() => {
				expect(currentInteraction()?.owner).toBe(owner);
				joinTask(joined);
			}
		).then(() => {
			settled = true;
		});

		await Promise.resolve();
		expect(settled).toBe(false);
		release();
		await interaction;
		expect(settled).toBe(true);
		owner.unmount();
	});

	it('restores joined ownership after compiler-lowered awaits', async () => {
		const owner = createFrameworkFixtureComponentInstance(() => () => null, {});
		const controller = new AbortController();
		let releaseJoined!: () => void;
		const joined = new Promise<void>((resolve) => {
			releaseJoined = resolve;
		});
		let continuationReached = false;
		let settled = false;
		const interaction = runComponentInteraction(
			owner,
			'invoked',
			1,
			'normal',
			controller,
			async () => {
				await taskAwait(controller.signal, Promise.resolve());
				expect(currentInteraction()?.owner).toBe(owner);
				continuationReached = true;
				joinTask(joined);
			}
		).then(() => {
			settled = true;
		});

		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(continuationReached).toBe(true);
		expect(settled).toBe(false);
		releaseJoined();
		await interaction;
		expect(settled).toBe(true);
		owner.unmount();
	});

	it('cancels unsettled host work when its component is disposed', async () => {
		const owner = createFrameworkFixtureComponentInstance(() => () => null, {});
		const never = new Promise<void>(() => undefined);
		const interaction = runComponentInteraction(
			owner,
			'event',
			1,
			'interactive',
			new AbortController(),
			() => never
		);

		owner.unmount();
		await expect(interaction).rejects.toBeInstanceOf(TaskCancellation);
	});

	it('attaches function-defined task descendants to an interaction root', async () => {
		const owner = createFrameworkFixtureComponentInstance(() => () => null, {});
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const child = defineTask({}, () => gate);
		let settled = false;
		const interaction = runComponentInteraction(
			owner,
			'event',
			1,
			'interactive',
			new AbortController(),
			() => {
				void child();
			}
		).then(() => {
			settled = true;
		});

		await Promise.resolve();
		expect(settled).toBe(false);
		release();
		await interaction;
		expect(settled).toBe(true);
		owner.unmount();
	});

	it('traces interaction start, feedback, and structural settlement with one operation id', async () => {
		const events: LogEvent[] = [];
		const logger: Logger = {
			isEnabled: (level) => level === 'trace',
			log: (event) => events.push(event)
		};
		const parent = createFrameworkFixtureComponentInstance(function Parent(this: Component<{}>) {
			this.setContext(LoggerContext, logger);
			return () => null;
		}, {});
		const owner = createFrameworkFixtureComponentInstance(() => () => null, {}, parent);
		let scope: InteractionScope | undefined;

		await runComponentInteraction(
			owner,
			'event',
			3,
			'interactive',
			new AbortController(),
			(interaction) => {
				scope = interaction;
				traceInteractionPhase(scope, 'feedback-committed');
			}
		);

		const traces = events.map((event) => event.data as Record<string, unknown>);
		expect(traces.map((trace) => trace.phase)).toEqual([
			'started',
			'feedback-committed',
			'settled'
		]);
		expect(new Set(traces.map((trace) => trace.operationId))).toEqual(
			new Set([`interaction:${scope!.id}`])
		);
		expect(traces[2]!.attributes).toEqual({ outcome: 'success' });
		parent.unmount();
	});
});
import '../runtime/contexts.js';
import '../runtime/component-tasks.js';
