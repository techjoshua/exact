import { createCompiledVNode as __exactVNode, createCompiledFragment as __exactFragment, createExpression as __exactExpression, createDynamicChild as __exactDynamic } from "@exact/core";
import type { Component } from '@exact/core';
import { usStatePaths } from "../../src/data/us-state-paths.js";
import type { ExtraService, ProviderId, RateQuote, RouteResult } from "../../src/types.js";
/** Performs the route map domain operation. */
export function RouteMap(this: Component<{}>, props: {
    route: RouteResult;
    origin: string;
    destination: string;
}) {
    return () => {
        const start = props.route.origin
            ? project(props.route.origin.latitude, props.route.origin.longitude)
            : undefined;
        const end = props.route.destination
            ? project(props.route.destination.latitude, props.route.destination.longitude)
            : undefined;
        const arc = start && end ? arcPath(start, end) : undefined;
        return (__exactVNode("div", { "data-exact-id": "x40vK8LviNBDjIOHiclQWmH", className: "map-wrap" }, __exactVNode("svg", { "data-exact-id": "xUQi5A9dphGjvvmirmfcgVZ", className: "route-map", viewBox: "0 0 800 370", role: "img", "aria-label": __exactExpression(() => start && end
                ? `Approximate route from ${props.origin} to ${props.destination}`
                : 'Approximate United States route map; one or both ZIP codes are unavailable') }, __exactVNode("g", { "data-exact-id": "xgOVZVnJ66j-Z_AyN_C7Fud", className: "map-states" }, __exactDynamic(() => usStatePaths.map((state) => (__exactVNode("path", { "data-exact-id": "xEiLLK_YNN218cyRq_ft33q", className: __exactExpression(() => `land state state-${state.abbreviation.toLowerCase()}`), d: __exactExpression(() => state.d) }, __exactVNode("title", { "data-exact-id": "xoUzv0xs6RpJioxw6TmCAX9" }, __exactDynamic(() => state.name))))))), __exactDynamic(() => arc ? __exactVNode("path", { "data-exact-id": "xGyc6wcM597LqTrAu4Hhg6N", className: "route-arc", d: __exactExpression(() => arc) }) : null), __exactDynamic(() => start ? (__exactFragment({}, __exactVNode("circle", { "data-exact-id": "xUerAWbafknh-knb_qC1Q3f", className: "map-point origin", cx: __exactExpression(() => start.x), cy: __exactExpression(() => start.y), r: "6" }), __exactVNode("circle", { "data-exact-id": "xb2-2jZHX6iBlbCPyTeXkc3", className: "map-halo", cx: __exactExpression(() => start.x), cy: __exactExpression(() => start.y), r: "12" }))) : null), __exactDynamic(() => end ? (__exactFragment({}, __exactVNode("circle", { "data-exact-id": "xb-rwo0lXTLGbYUys9KDCh-", className: "map-point destination", cx: __exactExpression(() => end.x), cy: __exactExpression(() => end.y), r: "6" }), __exactVNode("circle", { "data-exact-id": "xxW2uicyCcDMJGyfxzCx4Xw", className: "map-halo", cx: __exactExpression(() => end.x), cy: __exactExpression(() => end.y), r: "12" }))) : null)), __exactDynamic(() => !start || !end ? (__exactVNode("p", { "data-exact-id": "xtgP9a035nz1v4wdcBt91Ze", className: "map-unavailable" }, "Map location unavailable for one or both ZIP codes.")) : null)));
    };
}
/** Performs the rate card domain operation. */
export function RateCard(this: Component<{}>, props: {
    quote: RateQuote;
    best: boolean;
    refreshing: boolean;
}) {
    return () => (__exactVNode("article", { "data-exact-id": "x2ct0ClXX_vrj0br-hh7Hlg", className: __exactExpression(() => `rate-card${props.quote.compatible ? '' : ' incompatible'}${props.refreshing ? ' refreshing' : ''}`) }, __exactVNode("div", { "data-exact-id": "xT29BnHaf3VARR6lNEXlqjY", className: "rate-main" }, __exactVNode("div", { "data-exact-id": "xH8WYUO16BYZoFHu2UTTDOk", className: "carrier-row" }, __exactVNode("span", { "data-exact-id": "xSsC21dcrLT3aHJeFbu61Wy", className: __exactExpression(() => `carrier-logo ${props.quote.providerId}`) }, __exactDynamic(() => carrierInitials(props.quote.providerId))), __exactVNode("div", { "data-exact-id": "x6XxcGpWBjq4hLVDlOC84H9" }, __exactVNode("p", { "data-exact-id": "xc0Jmb4hF-K5dcpCG8fQU5S" }, __exactDynamic(() => props.quote.providerName), __exactVNode("span", { "data-exact-id": "xGF2sFX27ZP0zEMldO47X0e", className: __exactExpression(() => `source ${props.quote.source}`) }, __exactDynamic(() => props.quote.source === 'mock'
        ? 'Fictional'
        : props.quote.accountRate
            ? 'Account'
            : 'Live'))), __exactVNode("h3", { "data-exact-id": "x5ashgROSoy2s1DsiRZnDeQ" }, __exactDynamic(() => props.quote.serviceName)))), __exactVNode("div", { "data-exact-id": "xL1D7R0_Tlz7GQ6MRiMbZG5", className: "delivery" }, __exactVNode("small", { "data-exact-id": "xVYz7m6DT9pj0WcjTJ0vZVh" }, "Estimated delivery"), __exactVNode("strong", { "data-exact-id": "xnCU-_c39Hw6YVwziUC3Ca3" }, __exactDynamic(() => deliveryLabel(props.quote))), __exactDynamic(() => props.quote.delivery.guaranteed ? __exactVNode("span", { "data-exact-id": "xZHLOEgYpQSx3tcehiFvPSi" }, "Guaranteed") : null)), __exactVNode("div", { "data-exact-id": "x6yncBpz-ecI7TBWs-EYbEC", className: "price" }, __exactVNode("small", { "data-exact-id": "xNZYYT4NO2vqMpURAG-7xsy" }, "Total estimate"), __exactVNode("strong", { "data-exact-id": "xbSRXTAFDq1JlYMcTsopHeW" }, __exactDynamic(() => money(props.quote.totalPriceCents))), __exactDynamic(() => props.best ? __exactVNode("span", { "data-exact-id": "xZWmQpeibRgx_Pr8KzMnDId", className: "best" }, "Best value") : null))), __exactVNode("div", { "data-exact-id": "xGC6u3_8kcgBozFW-dLoEG7", className: "feature-row" }, __exactDynamic(() => props.quote.features.map((feature) => (__exactVNode(Feature, { feature: __exactExpression(() => feature) }))))), __exactVNode("details", { "data-exact-id": "xg075_G7w-zCbhaeQNWr2hR", className: "breakdown" }, __exactVNode("summary", { "data-exact-id": "xd04WpbszH3xfk_N8sePiKS" }, "Price details"), __exactVNode("dl", { "data-exact-id": "x0agzeeuriqV0SAaLvsZHkH" }, __exactDynamic(() => props.quote.charges.map((charge) => (__exactFragment({}, __exactVNode("dt", { "data-exact-id": "xu_QbnraHhjRyBx1v3h92nK" }, __exactDynamic(() => charge.name)), __exactVNode("dd", { "data-exact-id": "xbI4ZJ0v2jNs-lklOwTqHxu" }, __exactDynamic(() => money(charge.amountCents))))))))), __exactDynamic(() => this.map(props.quote.warnings, __exactItem_1 => __exactItem_1, (warning) => (__exactVNode("p", { "data-exact-id": "xiTcbFwPHU99XYg9M5zbnK0", className: "quote-warning" }, __exactDynamic(() => warning))), "xSH4GJqgDzY--CeZ90WX7h9"))));
}
/** Performs the feature domain operation. */
export function Feature(this: Component<{}>, props: {
    feature: ExtraService;
}) {
    return () => (__exactVNode("span", { "data-exact-id": "xOpXXEXk9ivetZQQCL42qOW", className: __exactExpression(() => `feature ${props.feature.availability}${props.feature.selected ? ' selected' : ''}`), title: __exactExpression(() => props.feature.explanation) }, __exactDynamic(() => props.feature.availability === 'included'
        ? '✓'
        : props.feature.availability === 'available'
            ? '+'
            : '×'), __exactDynamic(() => ' '), __exactDynamic(() => props.feature.name), __exactDynamic(() => props.feature.selected &&
        props.feature.availability === 'available' &&
        props.feature.priceCents
        ? ` ${money(props.feature.priceCents)}`
        : props.feature.availability === 'included'
            ? ' included'
            : '')));
}
/** Performs the capitalize domain operation. */
export function capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
}
/** Performs the provider name domain operation. */
export function providerName(id: ProviderId): string {
    return ({ doop: 'DOOP', usps: 'USPS', ups: 'UPS', fedex: 'FedEx', dhl: 'DHL Express' } as Record<ProviderId, string>)[id];
}
function money(cents: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}
function carrierInitials(id: ProviderId): string {
    return { doop: 'D', usps: 'US', ups: 'UP', fedex: 'FX', dhl: 'DH' }[id];
}
function deliveryLabel(quote: RateQuote): string {
    const { minimumDays, maximumDays, estimatedDate } = quote.delivery;
    if (estimatedDate)
        return new Date(`${estimatedDate}T12:00:00`).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });
    if (minimumDays === undefined && maximumDays === undefined)
        return 'Carrier estimate';
    if (minimumDays === maximumDays)
        return `${minimumDays} business day${minimumDays === 1 ? '' : 's'}`;
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
    return { x: 84 + ((longitude + 125) / 59) * 634, y: 52 + ((50 - latitude) / 26) * 235 };
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
    const middle = {
        x: (start.x + end.x) / 2 + (dy / length) * lift,
        y: (start.y + end.y) / 2 - (dx / length) * lift
    };
    return `M ${start.x} ${start.y} Q ${middle.x} ${middle.y} ${end.x} ${end.y}`;
}
//# sourceMappingURL=presentation.exact.client.ts.map
