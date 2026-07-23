import { createCompiledVNode as __exactVNode, createCompiledFragment as __exactFragment, createExpression as __exactExpression, createDynamicChild as __exactDynamic, writeReactiveLazy as __exactWrite, updateReactiveValue as __exactUpdate, updateReactiveValueWithResult as __exactUpdateResult, deleteReactiveValue as __exactDelete, mutateReactiveArray as __exactArrayMutation, combineTaskSignal as __exactTaskCombinedSignal, taskAwait as __exactTaskAwait, createServerBoundary as __exactBoundary } from "@exact/core";
import type { Component } from '@exact/core';
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
    this.task(async ({ signal }) => {
        const providers = await __exactTaskAwait(signal, Promise.all(this.state.model.configuredProviders.map((id) => quoteProvider(id, request, __exactTaskCombinedSignal(signal, signal)))));
        __exactWrite(this.state, ["model"], () => ({
            ...this.state.model,
            route: resolveRoute(request.originZip5, request.destinationZip5),
            providers
        }));
    });
    return () => (__exactVNode("div", { "data-exact-id": "xVPvf1ZEuCkhIj_TDnpz4Pt", className: "page-shell" }, __exactVNode("header", { "data-exact-id": "xJRYsH4UZ6vNd2eNTDa8jha", className: "site-header" }, __exactVNode("a", { "data-exact-id": "xLGj0WP71vYb95UhBH2KiIo", className: "brand", href: "/", "aria-label": "Parcel Lab home" }, __exactVNode("span", { "data-exact-id": "x0EqP385Wc0VoZns9lj4JlK", className: "brand-mark", "aria-hidden": "true" }, " PL "), __exactVNode("span", { "data-exact-id": "x9V7vq-D8SYfusUK7oDY0g8" }, __exactVNode("strong", { "data-exact-id": "x3sYGdnMYVCxZThJBxyda2G" }, "Parcel Lab"), __exactVNode("small", { "data-exact-id": "xYSV7_oKHPH_qmy9yXZOg8y" }, "Shipping, measured twice."))), __exactVNode("span", { "data-exact-id": "xtqpANnkc_hZKth1n3Aheag", className: "header-status" }, "Live calculations \u00B7 No labels purchased")), __exactVNode("main", { "data-exact-id": "xmavRPUA4tYfbL1SCMWrl-i" }, __exactVNode("section", { "data-exact-id": "xIQH2pvpxalJb_W22I_f_D2", className: "intro", "aria-labelledby": "page-title" }, __exactVNode("p", { "data-exact-id": "xN3Ex4myJ8lLSLaYdg-se6A", className: "eyebrow" }, "Multi-carrier rate explorer"), __exactVNode("h1", { "data-exact-id": "x4BZ9AeMFsyW_IUu3VpPFQ0", id: "page-title" }, "Find the right way to send it."), __exactVNode("p", { "data-exact-id": "xH-qaPCLm0kz-1SZJTCBVVj" }, " Compare postage, delivery windows, and optional services using real carrier APIs when configured\u2014or DOOP's entirely fictional but admirably punctual fleet. ")), __exactBoundary("xTxCS8oyiWrqALrlCXlD2W2", "CalculatorWorkspace", { initial: this.state.model })), __exactVNode("footer", { "data-exact-id": "x_PpInaGUYChYj2FZYBl6TH" }, __exactVNode("p", { "data-exact-id": "xkUbC8EhaYvU2M3KvKTow5j" }, " Rates are estimates. DOOP is fictional. ZIP map points use 2025 U.S. Census ZCTA representative coordinates. "))));
}
//# sourceMappingURL=page.exact.server.ts.map
