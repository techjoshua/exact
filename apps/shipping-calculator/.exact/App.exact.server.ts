import { createCompiledVNode as __exactVNode, createCompiledFragment as __exactFragment, createExpression as __exactExpression, createDynamicChild as __exactDynamic, writeReactiveLazy as __exactWrite, updateReactiveValue as __exactUpdate, updateReactiveValueWithResult as __exactUpdateResult, deleteReactiveValue as __exactDelete, mutateReactiveArray as __exactArrayMutation, combineTaskSignal as __exactTaskCombinedSignal, taskAwait as __exactTaskAwait, createServerBoundary as __exactBoundary } from "@exact/core";
import type { Component } from "@exact/core";
import { usStatePaths } from "../src/data/us-state-paths.js";
import { configuredProviderIds, quoteProvider } from "../src/providers/index.js";
import { resolveRoute } from "../src/geography.js";
import { draftFromUrl, emptyInitialModel, normalizeDraft } from "../src/model.js";
import type { ExtraService, InitialModel, ProviderId, ProviderResult, QuoteSort, RateQuote, RouteResult, ShipmentDraft } from "../src/types.js";
type PageState = {
    model: InitialModel;
};
export function ShippingCalculatorPage(this: Component<PageState>, props: {
    url: string;
}) {
    const parsed = draftFromUrl(new URL(props.url));
    const request = normalizeDraft(parsed.draft);
    __exactWrite(this.state, ["model"], () => emptyInitialModel(parsed.draft, request, parsed.explicit));
    __exactWrite(this.state, ["model", "configuredProviders"], () => configuredProviderIds());
    this.task(async ({ signal }) => {
        const providers = await __exactTaskAwait(signal, Promise.all(this.state.model.configuredProviders.map(id => quoteProvider(id, request, __exactTaskCombinedSignal(signal, signal)))));
        __exactWrite(this.state, ["model"], () => ({
            ...this.state.model,
            route: resolveRoute(request.originZip5, request.destinationZip5),
            providers
        }));
    });
    return () => (__exactVNode("div", { "data-exact-id": "xeWkWJ4-RJ_CV5E9ay--xtw", className: "page-shell" }, __exactVNode("header", { "data-exact-id": "xRXTFlSQFnic2yxSXWIGtT1", className: "site-header" }, __exactVNode("a", { "data-exact-id": "xBBSRtPwbmOcW91pFWM4Rdd", className: "brand", href: "/", "aria-label": "Parcel Lab home" }, __exactVNode("span", { "data-exact-id": "xLRH--1vb4knhnTBgjhBhuJ", className: "brand-mark", "aria-hidden": "true" }, "PL"), __exactVNode("span", { "data-exact-id": "xsXQ5CMGekRCSdCMuwLEfrQ" }, __exactVNode("strong", { "data-exact-id": "x7kA5efvnFGYSPsSNtmZein" }, "Parcel Lab"), __exactVNode("small", { "data-exact-id": "x3TYlar7LDFk2XFxFZG5diH" }, "Shipping, measured twice."))), __exactVNode("span", { "data-exact-id": "xG2JWTUOU4KiMDfrz3QvBMS", className: "header-status" }, "Live calculations \u00B7 No labels purchased")), __exactVNode("main", { "data-exact-id": "xi1Gp_NhjzjErKZsu4wKkXr" }, __exactVNode("section", { "data-exact-id": "xNj8-YDl9gpn-f2Wa9gcREQ", className: "intro", "aria-labelledby": "page-title" }, __exactVNode("p", { "data-exact-id": "xO3rRVHlYVqL3DIba8KIMzo", className: "eyebrow" }, "Multi-carrier rate explorer"), __exactVNode("h1", { "data-exact-id": "xMvsqR2HW2TWS61bMlQyHmE", id: "page-title" }, "Find the right way to send it."), __exactVNode("p", { "data-exact-id": "xMEXu5p-HElS56_hhrPK1xM" }, "Compare postage, delivery windows, and optional services using real carrier APIs when configured\u2014or DOOP's entirely fictional but admirably punctual fleet.")), __exactBoundary("xkuJaZzTQcQijkxsNxW8ZoC", "CalculatorWorkspace", { initial: this.state.model })), __exactVNode("footer", { "data-exact-id": "xj1N-PzYsSL0Ud1l0bSm9c-" }, __exactVNode("p", { "data-exact-id": "xOgo8AgJcdTLzPg-uvD3Q42" }, "Rates are estimates. DOOP is fictional. ZIP map points use 2025 U.S. Census ZCTA representative coordinates."))));
}
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
export function CalculatorWorkspace(props = {}) {
    return () => __exactBoundary("xqANygBY-SLRQYypfDMcmML", "CalculatorWorkspace", props);
}
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
    return () => (__exactVNode("article", { "data-exact-id": "x-BaQi3uDYDCulfpL4GzeUd", className: __exactExpression(() => `rate-card${props.quote.compatible ? "" : " incompatible"}${props.refreshing ? " refreshing" : ""}`) }, __exactVNode("div", { "data-exact-id": "x-P3wTkdnTdP6245OkN_P4G", className: "rate-main" }, __exactVNode("div", { "data-exact-id": "xuxJdblKFWQMT-s-R7pGgQ-", className: "carrier-row" }, __exactVNode("span", { "data-exact-id": "x4r-UWTH1KhHfc5wOotmEyz", className: __exactExpression(() => `carrier-logo ${props.quote.providerId}`) }, __exactDynamic(() => carrierInitials(props.quote.providerId))), __exactVNode("div", { "data-exact-id": "xbdkN54FhJwcfn75Mny2WNz" }, __exactVNode("p", { "data-exact-id": "xeq10LJJkvJxyk-rH6yq8qm" }, __exactDynamic(() => props.quote.providerName), __exactVNode("span", { "data-exact-id": "xOOwmzplYm9Z-u4FP2XdN3M", className: __exactExpression(() => `source ${props.quote.source}`) }, __exactDynamic(() => props.quote.source === "mock" ? "Fictional" : props.quote.accountRate ? "Account" : "Live"))), __exactVNode("h3", { "data-exact-id": "xuZ9mendoCOyHx4UR8Mvweh" }, __exactDynamic(() => props.quote.serviceName)))), __exactVNode("div", { "data-exact-id": "xQhJ7sYI9wQ6SP3gIVNeVmM", className: "delivery" }, __exactVNode("small", { "data-exact-id": "xkUhPIqTtztkIHNj03XplJt" }, "Estimated delivery"), __exactVNode("strong", { "data-exact-id": "xtTks0V9IllsHzSlBwJkqdq" }, __exactDynamic(() => deliveryLabel(props.quote))), __exactDynamic(() => props.quote.delivery.guaranteed ? __exactVNode("span", { "data-exact-id": "xkWoCk8xJdRTAEdOMwfYQ4X" }, "Guaranteed") : null)), __exactVNode("div", { "data-exact-id": "xu-dxGrxBP1HPeVW3103uae", className: "price" }, __exactVNode("small", { "data-exact-id": "xaGe1bHw4McXnBmmV6HSuQ2" }, "Total estimate"), __exactVNode("strong", { "data-exact-id": "xY_HTaQrJ14jbCV8Gel6lHg" }, __exactDynamic(() => money(props.quote.totalPriceCents))), __exactDynamic(() => props.best ? __exactVNode("span", { "data-exact-id": "xRk1Qou-GgUhlTz4fLW2Kd1", className: "best" }, "Best value") : null))), __exactVNode("div", { "data-exact-id": "xlDkUzxsg6Z2B8o8cjVTdGu", className: "feature-row" }, __exactDynamic(() => props.quote.features.map(feature => __exactVNode(Feature, { feature: __exactExpression(() => feature) })))), __exactVNode("details", { "data-exact-id": "xFRfE6KKztVg8VKfg7dYtf4", className: "breakdown" }, __exactVNode("summary", { "data-exact-id": "xN2Wm-NKf_BrcESd510hMC-" }, "Price details"), __exactVNode("dl", { "data-exact-id": "xX6O-Zc4UNpj-o3fWFZDZRF" }, __exactDynamic(() => props.quote.charges.map(charge => __exactFragment({}, __exactVNode("dt", { "data-exact-id": "x60w03xqPb8LGMOaFTY2hSu" }, __exactDynamic(() => charge.name)), __exactVNode("dd", { "data-exact-id": "xBMHpbAXlBISqlCM7WQmwqD" }, __exactDynamic(() => money(charge.amountCents)))))))), __exactDynamic(() => this.map(props.quote.warnings, __exactItem_1 => __exactItem_1, warning => __exactVNode("p", { "data-exact-id": "xQmSRKjm34Ne_oGO6XCSJot", className: "quote-warning" }, __exactDynamic(() => warning)), "xecoMHx2KPsf6FPBfGJQsxc"))));
}
export function Feature(this: Component<{}>, props: {
    feature: ExtraService;
}) {
    return () => __exactVNode("span", { "data-exact-id": "xfkAndCOQRFIZbbz7uTaESm", className: __exactExpression(() => `feature ${props.feature.availability}${props.feature.selected ? " selected" : ""}`), title: __exactExpression(() => props.feature.explanation) }, __exactDynamic(() => props.feature.availability === "included" ? "✓" : props.feature.availability === "available" ? "+" : "×"), __exactDynamic(() => props.feature.name), __exactDynamic(() => props.feature.selected && props.feature.availability === "available" && props.feature.priceCents ? ` ${money(props.feature.priceCents)}` : props.feature.availability === "included" ? " included" : ""));
}
;
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
//# sourceMappingURL=App.exact.server.ts.map
