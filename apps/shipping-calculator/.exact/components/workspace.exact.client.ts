import { createCompiledVNode as __exactVNode, createCompiledFragment as __exactFragment, createExpression as __exactExpression, createDynamicChild as __exactDynamic, writeReactiveLazy as __exactWrite, updateReactiveValue as __exactUpdate, updateReactiveValueWithResult as __exactUpdateResult, deleteReactiveValue as __exactDelete, mutateReactiveArray as __exactArrayMutation, ownTaskResource as __exactTaskResource, combineTaskSignal as __exactTaskCombinedSignal, taskAwait as __exactTaskAwait } from "@exactjs/core";
import type { Component } from '@exactjs/core';
import { exactClient } from "../../src/client-runtime.js";
import { defaultDraft, draftUrl, normalizeDraft } from "../../src/model.js";
import type { InitialModel, ProviderResult, RouteResult, ShipmentDraft } from "../../src/types.js";
import { renderWorkspace } from "./workspace/view.exact.client.js";
import type { WorkspaceState } from "../../src/components/workspace/contracts.js";
import { cloneDraft, createWorkspaceInputs, delay } from "../../src/components/workspace/inputs.js";
const __exactComponentContract_1 = /* @__PURE__ */ Symbol.for("@exactjs/component-contract");
const __exactImplementation_CalculatorWorkspace_1 = function CalculatorWorkspace(this: Component<WorkspaceState>, props: {
    initial: InitialModel;
}) {
    __exactWrite(this.state, ["draft"], () => cloneDraft(props.initial.draft));
    __exactWrite(this.state, ["providers"], () => props.initial.providers);
    __exactWrite(this.state, ["route"], () => props.initial.route);
    __exactWrite(this.state, ["revision"], () => 0);
    __exactWrite(this.state, ["loading"], () => []);
    __exactWrite(this.state, ["error"], () => undefined);
    __exactWrite(this.state, ["sort"], () => 'recommended');
    __exactWrite(this.state, ["enabledFilters"], () => [...props.initial.configuredProviders]);
    __exactWrite(this.state, ["restored"], () => false);
    this.task(this.reactive(() => props.initial.explicitUrlState), (__exactDependency: boolean) => {
        if (__exactDependency)
            return;
        try {
            const saved = localStorage.getItem('parcel-lab:last-shipment');
            if (!saved)
                return;
            const candidate = { ...defaultDraft, ...JSON.parse(saved) } as ShipmentDraft;
            normalizeDraft(candidate);
            __exactWrite(this.state, ["draft"], () => candidate);
            __exactWrite(this.state, ["restored"], () => true);
            __exactUpdateResult(this.state, ["revision"], previous => {
                const result = previous++;
                return [previous, result];
            });
        }
        catch {
            localStorage.removeItem('parcel-lab:last-shipment');
        }
    });
    this.task(this.reactive(() => this.state.revision), async (_revision, { signal }) => {
        await __exactTaskAwait(signal, delay(450, __exactTaskCombinedSignal(signal, signal)));
        let request;
        try {
            request = normalizeDraft(this.state.draft);
            __exactWrite(this.state, ["error"], () => undefined);
        }
        catch (error) {
            __exactWrite(this.state, ["error"], () => error instanceof Error ? error.message : 'Check the shipment details');
            __exactWrite(this.state, ["loading"], () => []);
            return;
        }
        history.replaceState(null, '', draftUrl(this.state.draft, new URL(location.href)));
        const generation = this.state.revision;
        const ids = props.initial.configuredProviders;
        __exactWrite(this.state, ["loading"], () => [...ids]);
        const client = __exactTaskResource(signal, exactClient());
        const routePromise = client.invokeAction('route.resolve', request);
        const providerPromises = ids.map((id) => client.invokeAction(`quote.${id}`, request).then((result) => ({ id, result })));
        routePromise
            .then((result) => {
            if (generation === this.state.revision && result.state)
                __exactWrite(this.state, ["route"], () => result.state as RouteResult);
        })
            .catch(() => undefined);
        await __exactTaskAwait(signal, Promise.all(providerPromises.map((promise) => promise
            .then(({ id, result }) => {
            if (generation !== this.state.revision)
                return;
            const provider = result.state as ProviderResult;
            __exactWrite(this.state, ["providers"], () => [
                ...this.state.providers.filter((item) => item.providerId !== id),
                provider
            ]);
            __exactWrite(this.state, ["loading"], () => this.state.loading.filter((item) => item !== id));
        })
            .catch(() => undefined))));
        if (generation !== this.state.revision)
            return;
        __exactWrite(this.state, ["loading"], () => []);
        if (this.state.providers.some((provider) => provider.status === 'success')) {
            localStorage.setItem('parcel-lab:last-shipment', JSON.stringify(this.state.draft));
        }
    });
    const inputs = createWorkspaceInputs(this.state);
    return () => renderWorkspace(this.state, props, inputs);
};
export const CalculatorWorkspace: typeof __exactImplementation_CalculatorWorkspace_1 = /* @__PURE__ */ (() => Object.assign(__exactImplementation_CalculatorWorkspace_1, {
    [__exactComponentContract_1]: {
        version: 1,
        id: "xJkpEMXLuqnwN65cmx7UNPD",
        placement: "client",
        role: "client",
        implementations: [
            { id: "xZoxrmFqT5oXZSeTaQ7WmTu", name: "CalculatorWorkspace", role: "root", implementation: __exactImplementation_CalculatorWorkspace_1 }
        ],
        continuations: [],
        executors: [],
        boundaries: [],
        resumption: {
            componentId: "xJkpEMXLuqnwN65cmx7UNPD",
            statePaths: [],
            valueCaptures: [],
            contexts: [],
            boundaries: []
        }
    }
}))();
//# sourceMappingURL=workspace.exact.client.ts.map
