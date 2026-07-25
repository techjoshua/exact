import { createCompiledVNode as __exactVNode, createCompiledFragment as __exactFragment, createExpression as __exactExpression, createDynamicChild as __exactDynamic } from "@exactjs/core";
import type { Component } from '@exactjs/core';
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
        return (__exactVNode("div", { "data-exact-id": "xtCHfrTpHvMV-JmO_1ZRjGF", className: "map-wrap" }, __exactVNode("svg", { "data-exact-id": "x_LVQ6L9qgtVH6-ndCv5POe", className: "route-map", viewBox: "0 0 800 370", role: "img", "aria-label": __exactExpression(() => (props.route.origin
                ? project(props.route.origin.latitude, props.route.origin.longitude)
                : undefined)
                &&
                    (props.route.destination
                        ? project(props.route.destination.latitude, props.route.destination.longitude)
                        : undefined)
                ? `Approximate route from ${props.origin} to ${props.destination}`
                : 'Approximate United States route map; one or both ZIP codes are unavailable') }, __exactVNode("g", { "data-exact-id": "xg9aQflOSTH-UOsPXPsbv7P", className: "map-states" }, __exactDynamic(() => usStatePaths.map((state) => (__exactVNode("path", { "data-exact-id": "xIKrJYAJcbO5iYcgxjWbcWd", className: __exactExpression(() => `land state state-${state.abbreviation.toLowerCase()}`), d: __exactExpression(() => state.d) }, __exactVNode("title", { "data-exact-id": "x_AosT7DNY25bOPwc_B6Ash" }, __exactDynamic(() => state.name))))))), __exactDynamic(() => ((props.route.origin
            ? project(props.route.origin.latitude, props.route.origin.longitude)
            : undefined)
            &&
                (props.route.destination
                    ? project(props.route.destination.latitude, props.route.destination.longitude)
                    : undefined) ? arcPath((props.route.origin
            ? project(props.route.origin.latitude, props.route.origin.longitude)
            : undefined), (props.route.destination
            ? project(props.route.destination.latitude, props.route.destination.longitude)
            : undefined)) : undefined)
            ? __exactVNode("path", { "data-exact-id": "xzZm9eczoahoRg5ZisTPzEF", className: "route-arc", d: __exactExpression(() => ((props.route.origin
                    ? project(props.route.origin.latitude, props.route.origin.longitude)
                    : undefined)
                    &&
                        (props.route.destination
                            ? project(props.route.destination.latitude, props.route.destination.longitude)
                            : undefined) ? arcPath((props.route.origin
                    ? project(props.route.origin.latitude, props.route.origin.longitude)
                    : undefined), (props.route.destination
                    ? project(props.route.destination.latitude, props.route.destination.longitude)
                    : undefined)) : undefined)) }) : null), __exactDynamic(() => (props.route.origin
            ? project(props.route.origin.latitude, props.route.origin.longitude)
            : undefined)
            ? (__exactFragment({}, __exactVNode("circle", { "data-exact-id": "x9S79WVa96qfzc1Dj0foxtT", className: "map-point origin", cx: __exactExpression(() => (props.route.origin
                    ? project(props.route.origin.latitude, props.route.origin.longitude)
                    : undefined).x), cy: __exactExpression(() => (props.route.origin
                    ? project(props.route.origin.latitude, props.route.origin.longitude)
                    : undefined).y), r: "6" }), __exactVNode("circle", { "data-exact-id": "xiNekTMkZJnsWYWBL7vH3sg", className: "map-halo", cx: __exactExpression(() => (props.route.origin
                    ? project(props.route.origin.latitude, props.route.origin.longitude)
                    : undefined).x), cy: __exactExpression(() => (props.route.origin
                    ? project(props.route.origin.latitude, props.route.origin.longitude)
                    : undefined).y), r: "12" }))) : null), __exactDynamic(() => (props.route.destination
            ? project(props.route.destination.latitude, props.route.destination.longitude)
            : undefined)
            ? (__exactFragment({}, __exactVNode("circle", { "data-exact-id": "xeDIrDYZ6CdVjt1dRAZKqn0", className: "map-point destination", cx: __exactExpression(() => (props.route.destination
                    ? project(props.route.destination.latitude, props.route.destination.longitude)
                    : undefined).x), cy: __exactExpression(() => (props.route.destination
                    ? project(props.route.destination.latitude, props.route.destination.longitude)
                    : undefined).y), r: "6" }), __exactVNode("circle", { "data-exact-id": "x0PWQiFgaZ2iFPlfNvJZ4oY", className: "map-halo", cx: __exactExpression(() => (props.route.destination
                    ? project(props.route.destination.latitude, props.route.destination.longitude)
                    : undefined).x), cy: __exactExpression(() => (props.route.destination
                    ? project(props.route.destination.latitude, props.route.destination.longitude)
                    : undefined).y), r: "12" }))) : null)), __exactDynamic(() => !(props.route.origin
            ? project(props.route.origin.latitude, props.route.origin.longitude)
            : undefined) || !(props.route.destination
            ? project(props.route.destination.latitude, props.route.destination.longitude)
            : undefined) ? (__exactVNode("p", { "data-exact-id": "x1lZMvfXk6FcnBek3T8DSl9", className: "map-unavailable" }, "Map location unavailable for one or both ZIP codes.")) : null)));
    };
}
/** Performs the rate card domain operation. */
export function RateCard(this: Component<{}>, props: {
    quote: RateQuote;
    best: boolean;
    refreshing: boolean;
}) {
    return () => (__exactVNode("article", { "data-exact-id": "xoyNNtqb1F8mehj5PAYC3DG", className: __exactExpression(() => `rate-card${props.quote.compatible ? '' : ' incompatible'}${props.refreshing ? ' refreshing' : ''}`) }, __exactVNode("div", { "data-exact-id": "x0Bei12C9RA9fW6htntR2DI", className: "rate-main" }, __exactVNode("div", { "data-exact-id": "xZ-QOOv3BrXNWLcNnETPJHA", className: "carrier-row" }, __exactVNode("span", { "data-exact-id": "xTeNgACdJJzZgunhQfxTYC4", className: __exactExpression(() => `carrier-logo ${props.quote.providerId}`) }, __exactDynamic(() => carrierInitials(props.quote.providerId))), __exactVNode("div", { "data-exact-id": "xr9jCb-uoeG2bVQ7qPXUbI0" }, __exactVNode("p", { "data-exact-id": "x77eSB0WchuPyPeEAghJIne" }, __exactDynamic(() => props.quote.providerName), __exactVNode("span", { "data-exact-id": "xLPdAHHB24cszltOcmUegs6", className: __exactExpression(() => `source ${props.quote.source}`) }, __exactDynamic(() => props.quote.source === 'mock'
        ? 'Fictional'
        : props.quote.accountRate
            ? 'Account'
            : 'Live'))), __exactVNode("h3", { "data-exact-id": "x7lQ3Xlduu6efJX-QXscYIr" }, __exactDynamic(() => props.quote.serviceName)))), __exactVNode("div", { "data-exact-id": "xmowQvgJmUBkqMAVoLY3OOP", className: "delivery" }, __exactVNode("small", { "data-exact-id": "xEseSXok8adt96TdL7ojZtp" }, "Estimated delivery"), __exactVNode("strong", { "data-exact-id": "xvpvzwu8F0i_umoWAMGcf_A" }, __exactDynamic(() => deliveryLabel(props.quote))), __exactDynamic(() => props.quote.delivery.guaranteed ? __exactVNode("span", { "data-exact-id": "xMYqYyl5edTd6FEtvnJ-rTn" }, "Guaranteed") : null)), __exactVNode("div", { "data-exact-id": "xhXxMLl4TCix_7a8Lnz6WYJ", className: "price" }, __exactVNode("small", { "data-exact-id": "xnq4kfT8a8zgZS5M7wRDPMK" }, "Total estimate"), __exactVNode("strong", { "data-exact-id": "xp7hCJyKA4Fkh9_2dP4IdLV" }, __exactDynamic(() => money(props.quote.totalPriceCents))), __exactDynamic(() => props.best ? __exactVNode("span", { "data-exact-id": "xva_2xdjIud1jvx5COrPXAF", className: "best" }, "Best value") : null))), __exactVNode("div", { "data-exact-id": "xJgSKFG8z4IinREANcgv09X", className: "feature-row" }, __exactDynamic(() => props.quote.features.map((feature) => (__exactVNode(Feature, { feature: __exactExpression(() => feature) }))))), __exactVNode("details", { "data-exact-id": "x2UaH5oJkMklCliaKKMlHP0", className: "breakdown" }, __exactVNode("summary", { "data-exact-id": "x8fgyuPCQTP92WcEVoKttkB" }, "Price details"), __exactVNode("dl", { "data-exact-id": "x39sigucqlArQr2CCV_pdC1" }, __exactDynamic(() => props.quote.charges.map((charge) => (__exactFragment({}, __exactVNode("dt", { "data-exact-id": "xER7LsBqZ2ZRht7aqYSS4ez" }, __exactDynamic(() => charge.name)), __exactVNode("dd", { "data-exact-id": "xsF4zsiN0YmaQoCsu9mHAgB" }, __exactDynamic(() => money(charge.amountCents))))))))), __exactDynamic(() => this.map(props.quote.warnings, __exactItem_1 => __exactItem_1, (warning) => (__exactVNode("p", { "data-exact-id": "xHobkfxhRADLDF-qykhmfXI", className: "quote-warning" }, __exactDynamic(() => warning))), "xEaPzCGC2Yw1c-5NwCn4VmQ"))));
}
/** Performs the feature domain operation. */
export function Feature(this: Component<{}>, props: {
    feature: ExtraService;
}) {
    return () => (__exactVNode("span", { "data-exact-id": "xk42ZreCiS9vLT8HsgQONFA", className: __exactExpression(() => `feature ${props.feature.availability}${props.feature.selected ? ' selected' : ''}`), title: __exactExpression(() => props.feature.explanation) }, __exactDynamic(() => props.feature.availability === 'included'
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
//# sourceMappingURL=presentation.exact.server.ts.map
