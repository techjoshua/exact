import { createCompiledVNode as __exactVNode, createCompiledFragment as __exactFragment, createExpression as __exactExpression, createDynamicChild as __exactDynamic, writeReactiveLazy as __exactWrite, updateReactiveValue as __exactUpdate, updateReactiveValueWithResult as __exactUpdateResult, deleteReactiveValue as __exactDelete, mutateReactiveArray as __exactArrayMutation, combineTaskSignal as __exactTaskCombinedSignal, taskAwait as __exactTaskAwait, stageTaskMutation as __exactStageTaskMutation, markComponentContinuationTask as __exactContinuationTask, createServerBoundary as __exactBoundary } from "@exactjs/core";
import { peek, type Component } from '@exactjs/core';
import { resolveRoute } from "../../src/geography.js";
import { draftFromUrl, emptyInitialModel, normalizeDraft } from "../../src/model.js";
import { configuredProviderIds, quoteProvider } from "../../src/providers/registry.js";
import type { PageState } from "../../src/components/workspace/contracts.js";
/** Performs the shipping calculator page domain operation. */
export function ShippingCalculatorPage(this: Component<PageState>, props: {
    url: string;
}) {
    const parsed = draftFromUrl(new URL(props.url));
    const request = normalizeDraft(parsed.draft);
    __exactWrite(this.state, ["model"], () => peek(() => emptyInitialModel(parsed.draft, request, parsed.explicit)));
    __exactWrite(this.state, ["model", "configuredProviders"], () => configuredProviderIds());
    this.task(this.reactive(() => this.state.model.configuredProviders), this.reactive(() => this.state.model), __exactContinuationTask("xkjfiXay5PtKM6N0lOjvJw_", async (__exactDependency: any[], __exactDependency1: any, { signal }) => {
        const providers = await __exactTaskAwait(signal, Promise.all(__exactDependency.map((id) => quoteProvider(id, request, __exactTaskCombinedSignal(signal, signal)))));
        __exactWrite(this.state, ["model"], () => ({
            ...__exactDependency1,
            route: resolveRoute(request.originZip5, request.destinationZip5),
            providers
        }));
    }));
    return () => (__exactVNode("div", { "data-exact-id": "xyzNAbvGMV_zrq0jb5fRIx3", className: "page-shell" }, __exactVNode("header", { "data-exact-id": "xvpcJZA_T9k4lK6N-dWWenH", className: "site-header" }, __exactVNode("a", { "data-exact-id": "xFD1W40Kph-aKs_ouNuKsYT", className: "brand", href: "/", "aria-label": "Parcel Lab home" }, __exactVNode("span", { "data-exact-id": "xcGKwnyat7q9GiZvaN05u2j", className: "brand-mark", "aria-hidden": "true" }, " PL "), __exactVNode("span", { "data-exact-id": "xySjNukQu6UsmSWD2sBRCyf" }, __exactVNode("strong", { "data-exact-id": "xp0odcE0pfhGp0bz3X4G-0P" }, "Parcel Lab"), __exactVNode("small", { "data-exact-id": "xR_kKJ1_McW0uUHcz5daBPT" }, "Shipping, measured twice."))), __exactVNode("span", { "data-exact-id": "xQbxi12L4mZ8fmdqhhkIJ9Z", className: "header-status" }, "Live calculations \u00B7 No labels purchased")), __exactVNode("main", { "data-exact-id": "x54f64YelU0s_dzir_Cu7dC" }, __exactVNode("section", { "data-exact-id": "xPD2PlXWcKXV0r1kdfNuY1I", className: "intro", "aria-labelledby": "page-title" }, __exactVNode("p", { "data-exact-id": "x6F-u2hotdBMC7a0KgbymXR", className: "eyebrow" }, "Multi-carrier rate explorer"), __exactVNode("h1", { "data-exact-id": "xMyInE9IVYbhXSwXES-by1Y", id: "page-title" }, "Find the right way to send it."), __exactVNode("p", { "data-exact-id": "xgBqIn-dYGytSMoq-wZhWog" }, " Compare postage, delivery windows, and optional services using real carrier APIs when configured\u2014or DOOP's entirely fictional but admirably punctual fleet. ")), __exactBoundary("xvmILzgjCM4m_R67HOQunSW", "CalculatorWorkspace", { initial: this.state.model })), __exactVNode("footer", { "data-exact-id": "x5Wj_kA2bkBFwRnQZWPMH18" }, __exactVNode("p", { "data-exact-id": "xH-_hwbCepIyHgvKO3BNxwl" }, " Rates are estimates. DOOP is fictional. ZIP map points use 2025 U.S. Census ZCTA representative coordinates. "))));
}
//# sourceMappingURL=page.exact.server.ts.map
