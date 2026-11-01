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
