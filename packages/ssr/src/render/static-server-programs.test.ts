import { createPreparedServerComponentReference } from '@exactjs/core/framework/server-render-structure';
import { expect, it } from 'vitest';
import { renderChildren } from './children.js';
import { createSsrContext } from './context.js';
import { SsrOperationTarget } from './operation-target.js';
import { StaticServerLeaf } from './static-server-programs.fixtures.test.js';

it('keeps target contributions and backpressured output request-local with shared static input', async () => {
	async function render(className: string): Promise<string> {
		const context = createSsrContext({ markers: false });
		context.targetReceiptLayers = [{ props: { className }, consumed: false }];
		let html = '';
		context.writerSink = {
			write(value) {
				html += value;
			},
			ready() {
				return Promise.resolve();
			},
			flush() {}
		};
		const target = new SsrOperationTarget(
			context,
			undefined,
			{ markers: false },
			false,
			renderChildren
		);
		const remainder = await target.renderCompilerClosedRootComponent(
			createPreparedServerComponentReference(StaticServerLeaf, {})
		);
		return html + remainder;
	}
	const [first, second] = await Promise.all([render('first'), render('second')]);
	expect(first).toContain('fixed first');
	expect(first).not.toContain('second');
	expect(second).toContain('fixed second');
	expect(second).not.toContain('first');
});
