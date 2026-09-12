import { expect, it } from 'vitest';
import {
	bindRequestRenderScheduler,
	inheritRequestRenderScheduler,
	requestRenderScheduler
} from './render-scheduling.js';

it('isolates requests and preserves the first policy across derived cancellation lifetimes', () => {
	const first = new AbortController().signal;
	const second = new AbortController().signal;
	const derived = new AbortController().signal;
	const left = () => undefined;
	const right = () => undefined;
	bindRequestRenderScheduler(first, left);
	bindRequestRenderScheduler(second, right);
	inheritRequestRenderScheduler(first, derived);
	inheritRequestRenderScheduler(second, derived);
	expect(requestRenderScheduler(first)).toBe(left);
	expect(requestRenderScheduler(second)).toBe(right);
	expect(requestRenderScheduler(derived)).toBe(left);
	expect(requestRenderScheduler(new AbortController().signal)).toBeUndefined();
});
