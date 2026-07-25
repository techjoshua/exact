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
});
