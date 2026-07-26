/** @vitest-environment jsdom */

import { hydrateClientIslands } from '@exactjs/hydrate';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CalculatorWorkspace } from '../.exact/App.exact.client.js';
import { emptyInitialModel, normalizeDraft, defaultDraft } from './model.js';
import { installExactClient } from './client-runtime.js';

describe('shipping client workspace', () => {
	beforeEach(() => {
		localStorage.clear();
		document.body.innerHTML = '';
	});

	it('runs its request task and reruns after a form input changes', async () => {
		const invokeAction = vi.fn(async () => ({ ok: true, state: undefined, patches: [] }));
		installExactClient({ invokeAction } as never);
		const request = normalizeDraft(defaultDraft);
		const initial = emptyInitialModel(defaultDraft, request, false);
		const boundary = document.createElement('div');
		boundary.setAttribute('data-exact-client-boundary', 'workspace');
		boundary.setAttribute('data-exact-client-name', 'CalculatorWorkspace');
		boundary.setAttribute('data-exact-client-props', JSON.stringify({ props: { initial } }));
		document.body.append(boundary);

		hydrateClientIslands(document.body, { CalculatorWorkspace }, { batch: false, stream: false });
		await vi.waitFor(() => expect(invokeAction).toHaveBeenCalled());
		const initialCalls = invokeAction.mock.calls.length;

		const destination = document.querySelector<HTMLInputElement>('input[name="destinationZip"]');
		expect(destination).not.toBeNull();
		destination!.value = '97209';
		destination!.dispatchEvent(new InputEvent('input', { bubbles: true }));

		await vi.waitFor(() => expect(invokeAction.mock.calls.length).toBeGreaterThan(initialCalls));
	});

	it('replaces stale transport results with a visible retryable failure', async () => {
		const invokeAction = vi.fn(async () => {
			throw new Error('transport offline');
		});
		installExactClient({ invokeAction } as never);
		const request = normalizeDraft(defaultDraft);
		const initial = emptyInitialModel(defaultDraft, request, false);
		initial.providers = [
			{
				version: 1,
				providerId: 'doop',
				providerName: 'DOOP',
				status: 'success',
				quotes: []
			}
		];
		const boundary = document.createElement('div');
		boundary.setAttribute('data-exact-client-boundary', 'workspace');
		boundary.setAttribute('data-exact-client-name', 'CalculatorWorkspace');
		boundary.setAttribute('data-exact-client-props', JSON.stringify({ props: { initial } }));
		document.body.append(boundary);

		hydrateClientIslands(document.body, { CalculatorWorkspace }, { batch: false, stream: false });

		await vi.waitFor(
			() =>
				expect(document.querySelector('[role="alert"]')?.textContent).toContain(
					'could not be refreshed'
				),
			{ timeout: 2_000 }
		);
		expect(document.body.textContent).toContain(
			'The carrier request failed before returning a current result'
		);
		expect(document.body.textContent).toContain('Showing rates from 0 sources');
	});
});
