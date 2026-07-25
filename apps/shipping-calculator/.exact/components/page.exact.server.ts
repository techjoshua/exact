import { createCompiledVNode as __exactVNode, createCompiledFragment as __exactFragment, createExpression as __exactExpression, createDynamicChild as __exactDynamic, writeReactiveLazy as __exactWrite, updateReactiveValue as __exactUpdate, updateReactiveValueWithResult as __exactUpdateResult, deleteReactiveValue as __exactDelete, mutateReactiveArray as __exactArrayMutation, combineTaskSignal as __exactTaskCombinedSignal, taskAwait as __exactTaskAwait, createServerBoundary as __exactBoundary } from "@exactjs/core";
import type { Component } from '@exactjs/core';
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
    __exactWrite(this.state, ["model"], () => emptyInitialModel(parsed.draft, request, parsed.explicit));
    __exactWrite(this.state, ["model", "configuredProviders"], () => configuredProviderIds());
    this.task(this.reactive(() => this.state.model.configuredProviders), this.reactive(() => this.state.model), async (__exactDependency, __exactDependency1, { signal }) => {
        const providers = await __exactTaskAwait(signal, Promise.all(__exactDependency.map((id) => quoteProvider(id, request, __exactTaskCombinedSignal(signal, signal)))));
        __exactWrite(this.state, ["model"], () => ({
            ...__exactDependency1,
            route: resolveRoute(request.originZip5, request.destinationZip5),
            providers
        }));
    });
    return () => (__exactVNode("div", { "data-exact-id": "xPJc0oMbiE0gQlAoOxfympZ", className: "page-shell" }, __exactVNode("header", { "data-exact-id": "x_3SIxftwa1sIL2vjclYMaY", className: "site-header" }, __exactVNode("a", { "data-exact-id": "xUnbNMXORGkMXYXjSW0utGl", className: "brand", href: "/", "aria-label": "Parcel Lab home" }, __exactVNode("span", { "data-exact-id": "xK-S5wzbv0s4B7_AmnRk_3A", className: "brand-mark", "aria-hidden": "true" }, " PL "), __exactVNode("span", { "data-exact-id": "xYSby1DOgPidgu0bQEBJ-Mt" }, __exactVNode("strong", { "data-exact-id": "x-86ZheDMESZ_3EzdkWuU32" }, "Parcel Lab"), __exactVNode("small", { "data-exact-id": "x4DacIFf0e4A7hw6v-KL1AG" }, "Shipping, measured twice."))), __exactVNode("span", { "data-exact-id": "x3Km55rWQMeUSDtstN09HRy", className: "header-status" }, "Live calculations \u00B7 No labels purchased")), __exactVNode("main", { "data-exact-id": "xq_pQiPqRmW6UHB_dYdbwTP" }, __exactVNode("section", { "data-exact-id": "xYFkGxQkM6Rt8c8T-DbcD-0", className: "intro", "aria-labelledby": "page-title" }, __exactVNode("p", { "data-exact-id": "x8C0eQRza8PIof9QgWUKZSb", className: "eyebrow" }, "Multi-carrier rate explorer"), __exactVNode("h1", { "data-exact-id": "xNanonJ-K--M1PjpvnV6647", id: "page-title" }, "Find the right way to send it."), __exactVNode("p", { "data-exact-id": "x4ycXGQ4SxYa9k6D2o1Q5wz" }, " Compare postage, delivery windows, and optional services using real carrier APIs when configured\u2014or DOOP's entirely fictional but admirably punctual fleet. ")), __exactBoundary("x6lIXO05szUZZ22ZWP-8NX6", "CalculatorWorkspace", { initial: this.state.model })), __exactVNode("footer", { "data-exact-id": "xd6SXQf7aYtOiEIlOCvp9_C" }, __exactVNode("p", { "data-exact-id": "xPekb1H---MUELLUc9eyJFb" }, " Rates are estimates. DOOP is fictional. ZIP map points use 2025 U.S. Census ZCTA representative coordinates. "))));
}
//# sourceMappingURL=page.exact.server.ts.map
