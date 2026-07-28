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
        return (__exactVNode("div", { "data-exact-id": "xDp58UDrjZ9N2m2qKwfBT6H", className: "map-wrap" }, __exactVNode("svg", { "data-exact-id": "xTxmJITmidwy-4_giYItMas", className: "route-map", viewBox: "0 0 800 370", role: "img", "aria-label": __exactExpression(() => {
                const __exact_start_1 = props.route.origin
                    ? project(props.route.origin.latitude, props.route.origin.longitude)
                    : undefined;
                const __exact_end_1 = props.route.destination
                    ? project(props.route.destination.latitude, props.route.destination.longitude)
                    : undefined;
                return __exact_start_1 && __exact_end_1
                    ? `Approximate route from ${props.origin} to ${props.destination}`
                    : 'Approximate United States route map; one or both ZIP codes are unavailable';
            }) }, __exactVNode("g", { "data-exact-id": "xoyawg-_T0VYxOe8bILkuOW", className: "map-states" }, __exactDynamic(() => usStatePaths.map((state) => (__exactVNode("path", { "data-exact-id": "xKFvTrTILHQiH_rCocX036R", className: __exactExpression(() => `land state state-${state.abbreviation.toLowerCase()}`), d: __exactExpression(() => state.d) }, __exactVNode("title", { "data-exact-id": "xsEzxq7ngUoYzqtp_Lvaxgn" }, __exactDynamic(() => state.name, "xJ5GncnHJYEsX50-rnS77CO"))))), "xJWNpQlVqQ_ynPpe4XRDMH_")), __exactDynamic(() => {
            const __exact_arc_1 = start && end ? arcPath(start, end) : undefined;
            return __exact_arc_1 ? __exactVNode("path", { "data-exact-id": "xfXudUIOHDy6MHPra0NU9RN", className: "route-arc", d: __exactExpression(() => __exact_arc_1) }) : null;
        }, "xiVx9kB62DJ58HYzBBl3NSq"), __exactDynamic(() => {
            const __exact_start_1 = props.route.origin
                ? project(props.route.origin.latitude, props.route.origin.longitude)
                : undefined;
            return __exact_start_1 ? (__exactFragment({}, __exactVNode("circle", { "data-exact-id": "xfXudUIOHDy6MHPra0NU9RN", className: "map-point origin", cx: __exactExpression(() => __exact_start_1.x), cy: __exactExpression(() => __exact_start_1.y), r: "6" }), __exactVNode("circle", { "data-exact-id": "xfXudUIOHDy6MHPra0NU9RN", className: "map-halo", cx: __exactExpression(() => __exact_start_1.x), cy: __exactExpression(() => __exact_start_1.y), r: "12" }))) : null;
        }, "xOVy0Z_ta1k0Jo5_pEFHL19"), __exactDynamic(() => {
            const __exact_end_1 = props.route.destination
                ? project(props.route.destination.latitude, props.route.destination.longitude)
                : undefined;
            return __exact_end_1 ? (__exactFragment({}, __exactVNode("circle", { "data-exact-id": "xfXudUIOHDy6MHPra0NU9RN", className: "map-point destination", cx: __exactExpression(() => __exact_end_1.x), cy: __exactExpression(() => __exact_end_1.y), r: "6" }), __exactVNode("circle", { "data-exact-id": "xfXudUIOHDy6MHPra0NU9RN", className: "map-halo", cx: __exactExpression(() => __exact_end_1.x), cy: __exactExpression(() => __exact_end_1.y), r: "12" }))) : null;
        }, "xmRI-t0PsU4Y7EM6uzS2-do")), __exactDynamic(() => {
            const __exact_start_1 = props.route.origin
                ? project(props.route.origin.latitude, props.route.origin.longitude)
                : undefined;
            const __exact_end_1 = props.route.destination
                ? project(props.route.destination.latitude, props.route.destination.longitude)
                : undefined;
            return !__exact_start_1 || !__exact_end_1 ? (__exactVNode("p", { "data-exact-id": "x4qYXzjPW7iNm5Mub38ktoC", className: "map-unavailable" }, "Map location unavailable for one or both ZIP codes.")) : null;
        }, "x_8sxCuYAK45knAWhta_g7O")));
    };
}
Object.assign(RouteMap, { [Symbol.for("@exactjs/component")]: true });
/** Performs the rate card domain operation. */
export function RateCard(this: Component<{}>, props: {
    quote: RateQuote;
    best: boolean;
    refreshing: boolean;
}) {
    return () => (__exactVNode("article", { "data-exact-id": "xRTqcQ-oW8kIqpHwbuXgVwD", className: __exactExpression(() => `rate-card${props.quote.compatible ? '' : ' incompatible'}${props.refreshing ? ' refreshing' : ''}`) }, __exactVNode("div", { "data-exact-id": "xP9KzTXha1EZb7zF2plALCf", className: "rate-main" }, __exactVNode("div", { "data-exact-id": "x5OS0iMK4Df7Y92PE__8KB3", className: "carrier-row" }, __exactVNode("span", { "data-exact-id": "xmB_D-e8b6UYbPjxbw9CvQZ", className: __exactExpression(() => `carrier-logo ${props.quote.providerId}`) }, __exactDynamic(() => carrierInitials(props.quote.providerId), "x2CCezqkp-0IWj9dqWY9xTh")), __exactVNode("div", { "data-exact-id": "x0SqJBhSaEKZ-fN8SGUv4_T" }, __exactVNode("p", { "data-exact-id": "x9X0JgCfhQw1I6Bwlwz_hdH" }, __exactDynamic(() => props.quote.providerName, "x1URsnmvBmxt9iingu33r4R"), __exactVNode("span", { "data-exact-id": "xL2Ru76eF7jXcQeOkfh9aVS", className: __exactExpression(() => `source ${props.quote.source}`) }, __exactDynamic(() => props.quote.source === 'mock'
        ? 'Fictional'
        : props.quote.accountRate
            ? 'Account'
            : 'Live', "xJaSznTc0E8rFky2Axi459i"))), __exactVNode("h3", { "data-exact-id": "xQodZWNpB4Jg_4s9XNx7lcG" }, __exactDynamic(() => props.quote.serviceName, "xj6Dj-3aoJ2gdegBZVP0MmG")))), __exactVNode("div", { "data-exact-id": "x41WTS3OwPZ_hUvmtIBCdqv", className: "delivery" }, __exactVNode("small", { "data-exact-id": "x7ePbyv59nFXV4q6WMtzd2S" }, "Estimated delivery"), __exactVNode("strong", { "data-exact-id": "xBXYLxVNgqRhislqW8ZXdrl" }, __exactDynamic(() => deliveryLabel(props.quote), "xFGzCF1IJHI0cV9SjX-8Kpx")), __exactDynamic(() => props.quote.delivery.guaranteed ? __exactVNode("span", { "data-exact-id": "xA9ns4PSiN04uG0OJfRMVLU" }, "Guaranteed") : null, "xsoWIRVLz-G42TBXp3fPux5")), __exactVNode("div", { "data-exact-id": "x-oT32JFJyWff7zT-aGglDq", className: "price" }, __exactVNode("small", { "data-exact-id": "xywdkPQ4sQiBYeDtHKkTZvu" }, "Total estimate"), __exactVNode("strong", { "data-exact-id": "xkHLAtaJhbDDcNYRM4f13ny" }, __exactDynamic(() => money(props.quote.totalPriceCents), "xX4eE14bJwV7jHPQW1Lsa6g")), __exactDynamic(() => props.best ? __exactVNode("span", { "data-exact-id": "xzsK49xzcbNe3qKEmE0jiG4", className: "best" }, "Best value") : null, "x15Kr0ZpD0df-8GS_8OVUUa"))), __exactVNode("div", { "data-exact-id": "xrBdk79Zu4oAShs-USWPeQG", className: "feature-row" }, __exactDynamic(() => props.quote.features.map((feature) => (__exactVNode(Feature, { feature: __exactExpression(() => feature) }))), "xwigAZZ4XvDiXp_Nm0p-tsM")), __exactVNode("details", { "data-exact-id": "xupKnAp5jb9mIxuqbsUt2ce", className: "breakdown" }, __exactVNode("summary", { "data-exact-id": "xVlwdXy_yj13zH6vxzDjpiv" }, "Price details"), __exactVNode("dl", { "data-exact-id": "x6fbjCQSUDKdKRIbIsVMXOm" }, __exactDynamic(() => props.quote.charges.map((charge) => (__exactFragment({}, __exactVNode("dt", { "data-exact-id": "xGUwghhmi7hJe2LoixevVVm" }, __exactDynamic(() => charge.name, "xYeOMa6h4FH-9eWr6Wt5GC_")), __exactVNode("dd", { "data-exact-id": "xRfjSW9fUdljdQUabbqaz7M" }, __exactDynamic(() => money(charge.amountCents), "x6nnDaHFv-mM9RCp30uI3YK"))))), "xz6SI0tGffsn6mvYTTd92TI"))), __exactDynamic(() => this.map(props.quote.warnings, __exactItem => __exactItem, (warning) => (__exactVNode("p", { "data-exact-id": "xpY3o7josg14DCs_bJjWZXr", className: "quote-warning" }, __exactDynamic(() => warning, "xuygJxfUQZ_Id7z2lj76Htb")))), "xnvovAhc1kPRFPBVU8mu6UP")));
}
/** Performs the feature domain operation. */
export function Feature(this: Component<{}>, props: {
    feature: ExtraService;
}) {
    return () => (__exactVNode("span", { "data-exact-id": "xJdwdQwS8kkujRuBZPCJxbv", className: __exactExpression(() => `feature ${props.feature.availability}${props.feature.selected ? ' selected' : ''}`), title: __exactExpression(() => props.feature.explanation) }, __exactDynamic(() => props.feature.availability === 'included'
        ? '✓'
        : props.feature.availability === 'available'
            ? '+'
            : '×', "xZXWp6ENYC1z-Tm4OEP8R3R"), __exactDynamic(() => ' ', "x6bwTz-4fuJs3-3EKd71L9e"), __exactDynamic(() => props.feature.name, "xfDzB72xlVITfwzCfeYIvGZ"), __exactDynamic(() => props.feature.selected &&
        props.feature.availability === 'available' &&
        props.feature.priceCents
        ? ` ${money(props.feature.priceCents)}`
        : props.feature.availability === 'included'
            ? ' included'
            : '', "xjcD9ZwlK5_EGSyMqK_PQde")));
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
