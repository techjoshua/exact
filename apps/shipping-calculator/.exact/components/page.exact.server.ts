import { createCompiledVNode as __exactVNode, createExpression as __exactExpression, writeReactiveLazy as __exactWrite, combineTaskSignal as __exactTaskCombinedSignal, taskAwait as __exactTaskAwait, markComponentContinuationTask as __exactContinuationTask } from "@exactjs/core";
import { peek, type Component } from '@exactjs/core';
import { resolveRoute } from "../../src/geography.js";
import { draftFromUrl, emptyInitialModel, normalizeDraft } from "../../src/model.js";
import { configuredProviderIds, quoteProvider } from "../../src/providers/registry.js";
import { CalculatorWorkspace } from "./workspace.exact.server.js";
import type { PageState } from "../../src/components/workspace/contracts.js";
/** Performs the shipping calculator page domain operation. */
export function ShippingCalculatorPage(this: Component<PageState>, props: {
    url: string;
}) {
    const parsed = draftFromUrl(new URL(props.url));
    const request = peek(() => normalizeDraft(parsed.draft));
    __exactWrite(this.state, ["model"], () => peek(() => emptyInitialModel(parsed.draft, request, parsed.explicit)));
    __exactWrite(this.state, ["model", "configuredProviders"], () => configuredProviderIds());
    this.task(this.reactive(() => this.state.model.configuredProviders), this.reactive(() => this.state.model), __exactContinuationTask("xmFAHgY4KYYb4VHBML0gfF_", async (__exactDependency: ("dhl" | "doop" | "fedex" | "ups" | "usps")[], __exactDependency1: any, { signal }) => {
        const providers = await __exactTaskAwait(signal, Promise.all(__exactDependency.map((id) => quoteProvider(id, request, __exactTaskCombinedSignal(signal, signal)))));
        __exactWrite(this.state, ["model"], () => ({
            ...__exactDependency1,
            route: resolveRoute(request.originZip5, request.destinationZip5),
            providers
        }));
    }));
    return () => (__exactVNode("div", { "data-exact-id": "xu4NAPjo0rISyucFIJGmN95", className: "page-shell" }, __exactVNode("header", { "data-exact-id": "xt20yLIvEPGOCPYRGMH_Tsm", className: "site-header" }, __exactVNode("a", { "data-exact-id": "x_VmVGnUJvBCPjNxKZpgxjT", className: "brand", href: "/", "aria-label": "Parcel Lab home" }, __exactVNode("span", { "data-exact-id": "xYenxXenKO4p1iyTGL88ITV", className: "brand-mark", "aria-hidden": "true" }, "PL"), __exactVNode("span", { "data-exact-id": "xB1Cu4rLJuaxderMRxHxo12" }, __exactVNode("strong", { "data-exact-id": "x5RZG2FSxz_C_gqYnw1klB6" }, "Parcel Lab"), __exactVNode("small", { "data-exact-id": "x1fVSAJroqCFJdLfes7iVDi" }, "Shipping, measured twice."))), __exactVNode("span", { "data-exact-id": "xZuopLwzIr4yt4_NhHnkJre", className: "header-status" }, "Live calculations \u00B7 No labels purchased")), __exactVNode("main", { "data-exact-id": "xPsWlgyTe3wYUauQAjbBI7S" }, __exactVNode("section", { "data-exact-id": "xyQlgOBP8OZ2ZUyDYPFNeSn", className: "intro", "aria-labelledby": "page-title" }, __exactVNode("p", { "data-exact-id": "xbJR4bhYM9gIVl_VpUdDDVq", className: "eyebrow" }, "Multi-carrier rate explorer"), __exactVNode("h1", { "data-exact-id": "xudGOFfziBNKr9EJrQX9IwD", id: "page-title" }, "Find the right way to send it."), __exactVNode("p", { "data-exact-id": "xUdwud5ZTvVVp40UbJzmsLF" }, "Compare postage, delivery windows, and optional services using real carrier APIs when configured\u2014or DOOP's entirely fictional but admirably punctual fleet.")), __exactVNode(CalculatorWorkspace, { initial: __exactExpression(() => this.state.model) })), __exactVNode("footer", { "data-exact-id": "xkhiPAd7z5xFdGo7PXBbnui" }, __exactVNode("p", { "data-exact-id": "x3XyNVMDzyYvZjI7kEeMGu-" }, "Rates are estimates. DOOP is fictional. ZIP map points use 2025 U.S. Census ZCTA representative coordinates."))));
}
//# sourceMappingURL=page.exact.server.ts.map
