import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { runInNewContext } from 'node:vm';
import { collectBrowserErrors, observedRootFactorySource } from './browser-errors.mjs';

test('consumes expected console identities once and retains every other browser fault', async () => {
	const page = new EventEmitter();
	const capture = collectBrowserErrors(page);
	const expected = new Error('expected');
	const unrelated = new Error('unrelated');
	const queue = [expected];
	const message = (text, value) => ({
		type: () => 'error',
		text: () => text,
		args: () => [
			null,
			{
				evaluate: async (predicate) =>
					runInNewContext('(' + predicate.toString() + ')(value)', {
						value,
						window: { parent: { exactExpectedConsoleErrors: queue } }
					})
			}
		]
	});
	page.emit('console', message('verified', expected));
	page.emit('console', message('duplicate', expected));
	page.emit('console', message('unrelated', unrelated));
	page.emit('console', { type: () => 'error', text: () => 'no identity', args: () => [] });
	page.emit('pageerror', new Error('page failure'));
	await capture.flush();
	assert.deepEqual(capture.errors, ['page failure', 'duplicate', 'unrelated', 'no identity']);
	await capture.flush();
	assert.equal(capture.errors.length, 4);
});

test('preserves root and hydration arguments, callbacks, and their original receiver', () => {
	const realm = { window: { parent: {} } };
	realm.window.parent = realm.window;
	const factory = runInNewContext(observedRootFactorySource() + '\nobservedRoot', realm);
	const primary = new Error('primary');
	let receiver;
	const options = {
		identifierPrefix: 'owned',
		onUncaughtError(error) {
			assert.equal(error, primary);
			receiver = this;
		}
	};
	for (const index of [1, 2]) {
		const container = {};
		const children = {};
		const original = index === 1 ? [container, options] : [container, children, options];
		const actual = factory((...args) => args, index)(...original);
		assert.equal(actual[0], container);
		if (index === 2) assert.equal(actual[1], children);
		assert.equal(actual[index].identifierPrefix, 'owned');
		actual[index].onUncaughtError(primary, { componentStack: '' });
		assert.equal(receiver, options);
	}
	assert.equal(realm.window.exactExpectedConsoleErrors.length, 2);
});

test('retains errors when browser handles can no longer establish their identity', async () => {
	const page = new EventEmitter();
	const capture = collectBrowserErrors(page);
	page.emit('console', {
		type: () => 'error',
		text: () => 'unverified',
		args: () => [
			null,
			{
				evaluate: async () => {
					throw new Error('closed context');
				}
			}
		]
	});
	await capture.flush();
	assert.deepEqual(capture.errors, ['unverified']);
});

// This journey is source-only so build-script tests never load compiled framework packages.
const { verifySharedComposition } = await import(
	'../../packages/component-composition-corpus/test-support/shared-composition-journey.mjs'
);
for (const fault of [undefined, 'unrelated', 'cleanup']) {
	test(`shared composition browser oracle detects ${fault ?? 'healthy behavior'}`, async () => {
		let props;
		let unmounts = 0;
		const instance = { scope: { active: true } };
		const state = { count: 1 };
		const affected = { textContent: '1' };
		const unrelated = { textContent: '10' };
		const container = {
			childNodes: [affected, unrelated],
			querySelector: (selector) => (selector.includes('"affected"') ? affected : unrelated)
		};
		const view = {
			container,
			root: {
				instance,
				state: () => state,
				async setState({ count }) {
					state.count = count;
					affected.textContent = String(props.observe('affected', count));
					if (fault === 'unrelated') props.observe('unrelated', 10);
				}
			},
			async unmount() {
				unmounts++;
				props.disposed();
				instance.scope.active = false;
				if (fault !== 'cleanup') container.childNodes = [];
			}
		};
		const builder = {
			props(value) {
				props = value;
				return this;
			},
			context() {
				return this;
			},
			async mount() {
				props.observe('affected', 1);
				props.observe('unrelated', 10);
				props.mounted();
				return view;
			}
		};
		const run = verifySharedComposition({
			SharedComposition: {},
			ErrorContext: {},
			createErrorContext: () => ({ errors: [] }),
			testComponent: () => builder
		});
		if (fault)
			await assert.rejects(
				run,
				fault === 'unrelated' ? /unrelated consumer replay/ : /empty disposed container/
			);
		else
			assert.deepEqual(await run, {
				updates: [2, 3],
				sameInstance: true,
				sameState: true,
				sameDOM: true,
				unrelatedReplay: false,
				mounts: 1,
				disposals: 1,
				frameworkErrors: 0
			});
		assert.equal(unmounts, 1);
	});
}
