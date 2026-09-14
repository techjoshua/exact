import { expect, it } from 'vitest';
import { markerPair } from '../markers.js';
import { createSsrContext } from './context.js';

it('drains the opening marker before rendering children and drains the closing marker before completion', async () => {
	const context = createSsrContext({ markers: true });
	const writes: string[] = [];
	let release!: () => void;
	let drain = new Promise<void>((resolve) => {
		release = resolve;
	});
	let started = false;
	let closeReached!: () => void;
	const closing = new Promise<void>((resolve) => {
		closeReached = resolve;
	});
	let releaseClose!: () => void;
	context.writerSink = {
		write(html) {
			writes.push(html);
			if (html === '<!--/i:row-->') {
				drain = new Promise<void>((resolve) => {
					releaseClose = resolve;
				});
				closeReached();
			}
		},
		ready() {
			return drain;
		},
		flush() {}
	};
	const rendered = markerPair(context, 'item:row', () => {
		started = true;
		drain = Promise.resolve();
		return 'content';
	});
	expect(writes).toEqual(['<!--i:row-->']);
	expect(started).toBe(false);
	let completed = false;
	const completion = Promise.resolve(rendered).then((value) => {
		completed = true;
		return value;
	});
	release();
	await closing;
	expect(completed).toBe(false);
	releaseClose();
	expect(await completion).toBe('');
	expect(writes).toEqual(['<!--i:row-->', 'content', '<!--/i:row-->']);
});

it('flushes before awaiting a child and does not publish a closing marker after its failure', async () => {
	const context = createSsrContext({ markers: true });
	const writes: string[] = [];
	const reasons: string[] = [];
	context.writerSink = {
		write(html) {
			writes.push(html);
		},
		ready() {},
		flush(reason) {
			reasons.push(reason);
		}
	};
	const failure = new Error('child failed');
	await expect(markerPair(context, '', () => Promise.reject(failure))).rejects.toBe(failure);
	expect(reasons).toEqual(['await']);
	expect(writes).toEqual(['<!--x-->']);
});

it('observes pending child settlement when flushing fails', async () => {
	const context = createSsrContext({ markers: true });
	const failure = new Error('transport failed');
	let settle!: () => void;
	const child = new Promise<string>((resolve) => {
		settle = () => resolve('late');
	});
	const writes: string[] = [];
	context.writerSink = {
		write(html) {
			writes.push(html);
		},
		ready() {},
		flush() {
			throw failure;
		}
	};
	const rendered = markerPair(context, '', () => child);
	settle();
	await expect(rendered).rejects.toBe(failure);
	expect(writes).toEqual(['<!--x-->']);
});
