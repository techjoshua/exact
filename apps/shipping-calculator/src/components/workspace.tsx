import { peek, TaskContext, type Component } from '@exactjs/core';
import { resolveRoute } from '../geography.js';
import { defaultDraft, draftUrl, normalizeDraft } from '../model.js';
import { quoteProvider } from '../providers/registry.js';
import type { InitialModel, ProviderId, RateRequest, ShipmentDraft } from '../types.js';

import { renderWorkspace } from './workspace/view.js';
import type { WorkspaceState } from './workspace/contracts.js';
import { cloneDraft, createWorkspaceInputs, delay } from './workspace/inputs.js';

/** Performs the calculator workspace domain operation. */
export function CalculatorWorkspace(
	this: Component<WorkspaceState>,
	{ initial }: { initial: InitialModel }
) {
	this.state.draft = peek(() => cloneDraft(initial.draft));
	this.state.providers = peek(() => initial.providers);
	this.state.route = peek(() => initial.route);
	this.state.revision = 0;
	this.state.loading = [];
	this.state.error = undefined;
	this.state.sort = 'recommended';
	this.state.enabledFilters = peek(() => [...initial.configuredProviders]);
	this.state.restored = false;

	async function resolveRouteOnServer(
		request: RateRequest,
		_task: TaskContext = TaskContext.server()
	) {
		return resolveRoute(request.originZip5, request.destinationZip5);
	}
	function quoteProviderOnServer(
		id: ProviderId,
		request: RateRequest,
		task: TaskContext = TaskContext.server()
	) {
		return quoteProvider(id, request, task.signal);
	}

	const restoreDraft = () => {
		if (initial.explicitUrlState) return;
		try {
			const saved = localStorage.getItem('parcel-lab:last-shipment');
			if (!saved) return;
			const candidate = { ...defaultDraft, ...JSON.parse(saved) } as ShipmentDraft;
			normalizeDraft(candidate);
			this.state.draft = candidate;
			this.state.restored = true;
			this.state.revision++;
		} catch {
			localStorage.removeItem('parcel-lab:last-shipment');
		}
	};
	restoreDraft();

	const refreshRoute = async (request: RateRequest, _task: TaskContext = TaskContext.client()) => {
		try {
			this.state.route = await resolveRouteOnServer(request);
		} catch {
			this.state.route = { status: 'unavailable' };
			this.state.error = 'The route could not be refreshed. Change an input to retry.';
		}
	};

	const refreshProvider = async (
		id: ProviderId,
		request: RateRequest,
		_task: TaskContext = TaskContext.client()
	) => {
		try {
			const result = await quoteProviderOnServer(id, request);
			this.state.providers = [
				...this.state.providers.filter((item) => item.providerId !== id),
				result
			];
			this.state.loading = this.state.loading.filter((item) => item !== id);
		} catch {
			const previous = this.state.providers.find((item) => item.providerId === id);
			this.state.providers = [
				...this.state.providers.filter((item) => item.providerId !== id),
				{
					version: 1,
					providerId: id,
					providerName: previous?.providerName ?? id.toUpperCase(),
					status: 'error',
					quotes: [],
					error: {
						code: 'unavailable',
						message: 'The carrier request failed before returning a current result'
					}
				}
			];
			this.state.loading = this.state.loading.filter((item) => item !== id);
			this.state.error = 'Some carrier rates could not be refreshed. Change an input to retry.';
		}
	};

	const refreshRates = async (
		_revision: number,
		draft: ShipmentDraft = this.state.draft,
		ids: readonly ProviderId[] = initial.configuredProviders
	) => {
		await delay(450);
		let request;
		try {
			request = normalizeDraft(draft);
			this.state.error = undefined;
		} catch (error) {
			this.state.error = error instanceof Error ? error.message : 'Check the shipment details';
			this.state.loading = [];
			return;
		}
		history.replaceState(null, '', draftUrl(draft, new URL(location.href)));
		this.state.loading = [...ids];
		await Promise.all([refreshRoute(request), ...ids.map((id) => refreshProvider(id, request))]);
		this.state.loading = [];
		if (this.state.providers.some((provider) => provider.status === 'success')) {
			localStorage.setItem('parcel-lab:last-shipment', JSON.stringify(draft));
		}
	};
	void refreshRates(this.state.revision);

	const inputs = createWorkspaceInputs(this.state);
	return () => renderWorkspace(this.state, { initial }, inputs);
}
