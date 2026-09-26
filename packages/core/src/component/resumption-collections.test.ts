import '../runtime/collections.js';
import { expect, it } from 'vitest';
import { reactive } from '@exactjs/reactive';
import { applyComponentResumption } from './resumption.js';

it.each(['map', 'set'])('restores %s membership before a captured size read', (kind) => {
	const collection = kind === 'map' ? new Map([['a', 1]]) : new Set(['a']);
	const state = reactive<Record<string, unknown>>({ collection });
	expect(() =>
		applyComponentResumption(state, {
			componentId: 'collections',
			values: { collection, 'collection.size': 1 },
			contexts: {},
			settledContinuations: []
		})
	).not.toThrow();
	expect(state.collection).toEqual(collection);
});
