import {
	currentEffectScope,
	registerEffectScopeCleanup
} from '@exactjs/reactive/framework/runtime';
import { expect, it } from 'vitest';
import { type Component } from './index.js';
import { createFrameworkFixtureComponentInstance } from './testing.js';
import './runtime/lifecycle.js';
import { executeTaskFrame } from './tasks/frame-runtime.js';
import { ownTaskResource } from './tasks/resources.js';

it.each([undefined, null, new Error('first failure')])(
	'retains the first task cleanup value (%s)',
	async (primary) => {
		const order: string[] = [];
		const outcome = await executeTaskFrame({}, (task) => {
			task.cleanup(() => {
				order.push('later');
				throw new Error('later cleanup');
			});
			task.cleanup(() => {
				order.push('first');
				throw primary;
			});
			ownTaskResource(task.signal, {}, () => {
				order.push('resource');
				throw new Error('resource cleanup');
			});
		}).then(
			() => ({ failed: false, error: undefined }),
			(error: unknown) => ({ failed: true, error })
		);
		expect(order).toEqual(['first', 'later', 'resource']);
		expect(outcome.failed).toBe(true);
		expect(outcome.error).toBe(primary);
	}
);

it.each([undefined, null, new Error('first failure')])(
	'retains the first component cleanup value (%s)',
	(primary) => {
		const order: string[] = [];
		const instance = createFrameworkFixtureComponentInstance(function Owner(this: Component<{}>) {
			registerEffectScopeCleanup(currentEffectScope()!, () => {
				order.push('scope');
				throw primary;
			});
			this.onUnmount(() => {
				order.push('lifecycle');
				throw new Error('later lifecycle');
			});
			return () => null;
		}, {});
		let failed = false;
		let failure: unknown;
		try {
			instance.unmount();
		} catch (error) {
			failed = true;
			failure = error;
		}
		expect(order).toEqual(['scope', 'lifecycle']);
		expect(failed).toBe(true);
		expect(failure).toBe(primary);
		expect(() => instance.unmount()).not.toThrow();
	}
);
