import { createServerDynamicComponent } from '@exactjs/core/runtime/dynamic-components';
import { describe, expect, it } from 'vitest';
import { renderToString, renderToStringAsync } from './index.js';

describe('@exactjs/ssr dynamic component boundaries', () => {
	it('publishes an inert marker without reading the client resolver', async () => {
		const vnode = createServerDynamicComponent('fixture:dynamic');
		const sync = renderToString(vnode);
		const async = await renderToStringAsync(vnode);
		expect(sync.html).toContain('exact:dynamic:fixture:dynamic');
		expect(async.html).toBe(sync.html);
	});
});
