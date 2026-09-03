import {
	createPreparedServerRenderProgram,
	prepareCompiledRenderProgram,
	type ExactPreparedServerChildRange
} from '@exactjs/core/framework/server-render-structure';
import { describe, expect, it } from 'vitest';
import { createSsrContext } from './context.js';
import { SyncSsrOperationTarget } from './sync-operation-target.js';

describe('synchronous SSR operation target', () => {
	it('omits stable operation identity from compiler-direct child ranges', () => {
		const context = createSsrContext({ markers: true });
		const target = new SyncSsrOperationTarget(context, undefined, false, (_context, children) =>
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

	it('uses the stable key without a request-global id for compiler-prepared rows', () => {
		const context = createSsrContext({ markers: true });
		const target = new SyncSsrOperationTarget(context, undefined, false, (_context, children) =>
			children.join('')
		);
		const program = createPreparedServerRenderProgram(
			prepareCompiledRenderProgram({
				version: 8,
				id: 'row',
				namespace: 'html',
				ssr(operations, ssrContext) {
					const output = operations.output();
					operations.begin(ssrContext, 1, 0, 16, 16);
					operations.static(output, '<span>row</span>');
					return output;
				}
			}),
			[]
		);

		expect(target.renderDirectServerKeyedChild({ key: 'incident-101', value: program })).toBe(
			'<!--i:incident-101--><span>row</span><!--/i:incident-101-->'
		);
	});
});
