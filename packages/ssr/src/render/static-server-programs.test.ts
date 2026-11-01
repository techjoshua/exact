import {
	createPreparedServerRenderProgram,
	prepareCompiledRenderProgram
} from '@exactjs/core/framework/server-render-structure';
import { renderPreparedSsrProgram } from './render-program.js';
import type { SsrProgramWriterOutput } from './program-writer-output.js';
import {
	ObservedServerComponent,
	resetComponentRenderingFixtureState,
	readComponentRenderingFixtureState
} from '../component-rendering.fixtures.test.js';
import { readServerComponentReference } from './server-component-reference.js';
import { createPreparedServerComponentInputReference } from '@exactjs/core/framework/server-render-structure';
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
			readServerComponentReference(
				createPreparedServerComponentInputReference(StaticServerLeaf, {})
			)!
		);
		return html + remainder;
	}
	const [first, second] = await Promise.all([render('first'), render('second')]);
	expect(first).toContain('fixed first');
	expect(first).not.toContain('second');
	expect(second).toContain('fixed second');
	expect(second).not.toContain('first');
});

it.each(['valid', 'source', 'order'] as const)(
	'owns one complete prepared input sequence and retains the %s guard',
	async (kind) => {
		resetComponentRenderingFixtureState();
		let reads = 0;
		const child = createPreparedServerComponentInputReference(
			ObservedServerComponent,
			{},
			{
				kind: 'reader',
				read() {
					reads++;
					return [];
				}
			}
		);
		const other = createPreparedServerComponentInputReference(ObservedServerComponent, {});
		const invocation = createPreparedServerRenderProgram(
			prepareCompiledRenderProgram({
				version: 4,
				id: 'ordered-input-ownership',
				namespace: 'html',
				targetSlots: [0, 1, 2],
				async ssr(operations, context, current, output) {
					const writer = output as SsrProgramWriterOutput<unknown>;
					writer.preparation = writer.prepareReferences?.(current.eagerValues);
					if (kind === 'order') writer.componentInputPosition = 2;
					let characters = await operations.child(
						context,
						output,
						current.eagerValues[0],
						'first',
						0
					);
					characters = await operations.component(
						context,
						output,
						kind === 'source' ? other : current.eagerValues[1],
						'middle',
						characters
					);
					await operations.child(context, output, current.eagerValues[2], 'last', characters);
					return output;
				}
			}),
			['before', child, child]
		);
		const context = createSsrContext({ markers: false });
		const target = new SsrOperationTarget(
			context,
			undefined,
			{ markers: false },
			false,
			renderChildren
		);
		const result = renderPreparedSsrProgram(context, invocation, target);
		if (kind === 'valid') expect(await result).toBe('before<p>2</p><p>2</p>');
		else
			await expect(result).rejects.toThrow(kind === 'source' ? 'retained source' : 'source order');
		expect(reads).toBe(2);
		expect(readComponentRenderingFixtureState().observedDisposals).toBe(2);
	}
);
