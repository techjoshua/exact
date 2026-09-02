import type { ExactPreparedServerChildRange } from '@exactjs/core/framework/server-render-structure';
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
		).toBe('<!--exact:dynamic:-->ready<!--/exact:dynamic:-->');
	});
});
