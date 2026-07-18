import { createCompiledVNode as __exactVNode, createCompiledFragment as __exactFragment, createExpression as __exactExpression, createDynamicChild as __exactDynamic, writeReactiveLazy as __exactWrite, updateReactiveValue as __exactUpdate, updateReactiveValueWithResult as __exactUpdateResult, deleteReactiveValue as __exactDelete, mutateReactiveArray as __exactArrayMutation, ownTaskResource as __exactTaskResource, combineTaskSignal as __exactTaskCombinedSignal, taskAwait as __exactTaskAwait } from "@exact/core";
import type { Component } from "@exact/core";
import { usStatePaths } from "../src/data/us-state-paths.js";
import { exactClient } from "../src/client-runtime.js";
import { defaultDraft, draftUrl, normalizeDraft, packagePresets, rankQuotes } from "../src/model.js";
import type { ExtraService, InitialModel, ProviderId, ProviderResult, QuoteSort, RateQuote, RouteResult, ShipmentDraft } from "../src/types.js";
const __exactClientComponentDescriptor_1 = /* @__PURE__ */ Symbol.for("@exact/client-component-descriptor");
type PageState = {
    model: InitialModel;
};
;
type WorkspaceState = {
    draft: ShipmentDraft;
    providers: ProviderResult[];
    route: RouteResult;
    revision: number;
    loading: ProviderId[];
    error?: string;
    sort: QuoteSort;
    enabledFilters: ProviderId[];
    restored: boolean;
};
const __exactImplementation_CalculatorWorkspace_1 = function CalculatorWorkspace(this: Component<WorkspaceState>, props: {
    initial: InitialModel;
}) {
    __exactWrite(this.state, ["draft"], () => cloneDraft(props.initial.draft));
    __exactWrite(this.state, ["providers"], () => props.initial.providers);
    __exactWrite(this.state, ["route"], () => props.initial.route);
    __exactWrite(this.state, ["revision"], () => 0);
    __exactWrite(this.state, ["loading"], () => []);
    __exactWrite(this.state, ["error"], () => undefined);
    __exactWrite(this.state, ["sort"], () => "recommended");
    __exactWrite(this.state, ["enabledFilters"], () => [...props.initial.configuredProviders]);
    __exactWrite(this.state, ["restored"], () => false);
    this.task(() => {
        if (props.initial.explicitUrlState)
            return;
        try {
            const saved = localStorage.getItem("parcel-lab:last-shipment");
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
            localStorage.removeItem("parcel-lab:last-shipment");
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
            __exactWrite(this.state, ["error"], () => error instanceof Error ? error.message : "Check the shipment details");
            __exactWrite(this.state, ["loading"], () => []);
            return;
        }
        history.replaceState(null, "", draftUrl(this.state.draft, new URL(location.href)));
        const generation = this.state.revision;
        const ids = props.initial.configuredProviders;
        __exactWrite(this.state, ["loading"], () => [...ids]);
        const client = __exactTaskResource(signal, exactClient());
        const routePromise = client.invokeAction("route.resolve", request);
        const providerPromises = ids.map(id => client.invokeAction(`quote.${id}`, request).then(result => ({ id, result })));
        routePromise.then(result => {
            if (generation === this.state.revision && result.state)
                __exactWrite(this.state, ["route"], () => result.state as RouteResult);
        }).catch(() => undefined);
        await __exactTaskAwait(signal, Promise.all(providerPromises.map(promise => promise.then(({ id, result }) => {
            if (generation !== this.state.revision)
                return;
            const provider = result.state as ProviderResult;
            __exactWrite(this.state, ["providers"], () => [...this.state.providers.filter(item => item.providerId !== id), provider]);
            __exactWrite(this.state, ["loading"], () => this.state.loading.filter(item => item !== id));
        }).catch(() => undefined))));
        if (generation !== this.state.revision)
            return;
        __exactWrite(this.state, ["loading"], () => []);
        if (this.state.providers.some(provider => provider.status === "success")) {
            localStorage.setItem("parcel-lab:last-shipment", JSON.stringify(this.state.draft));
        }
    });
    const change = <K extends keyof ShipmentDraft>(key: K, value: ShipmentDraft[K]) => {
        this.state.draft[key] = value;
        __exactUpdateResult(this.state, ["revision"], previous => {
            const result = previous++;
            return [previous, result];
        });
    };
    const text = <K extends keyof ShipmentDraft>(key: K) => (event: Event) => change(key, (event.currentTarget as HTMLInputElement).value as ShipmentDraft[K]);
    const checked = <K extends keyof ShipmentDraft>(key: K) => (event: Event) => change(key, (event.currentTarget as HTMLInputElement).checked as ShipmentDraft[K]);
    const select = <K extends keyof ShipmentDraft>(key: K) => (event: Event) => change(key, (event.currentTarget as HTMLSelectElement).value as ShipmentDraft[K]);
    const applyPreset = (event: Event) => {
        const preset = (event.currentTarget as HTMLSelectElement).value as ShipmentDraft["preset"];
        Object.assign(this.state.draft, packagePresets[preset], { preset });
        __exactUpdateResult(this.state, ["revision"], previous => {
            const result = previous++;
            return [previous, result];
        });
    };
    const toggleProvider = (id: ProviderId, event: Event) => {
        const include = (event.currentTarget as HTMLInputElement).checked;
        __exactWrite(this.state, ["enabledFilters"], () => include ? [...new Set([...this.state.enabledFilters, id])] : this.state.enabledFilters.filter(item => item !== id));
    };
    return () => {
        const visibleProviders = this.state.providers.filter(provider => this.state.enabledFilters.includes(provider.providerId));
        const quotes = rankQuotes(visibleProviders.flatMap(provider => provider.quotes), this.state.sort);
        return (__exactVNode("section", { "data-exact-id": "xEpX_16w8x5PsczUUHoz8Km", className: "calculator", "aria-label": "Shipping calculator" }, __exactVNode("div", { "data-exact-id": "xU5GpbEE_cdXDtHJ7KLg5fE", className: "calculator-grid" }, __exactVNode("form", { "data-exact-id": "x1EfGFK_GN35mxB6Fgs2j0r", className: "shipment-card", onSubmit: (event: Event) => event.preventDefault() }, __exactVNode("div", { "data-exact-id": "x9fhC0q3S_lVsynrTnbowMj", className: "section-heading" }, __exactVNode("div", { "data-exact-id": "xMDhp_pHLH1u0I_jKhj0r42" }, __exactVNode("p", { "data-exact-id": "xh0afrJ5a71Ag5m7zYiEEP7", className: "step" }, "01"), __exactVNode("h2", { "data-exact-id": "xNNZX43pMuqhw5iZEBNnUHS" }, "Shipment")), __exactDynamic(() => this.state.restored ? __exactVNode("span", { "data-exact-id": "xLoe-ynp0TbFACyJHMBPeal", className: "restored" }, "Recent trip restored") : null)), __exactVNode("fieldset", { "data-exact-id": "xoR3LROvMBRTqci7QYs2VWF", className: "route-fields" }, __exactVNode("legend", { "data-exact-id": "xVtbM2bMCwhzZhPUNNOX-21" }, "Route"), __exactVNode("label", { "data-exact-id": "xUTyq0FgBPKO1rVbZgLXOsx" }, "From ZIP", __exactVNode("input", { "data-exact-id": "xAPcCS1qxg1hF9_S-XpNy1l", name: "originZip", inputMode: "numeric", autoComplete: "postal-code", value: __exactExpression(() => this.state.draft.originZip), onInput: text("originZip") })), __exactVNode("button", { "data-exact-id": "xmI75jRnNlmrqsX1XpN2NWp", className: "swap", type: "button", "aria-label": "Swap origin and destination", onClick: () => {
                const origin = this.state.draft.originZip;
                __exactWrite(this.state, ["draft", "originZip"], () => this.state.draft.destinationZip);
                __exactWrite(this.state, ["draft", "destinationZip"], () => origin);
                __exactUpdateResult(this.state, ["revision"], previous => {
                    const result = previous++;
                    return [previous, result];
                });
            } }, "\u21C4"), __exactVNode("label", { "data-exact-id": "xoKPCYvvtXyQK7c6kxbe0mx" }, "To ZIP", __exactVNode("input", { "data-exact-id": "x5G20XssTcPETf4MO-pJWPY", name: "destinationZip", inputMode: "numeric", autoComplete: "postal-code", value: __exactExpression(() => this.state.draft.destinationZip), onInput: text("destinationZip") }))), __exactVNode("fieldset", { "data-exact-id": "x4d8W7033U-nhhAGJLhc49X" }, __exactVNode("legend", { "data-exact-id": "xt2PSHjvNSiSsTAh0hx8vN4" }, "Mailpiece"), __exactVNode("div", { "data-exact-id": "xJQOdeBua0GsYyVEq-66x0P", className: "segmented", role: "group", "aria-label": "Mailpiece type" }, __exactDynamic(() => this.map((["parcel", "envelope", "flat"] as const), __exactItem_1 => __exactItem_1, kind => __exactVNode("button", { "data-exact-id": "xedYSgLxOX0AtrbkBPDafGH", type: "button", className: __exactExpression(() => this.state.draft.kind === kind ? "active" : ""), "aria-pressed": __exactExpression(() => this.state.draft.kind === kind), onClick: () => change("kind", kind) }, __exactDynamic(() => capitalize(kind))), "xEh-r-whOHBvTU3lttbADBc"))), __exactVNode("label", { "data-exact-id": "xHz6UUWh121IX8vPwHTwI8F" }, "Preset", __exactVNode("select", { "data-exact-id": "xsN9D77ikFokxDXFJlVGFN9", value: __exactExpression(() => this.state.draft.preset), onChange: applyPreset }, __exactVNode("option", { "data-exact-id": "xjB4MEU_KUZH_Nu6WHkOckP", value: "custom" }, "Custom dimensions"), __exactVNode("option", { "data-exact-id": "xV0mXYJLwQeArqqJq9ObBti", value: "mailer" }, "Poly mailer"), __exactVNode("option", { "data-exact-id": "x2HSGT7TCiPHusKe5jDzDTf", value: "small-box" }, "Small box"), __exactVNode("option", { "data-exact-id": "xV1b863FQbBe9V2VCyPIm3P", value: "medium-box" }, "Medium box"), __exactVNode("option", { "data-exact-id": "xoLgBTKj4URa2hhOqoiAZVf", value: "large-box" }, "Large box"), __exactVNode("option", { "data-exact-id": "xka3NUW65bdpPfQf7ySgqPq", value: "letter" }, "Letter envelope"), __exactVNode("option", { "data-exact-id": "x-I02A4iOcTCsOFstgaC2iS", value: "large-envelope" }, "Large envelope")))), __exactVNode("fieldset", { "data-exact-id": "xpBGfTHRYy97qRztc2KqXw5" }, __exactVNode("legend", { "data-exact-id": "xKEQ8tlXqk8EGeKcL_ivHNT" }, "Weight & dimensions"), __exactVNode("div", { "data-exact-id": "xMB1ODbAoSaDS66iHo-FesH", className: "measure-grid weight-grid" }, __exactVNode("label", { "data-exact-id": "x54A0Ly7HNYJF6KNAwB42xA" }, "Pounds", __exactVNode("input", { "data-exact-id": "xSk3Ey3d7gfbNiMxUa7MZYt", type: "number", min: "0", max: "70", step: "1", value: __exactExpression(() => this.state.draft.pounds), onInput: text("pounds") })), __exactVNode("label", { "data-exact-id": "xKmduRltnu0YpoaTGQXtkdm" }, "Ounces", __exactVNode("input", { "data-exact-id": "xe0wQ-ZAbox8RKrOZv3mUkS", type: "number", min: "0", max: "15.999", step: "0.1", value: __exactExpression(() => this.state.draft.ounces), onInput: text("ounces") }))), __exactVNode("div", { "data-exact-id": "xFx3lpXqjQQUkX3EgaQ1ElM", className: "measure-grid dimension-grid" }, __exactVNode("label", { "data-exact-id": "xGwOIx1Qbja1oBvW3-jmI_g" }, "Length ", __exactVNode("span", { "data-exact-id": "xUsZHvH8nIk9W_JLIKhWhr9" }, "in"), __exactVNode("input", { "data-exact-id": "xd-ImRBfyqZ31wd4W9Gj_pr", type: "number", min: "0.01", step: "0.1", value: __exactExpression(() => this.state.draft.length), onInput: text("length") })), __exactVNode("label", { "data-exact-id": "xH4xLgCCGPE6eRxxKg_ijH6" }, __exactDynamic(() => this.state.draft.kind === "parcel" ? "Width" : "Height"), __exactVNode("span", { "data-exact-id": "xM97OnYPf38QGVcij3SoRbg" }, "in"), __exactVNode("input", { "data-exact-id": "xOTgvHM5s5YiEUxnAp7ZxrU", type: "number", min: "0.01", step: "0.1", value: __exactExpression(() => this.state.draft.width), onInput: text("width") })), __exactVNode("label", { "data-exact-id": "xLxvll8bMhlKYabCzRwK_RU" }, __exactDynamic(() => this.state.draft.kind === "parcel" ? "Height" : "Thickness"), __exactVNode("span", { "data-exact-id": "xKhjMx39sJmgZJOc6OsBBMM" }, "in"), __exactVNode("input", { "data-exact-id": "xQWEFmRKEaf2Wclj4eKrn8V", type: "number", min: "0.001", step: "0.1", value: __exactExpression(() => this.state.draft.height), onInput: text("height") })))), __exactVNode("fieldset", { "data-exact-id": "xliZEYkj2R4qgYpkZZnFn_M" }, __exactVNode("legend", { "data-exact-id": "x-KMqRKflLjJZU644Vl0sZ8" }, "Protection & confirmation"), __exactVNode("label", { "data-exact-id": "xukEAgBrpOjYUiRZigCdqRe" }, "Declared value ", __exactVNode("span", { "data-exact-id": "xxTIHn7Gp61fBxqTP45-V34", className: "input-prefix" }, "$"), __exactVNode("input", { "data-exact-id": "xu558Wm3iNWsBFII-g33xJ1", className: "with-prefix", type: "number", min: "0", max: "50000", step: "0.01", placeholder: "Optional", value: __exactExpression(() => this.state.draft.declaredValue), onInput: text("declaredValue") })), __exactVNode("label", { "data-exact-id": "xjbyqZ1Ym8nHpUsJ7sRnTfY", className: "check-row" }, __exactVNode("input", { "data-exact-id": "xAEhqQzblThOf9NYF-4_hfT", type: "checkbox", checked: __exactExpression(() => this.state.draft.tracking), onChange: checked("tracking") }), __exactVNode("span", { "data-exact-id": "xPXy8tjnqElyx6shzcgV1Bd" }, __exactVNode("strong", { "data-exact-id": "xEGt5uCxPusFMZsRMhHPJ9e" }, "Require tracking"), __exactVNode("small", { "data-exact-id": "x_kOQfAm7Ybwn5DCSDh6i4V" }, "Included where possible, priced when it is an add-on."))), __exactVNode("label", { "data-exact-id": "xY8r8UvYeCzN5M9ncjuPEyQ" }, "Signature", __exactVNode("select", { "data-exact-id": "x7CUT-a_szIX9j93FsFbegk", value: __exactExpression(() => this.state.draft.signature), onChange: select("signature") }, __exactVNode("option", { "data-exact-id": "x3zi4yxf-h3I6dnLLe2PNm2", value: "none" }, "No signature required"), __exactVNode("option", { "data-exact-id": "x60Z5DOeAI_f6t_4zkCshF_", value: "standard" }, "Signature required"), __exactVNode("option", { "data-exact-id": "x_Is0njaePxjqEP_-Phv94E", value: "adult" }, "Adult signature required"))), __exactVNode("label", { "data-exact-id": "xtaHl1VIJz8_hYTY0Fud3po", className: "check-row" }, __exactVNode("input", { "data-exact-id": "x4nlL0wMCoGc8_pP1kFqo3y", type: "checkbox", checked: __exactExpression(() => this.state.draft.insurance), disabled: __exactExpression(() => !this.state.draft.declaredValue), onChange: checked("insurance") }), __exactVNode("span", { "data-exact-id": "xxRZUO9MUwxbZ48ZARjbjIn" }, __exactVNode("strong", { "data-exact-id": "xxb4FYco1SzfH9I6ej9yPUK" }, "Price insurance"), __exactVNode("small", { "data-exact-id": "xnsXmPqRFVy61PMTawk3bd_" }, "Enter a declared value to compare coverage.")))), __exactVNode("details", { "data-exact-id": "xvNoytxe1anXxoXnalGh7kT" }, __exactVNode("summary", { "data-exact-id": "xwj1zalg3WPASR1pJOLimKO" }, "Advanced details"), __exactVNode("div", { "data-exact-id": "xck6M7jRzPg7Z03w7Ggw-qX", className: "advanced-grid" }, __exactVNode("label", { "data-exact-id": "xGEwKl31DKLUYvvlsH-c5u_", className: "check-row" }, __exactVNode("input", { "data-exact-id": "xnnWb6qRvXFSpe0-MlLmpQW", type: "checkbox", checked: __exactExpression(() => this.state.draft.residential), onChange: checked("residential") }), __exactVNode("span", { "data-exact-id": "x6SbFAbUgGQzgg9uR1K-jXc" }, "Residential destination")), __exactVNode("label", { "data-exact-id": "xRw-vuij3h8FOJZD1mAICHb", className: "check-row" }, __exactVNode("input", { "data-exact-id": "xccvKNXYioWj9KBrCObyQ4q", type: "checkbox", checked: __exactExpression(() => this.state.draft.machinable), onChange: checked("machinable") }), __exactVNode("span", { "data-exact-id": "xyI_R4RH6FUDMA4a7_I584F" }, "Machinable mailpiece")), __exactVNode("label", { "data-exact-id": "xLoet_hCvCgaq3C5mTxOBMH" }, "Mailing date", __exactVNode("input", { "data-exact-id": "xl0G3lCpC_jTzYu_kshcSSM", type: "date", value: __exactExpression(() => this.state.draft.shipDate), onInput: text("shipDate") })))), __exactVNode("p", { "data-exact-id": "xzkCdhD7bUmXYx5OQkansoc", className: "validation", role: "alert" }, __exactDynamic(() => this.state.error ?? "Rates update automatically after you pause typing."))), __exactVNode("section", { "data-exact-id": "xbFppgN5R7Sluu9lZfvKYTu", className: "visual-card", "aria-labelledby": "route-title" }, __exactVNode("div", { "data-exact-id": "xi3T13txVrPoiGjIxd-U-6s", className: "section-heading" }, __exactVNode("div", { "data-exact-id": "xQ-MPvA2fuYu9klaNVTtvtx" }, __exactVNode("p", { "data-exact-id": "xV58zP5d5CRJRmkT8CRR3ic", className: "step" }, "02"), __exactVNode("h2", { "data-exact-id": "xP7XWq_uTZgQQHDWoGm8c32", id: "route-title" }, "Route")), __exactVNode("span", { "data-exact-id": "x7oyED67QkpXySxew8dSceF", className: "distance" }, __exactDynamic(() => this.state.route.distanceMiles ? `${this.state.route.distanceMiles.toLocaleString()} mi` : "Approximate"))), __exactVNode(RouteMap, { route: __exactExpression(() => this.state.route), origin: __exactExpression(() => this.state.draft.originZip), destination: __exactExpression(() => this.state.draft.destinationZip) }), __exactVNode("div", { "data-exact-id": "x9EhzEdu3fz5dyPWnOythsW", className: "route-caption" }, __exactVNode("span", { "data-exact-id": "xDyZ0hZCXM9BA-9v-2zm0AG" }, __exactVNode("small", { "data-exact-id": "xi7mr0CaZrYJTvLstVO4FRM" }, "Origin"), __exactVNode("strong", { "data-exact-id": "xKj4FxqjguTjFA-6BF_Q9QR" }, __exactDynamic(() => this.state.draft.originZip || "—"))), __exactVNode("span", { "data-exact-id": "xpzRhFjEFiOKho02R1E2lMc", className: "route-line", "aria-hidden": "true" }), __exactVNode("span", { "data-exact-id": "xifgfWA-vxDwUNigtWNKc00" }, __exactVNode("small", { "data-exact-id": "xmgQ9nInhDf6Uwf4Y_05o6G" }, "Destination"), __exactVNode("strong", { "data-exact-id": "xu61lnkklM8CtzYbA2HPLUD" }, __exactDynamic(() => this.state.draft.destinationZip || "—"))))), __exactVNode("section", { "data-exact-id": "x2uRta8-YsWy71dz3lEU5pw", className: "results-card", "aria-labelledby": "rates-title", "aria-busy": __exactExpression(() => this.state.loading.length > 0 || undefined) }, __exactVNode("div", { "data-exact-id": "xW0eyu4vINw3Kpo-JPGXa6U", className: "results-header" }, __exactVNode("div", { "data-exact-id": "xcQUAFV3-Dt4Suv1Ro-z8pF", className: "section-heading" }, __exactVNode("div", { "data-exact-id": "xNF5ZZtRUR96ZSQ3x-NDLwV" }, __exactVNode("p", { "data-exact-id": "xZY9IoaEsad1g6BB70Skq4M", className: "step" }, "03"), __exactVNode("h2", { "data-exact-id": "xB_xxBrZ_T1enqbYUyxxuXt", id: "rates-title" }, "Rates")), __exactVNode("span", { "data-exact-id": "xpu0BByUQkxL4ze_cdYAXeB", className: "quote-count" }, __exactDynamic(() => quotes.length), " option", __exactDynamic(() => quotes.length === 1 ? "" : "s"))), __exactVNode("div", { "data-exact-id": "x-K65CaWy4VVVUtUzbt2ybv", className: "quote-tools" }, __exactVNode("label", { "data-exact-id": "xdZHPln4Qzk25SLWTIZIqf6" }, "Sort", __exactVNode("select", { "data-exact-id": "xrDgE1_ttZVwjCsZmAJc-Gb", value: __exactExpression(() => this.state.sort), onChange: (event: Event) => { __exactWrite(this.state, ["sort"], () => (event.currentTarget as HTMLSelectElement).value as QuoteSort); } }, __exactVNode("option", { "data-exact-id": "xIzI8YKeSYjInc6N8tAE_O7", value: "recommended" }, "Recommended"), __exactVNode("option", { "data-exact-id": "x1M92Nv8MBxrrAw8X5P4oQx", value: "cheapest" }, "Cheapest"), __exactVNode("option", { "data-exact-id": "xwL68zSrEbc_XFIHub2zz65", value: "fastest" }, "Fastest"), __exactVNode("option", { "data-exact-id": "xolHlUSR_LRsmNVOG04fRHa", value: "carrier" }, "Carrier"))), __exactVNode("div", { "data-exact-id": "x6mXw3ZXgpPlfuoSI17rcbk", className: "provider-filters", "aria-label": "Filter carriers" }, __exactDynamic(() => this.map(props.initial.configuredProviders, __exactItem_2 => __exactItem_2, id => __exactVNode("label", { "data-exact-id": "xG6X1QaY9fOs4SyJ9D_w9zV" }, __exactVNode("input", { "data-exact-id": "xk1hbO_JaZk0T6hN8QOBGJD", type: "checkbox", checked: __exactExpression(() => this.state.enabledFilters.includes(id)), onChange: (event: Event) => toggleProvider(id, event) }), __exactDynamic(() => providerName(id))), "xlSw-i6y8SfhAJfMes1ReoF"))))), __exactVNode("p", { "data-exact-id": "xb78zDPwutqHAPLKzo5QkMI", className: "status-line", role: "status", "aria-live": "polite" }, __exactDynamic(() => this.state.loading.length ? `Refreshing ${this.state.loading.map(providerName).join(", ")}…` : `Showing rates from ${(this.state.providers.filter(provider => this.state.enabledFilters.includes(provider.providerId))).filter(item => item.status === "success").length} source${(this.state.providers.filter(provider => this.state.enabledFilters.includes(provider.providerId))).filter(item => item.status === "success").length === 1 ? "" : "s"}.`)), __exactDynamic(() => (this.state.providers.filter(provider => this.state.enabledFilters.includes(provider.providerId))).filter(provider => provider.status === "error").map(provider => __exactVNode("div", { "data-exact-id": "xIrZisgokITYRqyklYyXH8l", className: "provider-error" }, __exactVNode("strong", { "data-exact-id": "xiEElR6DFogrHeP0xy7knNC" }, __exactDynamic(() => provider.providerName)), __exactVNode("span", { "data-exact-id": "xjhX1OqrlBR3tos4YIGgQl6" }, __exactDynamic(() => provider.error?.message))))), __exactVNode("div", { "data-exact-id": "xl-hZWLgs_DHFUq_EbDcvmO", className: "quote-list" }, __exactDynamic(() => quotes.map((quote, index) => __exactVNode(RateCard, { quote: __exactExpression(() => quote), best: __exactExpression(() => index === 0 && quote.compatible), refreshing: __exactExpression(() => this.state.loading.includes(quote.providerId)) }))), __exactDynamic(() => !quotes.length && !this.state.loading.length ? __exactVNode("div", { "data-exact-id": "xSQnbIEvsZRxL4HeBE77bF-", className: "empty-results" }, __exactVNode("strong", { "data-exact-id": "xNMALXC9lUC6sA-XqRlE2Wu" }, "No compatible rates yet."), __exactVNode("span", { "data-exact-id": "xmO054tKyEU0Jl92rU55ccL" }, "Check the shipment details or enable a provider on the server.")) : null))))));
    };
};
export const CalculatorWorkspace: typeof __exactImplementation_CalculatorWorkspace_1 = /* @__PURE__ */ (() => Object.assign(__exactImplementation_CalculatorWorkspace_1, {
    [__exactClientComponentDescriptor_1]: [
        1,
        [
            ["xtl2nmuJwfYh3hb7t5AHrIT", "CalculatorWorkspace", __exactImplementation_CalculatorWorkspace_1]
        ]
    ]
}))();
export function RouteMap(this: Component<{}>, props: {
    route: RouteResult;
    origin: string;
    destination: string;
}) {
    return () => {
        const start = props.route.origin ? project(props.route.origin.latitude, props.route.origin.longitude) : undefined;
        const end = props.route.destination ? project(props.route.destination.latitude, props.route.destination.longitude) : undefined;
        const arc = start && end ? arcPath(start, end) : undefined;
        return (__exactVNode("div", { "data-exact-id": "xvqdpk_w1rezYF9HNJr4uPu", className: "map-wrap" }, __exactVNode("svg", { "data-exact-id": "xQZMikgbRazjpDw08nmcnfe", className: "route-map", viewBox: "0 0 800 370", role: "img", "aria-label": __exactExpression(() => start && end ? `Approximate route from ${props.origin} to ${props.destination}` : "Approximate United States route map; one or both ZIP codes are unavailable") }, __exactVNode("g", { "data-exact-id": "xULSSUEmv_93nhd_r_NKyqn", className: "map-states" }, __exactDynamic(() => usStatePaths.map(state => __exactVNode("path", { "data-exact-id": "x51EJj5QLijR5knFO2YDO4X", className: __exactExpression(() => `land state state-${state.abbreviation.toLowerCase()}`), d: __exactExpression(() => state.d) }, __exactVNode("title", { "data-exact-id": "xOPxsB8MCadc4fmUzqu1GX-" }, __exactDynamic(() => state.name)))))), __exactDynamic(() => arc ? __exactVNode("path", { "data-exact-id": "xLwigXCVG7pPFXqgryC_xx-", className: "route-arc", d: __exactExpression(() => arc) }) : null), __exactDynamic(() => start ? __exactFragment({}, __exactVNode("circle", { "data-exact-id": "x98OroJIjtoFczDwbVUIQD4", className: "map-point origin", cx: __exactExpression(() => start.x), cy: __exactExpression(() => start.y), r: "6" }), __exactVNode("circle", { "data-exact-id": "xjrmrh8lcOzbqypOZmVn_Rc", className: "map-halo", cx: __exactExpression(() => start.x), cy: __exactExpression(() => start.y), r: "12" })) : null), __exactDynamic(() => end ? __exactFragment({}, __exactVNode("circle", { "data-exact-id": "xNWFxBgpBqJy4CWZmf7gGkp", className: "map-point destination", cx: __exactExpression(() => end.x), cy: __exactExpression(() => end.y), r: "6" }), __exactVNode("circle", { "data-exact-id": "xW_SzIzCYLsGdVPKREqcLtP", className: "map-halo", cx: __exactExpression(() => end.x), cy: __exactExpression(() => end.y), r: "12" })) : null)), __exactDynamic(() => !start || !end ? __exactVNode("p", { "data-exact-id": "xB5kCoeVAHRKdztZfk7HdRQ", className: "map-unavailable" }, "Map location unavailable for one or both ZIP codes.") : null)));
    };
}
export function RateCard(this: Component<{}>, props: {
    quote: RateQuote;
    best: boolean;
    refreshing: boolean;
}) {
    return () => (__exactVNode("article", { "data-exact-id": "x-BaQi3uDYDCulfpL4GzeUd", className: __exactExpression(() => `rate-card${props.quote.compatible ? "" : " incompatible"}${props.refreshing ? " refreshing" : ""}`) }, __exactVNode("div", { "data-exact-id": "x-P3wTkdnTdP6245OkN_P4G", className: "rate-main" }, __exactVNode("div", { "data-exact-id": "xuxJdblKFWQMT-s-R7pGgQ-", className: "carrier-row" }, __exactVNode("span", { "data-exact-id": "x4r-UWTH1KhHfc5wOotmEyz", className: __exactExpression(() => `carrier-logo ${props.quote.providerId}`) }, __exactDynamic(() => carrierInitials(props.quote.providerId))), __exactVNode("div", { "data-exact-id": "xbdkN54FhJwcfn75Mny2WNz" }, __exactVNode("p", { "data-exact-id": "xeq10LJJkvJxyk-rH6yq8qm" }, __exactDynamic(() => props.quote.providerName), __exactVNode("span", { "data-exact-id": "xOOwmzplYm9Z-u4FP2XdN3M", className: __exactExpression(() => `source ${props.quote.source}`) }, __exactDynamic(() => props.quote.source === "mock" ? "Fictional" : props.quote.accountRate ? "Account" : "Live"))), __exactVNode("h3", { "data-exact-id": "xuZ9mendoCOyHx4UR8Mvweh" }, __exactDynamic(() => props.quote.serviceName)))), __exactVNode("div", { "data-exact-id": "xQhJ7sYI9wQ6SP3gIVNeVmM", className: "delivery" }, __exactVNode("small", { "data-exact-id": "xkUhPIqTtztkIHNj03XplJt" }, "Estimated delivery"), __exactVNode("strong", { "data-exact-id": "xtTks0V9IllsHzSlBwJkqdq" }, __exactDynamic(() => deliveryLabel(props.quote))), __exactDynamic(() => props.quote.delivery.guaranteed ? __exactVNode("span", { "data-exact-id": "xkWoCk8xJdRTAEdOMwfYQ4X" }, "Guaranteed") : null)), __exactVNode("div", { "data-exact-id": "xu-dxGrxBP1HPeVW3103uae", className: "price" }, __exactVNode("small", { "data-exact-id": "xaGe1bHw4McXnBmmV6HSuQ2" }, "Total estimate"), __exactVNode("strong", { "data-exact-id": "xY_HTaQrJ14jbCV8Gel6lHg" }, __exactDynamic(() => money(props.quote.totalPriceCents))), __exactDynamic(() => props.best ? __exactVNode("span", { "data-exact-id": "xRk1Qou-GgUhlTz4fLW2Kd1", className: "best" }, "Best value") : null))), __exactVNode("div", { "data-exact-id": "xlDkUzxsg6Z2B8o8cjVTdGu", className: "feature-row" }, __exactDynamic(() => props.quote.features.map(feature => __exactVNode(Feature, { feature: __exactExpression(() => feature) })))), __exactVNode("details", { "data-exact-id": "xFRfE6KKztVg8VKfg7dYtf4", className: "breakdown" }, __exactVNode("summary", { "data-exact-id": "xN2Wm-NKf_BrcESd510hMC-" }, "Price details"), __exactVNode("dl", { "data-exact-id": "xX6O-Zc4UNpj-o3fWFZDZRF" }, __exactDynamic(() => props.quote.charges.map(charge => __exactFragment({}, __exactVNode("dt", { "data-exact-id": "x60w03xqPb8LGMOaFTY2hSu" }, __exactDynamic(() => charge.name)), __exactVNode("dd", { "data-exact-id": "xBMHpbAXlBISqlCM7WQmwqD" }, __exactDynamic(() => money(charge.amountCents)))))))), __exactDynamic(() => this.map(props.quote.warnings, __exactItem_3 => __exactItem_3, warning => __exactVNode("p", { "data-exact-id": "xQmSRKjm34Ne_oGO6XCSJot", className: "quote-warning" }, __exactDynamic(() => warning)), "xecoMHx2KPsf6FPBfGJQsxc"))));
}
export function Feature(this: Component<{}>, props: {
    feature: ExtraService;
}) {
    return () => __exactVNode("span", { "data-exact-id": "xfkAndCOQRFIZbbz7uTaESm", className: __exactExpression(() => `feature ${props.feature.availability}${props.feature.selected ? " selected" : ""}`), title: __exactExpression(() => props.feature.explanation) }, __exactDynamic(() => props.feature.availability === "included" ? "✓" : props.feature.availability === "available" ? "+" : "×"), __exactDynamic(() => props.feature.name), __exactDynamic(() => props.feature.selected && props.feature.availability === "available" && props.feature.priceCents ? ` ${money(props.feature.priceCents)}` : props.feature.availability === "included" ? " included" : ""));
}
function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, milliseconds);
        const abort = () => { clearTimeout(timer); reject(signal.reason ?? new DOMException("Aborted", "AbortError")); };
        if (signal.aborted)
            abort();
        else
            signal.addEventListener("abort", abort, { once: true });
    });
}
function cloneDraft(draft: ShipmentDraft): ShipmentDraft { return { ...draft }; }
function capitalize(value: string): string { return value.charAt(0).toUpperCase() + value.slice(1); }
function providerName(id: ProviderId): string { return ({ doop: "DOOP", usps: "USPS", ups: "UPS", fedex: "FedEx", dhl: "DHL Express" } as Record<ProviderId, string>)[id]; }
function money(cents: number): string { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }
function carrierInitials(id: ProviderId): string { return ({ doop: "D", usps: "US", ups: "UP", fedex: "FX", dhl: "DH" })[id]; }
function deliveryLabel(quote: RateQuote): string {
    const { minimumDays, maximumDays, estimatedDate } = quote.delivery;
    if (estimatedDate)
        return new Date(`${estimatedDate}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    if (minimumDays === undefined && maximumDays === undefined)
        return "Carrier estimate";
    if (minimumDays === maximumDays)
        return `${minimumDays} business day${minimumDays === 1 ? "" : "s"}`;
    return `${minimumDays ?? 1}–${maximumDays} business days`;
}
function project(latitude: number, longitude: number): {
    x: number;
    y: number;
} {
    if (latitude > 50 && longitude < -130)
        return { x: 76 + (longitude + 170) * 4.2, y: 316 - (latitude - 50) * 4.1 };
    if (latitude < 23 && longitude < -150)
        return { x: 205 + (longitude + 161) * 8, y: 337 - (latitude - 18) * 7 };
    if (latitude < 20 && longitude > -70)
        return { x: 671 + (longitude + 68) * 12, y: 337 - (latitude - 17.5) * 10 };
    return { x: 84 + (longitude + 125) / 59 * 634, y: 52 + (50 - latitude) / 26 * 235 };
}
function arcPath(start: {
    x: number;
    y: number;
}, end: {
    x: number;
    y: number;
}): string {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy) || 1;
    const lift = Math.min(90, Math.max(28, length * 0.2));
    const middle = { x: (start.x + end.x) / 2 + dy / length * lift, y: (start.y + end.y) / 2 - dx / length * lift };
    return `M ${start.x} ${start.y} Q ${middle.x} ${middle.y} ${end.x} ${end.y}`;
}
//# sourceMappingURL=App.exact.client.ts.map
