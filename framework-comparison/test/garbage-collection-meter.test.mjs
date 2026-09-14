import assert from 'node:assert/strict';
import test from 'node:test';
import { createGarbageCollectionMeter } from '../src/garbage-collection-meter.mjs';

test('unsupported GC is unavailable rather than an observed zero', () => {
	class UnsupportedObserver {
		static supportedEntryTypes = ['measure'];
		constructor() {
			throw new Error('Unsupported observers must not be constructed');
		}
	}
	const meter = createGarbageCollectionMeter(UnsupportedObserver);
	assert.deepEqual(meter.snapshot(), { available: false, count: null, durationMs: null });
	meter.reset();
	meter.close();
});

test('supported GC drains pending records once and resets the observation interval', () => {
	let instance;
	class Observer {
		static supportedEntryTypes = ['gc'];
		pending = [];
		disconnected = false;
		constructor(callback) {
			this.callback = callback;
			instance = this;
		}
		observe(options) {
			assert.deepEqual(options, { entryTypes: ['gc'] });
		}
		takeRecords() {
			return this.pending.splice(0);
		}
		disconnect() {
			this.disconnected = true;
		}
	}
	const meter = createGarbageCollectionMeter(Observer);
	assert.deepEqual(meter.snapshot(), { available: true, count: 0, durationMs: 0 });
	instance.callback({ getEntries: () => [{ duration: 2 }] });
	instance.pending.push({ duration: 3 });
	assert.deepEqual(meter.snapshot(), { available: true, count: 2, durationMs: 5 });
	assert.deepEqual(meter.snapshot(), { available: true, count: 2, durationMs: 5 });
	instance.pending.push({ duration: 7 });
	meter.reset();
	assert.deepEqual(meter.snapshot(), { available: true, count: 0, durationMs: 0 });
	meter.close();
	assert.equal(instance.disconnected, true);
});

test('failed observer setup disconnects and reports unavailable GC', () => {
	let disconnected = false;
	class Observer {
		static supportedEntryTypes = ['gc'];
		observe() {
			throw new Error('Runtime does not implement observation');
		}
		disconnect() {
			disconnected = true;
		}
	}
	const meter = createGarbageCollectionMeter(Observer);
	assert.equal(disconnected, true);
	assert.deepEqual(meter.snapshot(), { available: false, count: null, durationMs: null });
});
