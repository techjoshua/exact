import { renderToString } from '@exactjs/ssr';
import { describe, expect, it } from 'vitest';
import {
	localizedServerChartRoot,
	nestedServerChartRoot,
	serverChartRoot
} from './chart-server.fixtures.js';

describe('native chart server output', () => {
	it('renders semantic geometry through the server component ABI', async () => {
		const view = await renderToString(serverChartRoot(), { markers: false });
		expect(view.html).toContain('<figure');
		expect(view.html).toContain('Concurrent SSR capacity');
		expect(view.html.indexOf('<figcaption')).toBeGreaterThan(view.html.indexOf('<figure'));
		expect(view.html.indexOf('<figcaption')).toBeLessThan(
			view.html.indexOf('exact-chart__declarations')
		);
		expect(view.html).toContain('<circle');
		expect(view.html).toContain('<table');
		expect(view.html).toContain('6900');
	});

	it('composes behind an opaque native parent boundary', async () => {
		const view = await renderToString(nestedServerChartRoot(), { markers: false });
		expect(view.html).toContain('<main><figure');
		expect(view.html).toContain('<circle');
	});

	it('retains intl projections through synchronous sibling consumption', async () => {
		const view = await renderToString(localizedServerChartRoot(), { markers: false });
		expect(view.html).toContain('exact-chart__axis-labels');
		expect(view.html).toContain('Throughput');
		expect(view.html).toContain('1.234,5');
	});
});
