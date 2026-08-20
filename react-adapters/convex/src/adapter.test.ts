/* eslint-disable @typescript-eslint/no-explicit-any -- This test intentionally models external, private, or invalid values that production contracts reject. */
import { flushSync } from '@exactjs/reactive';
import { describe, expect, it } from 'vitest';
import { createConvexQuery, type ConvexClient, type ConvexWatch } from './index.js';

describe('@exactjs/convex', () => {
	it('bridges Convex watchQuery without importing its React binding', () => {
		let value: number | undefined = undefined;
		let notify = () => {};
		const watch: ConvexWatch<number> = {
			localQueryResult: () => value,
			onUpdate(callback) {
				notify = callback;
				return () => {};
			}
		};
		const client: ConvexClient = { watchQuery: () => watch as ConvexWatch<any> };
		const source = createConvexQuery<number>(client, 'counter');
		value = 4;
		notify();
		flushSync();
		expect(source.value.get()).toBe(4);
	});
});
