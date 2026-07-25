import { describe, expect, it } from 'vitest';
import { planSuspenseStreamReplacements } from './suspense-streaming.js';

describe('@exactjs/ssr Suspense stream replacement planning', () => {
	it('replaces an independently settled boundary without replacing stable siblings', () => {
		const shell =
			'<h1>Shipping</h1><!--exact:suspense-fallback:1--><i>Loading</i><!--/exact:suspense-fallback:1--><footer>Help</footer>';
		const settled =
			'<h1>Shipping</h1><!--exact:suspense-content:1--><p>Ground</p><!--/exact:suspense-content:1--><footer>Help</footer>';

		expect(planSuspenseStreamReplacements(shell, settled)).toEqual([
			{
				id: 'suspense-fallback:1',
				html: '<!--exact:suspense-content:1--><p>Ground</p><!--/exact:suspense-content:1-->'
			}
		]);
	});

	it('chooses the outer boundary when both an outer and nested boundary changed', () => {
		const shell =
			'<!--exact:suspense-content:1--><!--exact:suspense-fallback:2-->wait<!--/exact:suspense-fallback:2--><!--/exact:suspense-content:1-->';
		const settled =
			'<!--exact:suspense-content:1--><!--exact:suspense-content:2-->ready<!--/exact:suspense-content:2--><b>done</b><!--/exact:suspense-content:1-->';

		expect(planSuspenseStreamReplacements(shell, settled)).toEqual([
			{
				id: 'suspense-content:1',
				html: settled
			}
		]);
	});

	it('falls back to root replacement when content outside Suspense changed', () => {
		const shell =
			'<h1>Before</h1><!--exact:suspense-fallback:1-->wait<!--/exact:suspense-fallback:1-->';
		const settled =
			'<h1>After</h1><!--exact:suspense-content:1-->ready<!--/exact:suspense-content:1-->';

		expect(planSuspenseStreamReplacements(shell, settled)).toBeUndefined();
	});
});
