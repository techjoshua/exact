import { createCompiledVNode as __exactVNode, createDynamicChild as __exactDynamic, createServerBoundary as __exactBoundary, updateReactiveValueWithResult as __exactUpdateResult } from "@exactjs/core";
import type { Component } from '@exactjs/core';
const __exactComponentContract_1 = /* @__PURE__ */ Symbol.for("@exactjs/component-contract");
/** Tracks the state owned by profile. */
export type ProfileState = {
    saves: number;
    status: string;
};
const __exactImplementation_ProfilePage_1 = function ProfilePage(props = {}) {
    return () => __exactBoundary("xbYikRneNIxDY-RhpR8vM3G", "ProfilePage", props);
};
export const ProfilePage: typeof __exactImplementation_ProfilePage_1 = /* @__PURE__ */ (() => Object.assign(__exactImplementation_ProfilePage_1, {
    [Symbol.for("@exactjs/component")]: true,
    [__exactComponentContract_1]: {
        version: 1,
        id: "xRdU3mscyYrAomNNIg-BJhz",
        placement: "isomorphic",
        role: "client",
        implementations: [
            { id: "xYiYxCs7MACQd7b5B61cn89", name: "ProfilePage", role: "root", implementation: __exactImplementation_ProfilePage_1 }
        ],
        continuations: [],
        executors: [],
        boundaries: [
            {
                id: "xrHxq9Y7w8skEZZ2M2GUSX6",
                componentId: "xRdU3mscyYrAomNNIg-BJhz",
                ownerComponentId: "xRdU3mscyYrAomNNIg-BJhz",
                kind: "client-island"
            }
        ],
        resumption: {
            componentId: "xRdU3mscyYrAomNNIg-BJhz",
            statePaths: [
                "saves",
                "status"
            ],
            valueCaptures: [],
            contexts: [],
            boundaries: [
                "xrHxq9Y7w8skEZZ2M2GUSX6"
            ]
        }
    }
}))();
export function ProfilePage_ExactClient_1(this: any, props: any = {}) {
    if (props.__exactState)
        Object.assign(this.state, props.__exactState);
    return () => __exactVNode("button", { "data-exact-id": "xsQT8gL9moAWOGCCuPTnOch", onClick: () => __exactUpdateResult(this.state, ["saves"], previous => {
            const result = previous++;
            return [previous, result];
        }) }, "Saved ", __exactDynamic(() => this.state.saves, "xIodKowU09dfGB3PKWiIA5d"), " times");
}
