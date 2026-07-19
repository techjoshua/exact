/**
 * @vitest-environment jsdom
 */
import { act, createElement } from '@exact/react-compat';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from './client.js';

let ErrorBoundary: any;

beforeAll(async () => {
	({ ErrorBoundary } = await import('../fixtures/phase4.mjs'));
});

describe('React compatibility Phase 4 package fixtures', () => {
	it('runs react-error-boundary capture, fallback, reset-key recovery, and cleanup', async () => {
		const onError = vi.fn();
		const onReset = vi.fn();
		function Bomb(props: { fail: boolean }) {
			if (props.fail) throw new Error('fixture failed');
			return createElement('span', null, 'recovered');
		}
		function Fallback(props: { error: Error }) {
			return createElement('strong', null, props.error.message);
		}
		const view = (fail: boolean) =>
			createElement(
				ErrorBoundary,
				{
					FallbackComponent: Fallback,
					onError,
					onReset,
					resetKeys: [fail]
				},
				createElement(Bomb, { fail })
			);

		const container = document.createElement('div');
		const root = createRoot(container);
		await act(() => root.render(view(true)));
		expect(container.textContent).toBe('fixture failed');
		expect(onError).toHaveBeenCalledTimes(1);
		await act(() => root.render(view(false)));
		expect(container.textContent).toBe('recovered');
		expect(onReset).toHaveBeenCalledTimes(1);
		root.unmount();
		expect(container.textContent).toBe('');
	});
});
