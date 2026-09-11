import {
	createPreparedServerComponentReference,
	createPreparedServerRenderProgram,
	prepareCompiledRenderProgram,
	type ExactPreparedServerChildRange
} from '@exactjs/core/framework/server-render-structure';
import { describe, expect, it } from 'vitest';
import { ServerCard } from '../component-rendering.fixtures.test.js';
import { createSsrContext } from './context.js';
import { prepareDirectScheduledSsrComponentReferences } from './direct-component-scheduling.js';
import { SsrOperationTarget } from './operation-target.js';
import { renderChildren } from './children.js';
import { readServerComponentReference } from './server-component-reference.js';

describe('shared SSR operation target', () => {
	it.each([false, true])(
		'unwinds an unowned program after a child failure (pending: %s)',
		async (pending) => {
			const context = createSsrContext({});
			const failure = new Error('child failed');
			const target = new SsrOperationTarget(context, undefined, {}, false, () => {
				if (pending) return Promise.reject(failure);
				throw failure;
			});
			const program = createPreparedServerRenderProgram(
				prepareCompiledRenderProgram({
					version: 1,
					id: 'unowned-document',
					namespace: 'html',
					ssrHost: 'html',
					ssr(operations, _context, _invocation, output) {
						const pending = operations.keyedChild(output, 'child');
						return pending instanceof Promise ? pending.then(() => output) : output;
					}
				}),
				[]
			);
			await expect(
				Promise.resolve().then(() => target.renderPreparedServerProgram(program))
			).rejects.toBe(failure);
			expect(context.hostStack).toEqual([]);
		}
	);

	it('does not evaluate synchronous props during scheduled sibling preparation', () => {
		let reads = 0;
		const issued = createPreparedServerComponentReference(
			ServerCard,
			{
				get title() {
					reads++;
					return 'Ready';
				}
			},
			'child'
		);
		const reference = readServerComponentReference(issued);
		if (!reference) throw new Error('Expected an issued server component');
		expect(
			prepareDirectScheduledSsrComponentReferences(
				createSsrContext({}),
				['<section>', [], reference, '</section>'],
				undefined,
				{}
			)
		).toBeUndefined();
		expect(reads).toBe(0);
	});

	it('retains item markers for server-only compiled external scripts', async () => {
		const context = createSsrContext({ markers: true });
		const target = new SsrOperationTarget(context, undefined, {}, false, renderChildren);
		const program = createPreparedServerRenderProgram(
			prepareCompiledRenderProgram({
				version: 1,
				id: 'external-script',
				namespace: 'html',
				ssrHost: 'script',
				ssr(operations, _context, _invocation, output) {
					operations.static(output, '<script src="/app.js"></script>');
					return output;
				}
			}),
			[]
		);
		const html = await target.renderDirectServerKeyedChild({ key: '/app.js', value: program });
		expect(html).toContain('<script src="/app.js"></script>');
		expect(html).toMatch(/^<!--/);
		expect(html).toMatch(/-->$/);
	});
	it('omits stable operation identity from compiler-direct child ranges', () => {
		const context = createSsrContext({ markers: true });
		const target = new SsrOperationTarget(context, undefined, {}, false, (_context, children) =>
			children.join('')
		);

		expect(
			target.renderDirectServerChildRange({
				value: 'ready',
				markerId: 'x-stable-operation-identity',
				mayReplaceSubtree: true
			} as ExactPreparedServerChildRange)
		).toBe('<!--x-->ready<!--/x-->');
	});

	it('uses the compiler-prepared element itself as the keyed row boundary', () => {
		const context = createSsrContext({ markers: true });
		const target = new SsrOperationTarget(context, undefined, {}, false, (_context, children) =>
			children.join('')
		);
		const program = createPreparedServerRenderProgram(
			prepareCompiledRenderProgram({
				version: 1,
				id: 'row',
				namespace: 'html',
				ssr(operations, ssrContext, _invocation, output) {
					operations.begin(ssrContext, 1, 0, 16, 16);
					operations.static(output, '<span>row</span>');
					return output;
				}
			}),
			[]
		);

		expect(target.renderDirectServerKeyedChild({ key: 'incident-101', value: program })).toBe(
			'<span>row</span>'
		);
	});
});
