import { peek, type Component } from '@exactjs/core';
import { exactClient } from '../client-runtime.js';
import { defaultDraft, draftUrl, normalizeDraft } from '../model.js';
import type { InitialModel, ProviderResult, RouteResult, ShipmentDraft } from '../types.js';

import { renderWorkspace } from './workspace/view.js';
import type { WorkspaceState } from './workspace/contracts.js';
import { cloneDraft, createWorkspaceInputs, delay } from './workspace/inputs.js';

/** Performs the calculator workspace domain operation. */
export function CalculatorWorkspace(
	this: Component<WorkspaceState>,
	props: { initial: InitialModel }
) {
	this.state.draft = peek(() => cloneDraft(props.initial.draft));
	this.state.providers = peek(() => props.initial.providers);
	this.state.route = peek(() => props.initial.route);
	this.state.revision = 0;
	this.state.loading = [];
	this.state.error = undefined;
	this.state.sort = 'recommended';
	this.state.enabledFilters = peek(() => [...props.initial.configuredProviders]);
	this.state.restored = false;

	this.task(() => {
		if (props.initial.explicitUrlState) return;
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
	});

	this.task(this.state.revision, async (_revision, { signal }) => {
		await delay(450, signal);
		let request;
		try {
			request = normalizeDraft(this.state.draft);
			this.state.error = undefined;
		} catch (error) {
			this.state.error = error instanceof Error ? error.message : 'Check the shipment details';
			this.state.loading = [];
			return;
		}
		history.replaceState(null, '', draftUrl(this.state.draft, new URL(location.href)));
		const generation = this.state.revision;
		const ids = props.initial.configuredProviders;
		this.state.loading = [...ids];
		const client = exactClient();
		const routePromise = client.invokeAction('route.resolve', request);
		const providerPromises = ids.map((id) => ({
			id,
			promise: client.invokeAction(`quote.${id}`, request)
		}));
		routePromise
			.then((result) => {
				if (generation === this.state.revision && result.state)
					this.state.route = result.state as RouteResult;
			})
			.catch(() => {
				if (signal.aborted || generation !== this.state.revision) return;
				this.state.route = { status: 'unavailable' };
				this.state.error = 'The route could not be refreshed. Change an input to retry.';
			});
		await Promise.all(
			providerPromises.map(({ id, promise }) =>
				promise
					.then((result) => {
						if (generation !== this.state.revision) return;
						const provider = result.state as ProviderResult;
						this.state.providers = [
							...this.state.providers.filter((item) => item.providerId !== id),
							provider
						];
						this.state.loading = this.state.loading.filter((item) => item !== id);
					})
					.catch(() => {
						if (signal.aborted || generation !== this.state.revision) return;
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
						this.state.error =
							'Some carrier rates could not be refreshed. Change an input to retry.';
					})
			)
		);
		if (generation !== this.state.revision) return;
		this.state.loading = [];
		if (this.state.providers.some((provider) => provider.status === 'success')) {
			localStorage.setItem('parcel-lab:last-shipment', JSON.stringify(this.state.draft));
		}
	});

	const inputs = createWorkspaceInputs(this.state);
	return () => renderWorkspace(this.state, props, inputs);
}
