import { createPreparedServerComponentReference } from '@exactjs/core/framework/server-render-structure';
import { expect, it } from 'vitest';
import { renderChildren } from './children.js';
import { createSsrContext } from './context.js';
import {
	ProgramOwnerTree,
	readProgramOwners,
	resetProgramOwners
} from './program-owner.fixtures.test.js';

it.each([false, true])(
	'isolates component owners across suspended requests and sink rejection=%s',
	async (rejectSink) => {
		resetProgramOwners();
		const failure = new Error('request sink failed');
		const requests = ['left', 'right'].map((name) => {
			const options = { markers: false };
			const context = createSsrContext(options);
			let html = '';
			let rejected = false;
			context.writerSink = {
				write(value) {
					html += value;
				},
				ready() {
					if (rejectSink && name === 'left' && !rejected && html.includes('left:nested')) {
						rejected = true;
						return Promise.reject(failure);
					}
					return Promise.resolve();
				},
				flush() {}
			};
			const rendered = Promise.resolve().then(() =>
				renderChildren(
					context,
					[createPreparedServerComponentReference(ProgramOwnerTree, { name })],
					undefined,
					options
				)
			);
			return { name, context, rendered, read: () => html };
		});
		const results = await Promise.allSettled(requests.map((request) => request.rendered));
		for (const [index, request] of requests.entries()) {
			const result = results[index]!;
			if (rejectSink && request.name === 'left') {
				expect(result).toEqual({ status: 'rejected', reason: failure });
			} else {
				expect(result.status).toBe('fulfilled');
				const name = request.name;
				expect(request.read()).toBe(
					`<section><span>${name}</span><span>${name}:nested</span><span>${name}</span></section>`
				);
			}
			expect(request.context.hostStack).toEqual([]);
		}
		const owners = readProgramOwners();
		expect(owners.started).toContain('left:nested');
		expect(owners.started).toContain('right:nested');
		expect(owners.disposed.sort()).toEqual(owners.started.sort());
	}
);
