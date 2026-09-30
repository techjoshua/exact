import { renderToString } from '@exactjs/ssr';
import { describe, expect, it } from 'vitest';
import {
	customDataServerChartRoot,
	matrixServerChartRoot,
	valuesServerChartRoot,
	localizedServerChartRoot,
	nestedServerChartRoot,
	serverChartRoot
} from './test-support/chart-server.fixtures.js';

describe('native chart server output', () => {
	it('renders one accessible generated matrix with correctly formatted totals', async () => {
		const { html } = await renderToString(matrixServerChartRoot(), { markers: false });
		expect(html.match(/<table/g)).toHaveLength(1);
		expect(html).not.toContain('<details');
		expect(html).toContain('<th scope="col">Framework</th>');
		expect(html).toContain('<th scope="row">A</th>');
		expect(html).toContain('<td>3.250</td>');
	});
	it('keeps named statistics separate from the plotted primary value', async () => {
		const { html } = await renderToString(valuesServerChartRoot(), { markers: false });
		expect(html.match(/<table/g)).toHaveLength(1);
		expect(html).toContain('View percentiles');
		expect(html).toContain('<td>8</td>');
		expect(html).toContain('<td>2</td>');
		expect(html).toContain('<td>15</td>');
	});

	it('gives a supplied data view precedence over table configuration', async () => {
		const { html } = await renderToString(customDataServerChartRoot(), { markers: false });
		expect(html.match(/<table/g)).toHaveLength(1);
		expect(html.match(/<details/g)).toHaveLength(1);
		expect(html).toContain('View measurements');
		expect(html).toContain('<td>12</td>');
		expect(html).not.toContain('View chart data');
		expect(html).toContain('<svg');
	});

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
