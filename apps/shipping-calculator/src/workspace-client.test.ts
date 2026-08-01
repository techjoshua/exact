/** @vitest-environment jsdom */

import { createExactClient, hydrateClientIslands } from '@exactjs/hydrate';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CalculatorWorkspace } from '../.exact/App.exact.client.js';
import { exactHydrationRegistration } from '../.exact/hydration-registration.js';
import { emptyInitialModel, normalizeDraft, defaultDraft } from './model.js';

describe('shipping client workspace', () => {
	beforeEach(() => {
		localStorage.clear();
		document.body.innerHTML = '';
	});

	it('runs its request task and reruns after a form input changes', async () => {
		const fetch = successfulActionFetch();
		const request = normalizeDraft(defaultDraft);
		const initial = emptyInitialModel(defaultDraft, request, false);
		const { client, root } = mountWorkspace(initial, fetch);

		await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
		const initialCalls = fetch.mock.calls.length;

		const destination = root.querySelector<HTMLInputElement>('input[name="destinationZip"]');
		expect(destination).not.toBeNull();
		destination!.value = '97209';
		destination!.dispatchEvent(new InputEvent('input', { bubbles: true }));
		await vi.waitFor(() => expect(fetch.mock.calls.length).toBeGreaterThan(initialCalls));
		client.dispose();
	});

	it('replaces stale transport results with a visible retryable failure', async () => {
		const fetch = vi.fn(async () => {
			throw new Error('transport offline');
		});
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
		const { client } = mountWorkspace(initial, fetch);

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
		client.dispose();
	});

	it('discards superseded child-task results without an application revision fence', async () => {
		const pending: PendingActionResponse[] = [];
		const fetch = vi.fn((_input: unknown, init: { body: string }) => {
			return new Promise((resolve) => {
				pending.push({
					request: JSON.parse(init.body) as ActionRequest,
					resolve
				});
			});
		});
		const request = normalizeDraft(defaultDraft);
		const initial = emptyInitialModel(defaultDraft, request, false);
		const { client, root } = mountWorkspace(initial, fetch);

		await vi.waitFor(() => expect(pending).toHaveLength(2), { timeout: 2_000 });
		const destination = root.querySelector<HTMLInputElement>('input[name="destinationZip"]')!;
		destination.value = '97209';
		destination.dispatchEvent(new InputEvent('input', { bubbles: true }));
		await vi.waitFor(() => expect(pending).toHaveLength(4), { timeout: 2_000 });

		for (const response of pending.slice(2))
			response.resolve(actionResponse(response.request, 'CURRENT'));
		await vi.waitFor(() => expect(document.body.textContent).toContain('CURRENT'));

		for (const response of pending.slice(0, 2))
			response.resolve(actionResponse(response.request, 'STALE'));
		await Promise.resolve();
		await Promise.resolve();
		expect(document.body.textContent).not.toContain('STALE');
		client.dispose();
	});
});

type ActionRequest = {
	id: string;
	payload: { dependencies: unknown[] };
};

type PendingActionResponse = {
	request: ActionRequest;
	resolve(value: ReturnType<typeof actionResponse>): void;
};

function mountWorkspace(
	initial: ReturnType<typeof emptyInitialModel>,
	fetch: ReturnType<typeof vi.fn>
) {
	const root = document.createElement('main');
	const boundary = document.createElement('div');
	boundary.setAttribute('data-exact-client-boundary', 'workspace');
	boundary.setAttribute('data-exact-client-name', 'CalculatorWorkspace');
	boundary.setAttribute('data-exact-client-props', JSON.stringify({ props: { initial } }));
	root.append(boundary);
	document.body.append(root);
	const client = createExactClient(root, {
		endpoint: '/__exact',
		continuations: exactHydrationRegistration.continuations,
		fetch: fetch as never,
		batch: false,
		stream: false
	});
	hydrateClientIslands(
		root,
		{ CalculatorWorkspace },
		{ componentDomain: client.domain, batch: false, stream: false }
	);
	return { client, root };
}

function successfulActionFetch() {
	return vi.fn(async (_input: unknown, init: { body: string }) => {
		const request = JSON.parse(init.body) as ActionRequest;
		return actionResponse(request, String(request.payload.dependencies[0]).toUpperCase());
	});
}

function actionResponse(request: ActionRequest, providerName: string) {
	const dependencies = request.payload.dependencies;
	const value =
		dependencies.length === 1
			? { status: 'unavailable' }
			: {
					version: 1,
					providerId: dependencies[0],
					providerName,
					status: 'success',
					quotes: [
						{
							version: 1,
							id: `${providerName}-quote`,
							providerId: dependencies[0],
							providerName,
							serviceCode: providerName,
							serviceName: providerName,
							currency: 'USD',
							basePriceCents: 100,
							totalPriceCents: 100,
							delivery: { guaranteed: false },
							charges: [],
							features: [],
							compatible: true,
							warnings: [],
							source: 'mock'
						}
					]
				};
	return {
		ok: true,
		status: 200,
		async json() {
			return { ok: true, type: 'invoke', id: request.id, value };
		}
	};
}
