import { createCompiledVNode as __exactVNode, createDynamicChild as __exactDynamic, createServerBoundary as __exactBoundary, writeReactiveLazy as __exactWrite, taskAwait as __exactTaskAwait, markComponentContinuationTask as __exactContinuationTask } from "@exactjs/core";
import type { Component } from '@exactjs/core';
const __exactComponentContract_1 = /* @__PURE__ */ Symbol.for("@exactjs/component-contract");
/** Tracks the state owned by profile. */
export type ProfileState = {
    saves: number;
    status: string;
};
const __exactImplementation_ProfilePage_1 = function ProfilePage(this: Component<ProfileState>, props: {
    name: string;
}) {
    __exactWrite(this.state, ["saves"], () => 0);
    __exactWrite(this.state, ["status"], () => 'Loaded on the server');
    this.task.server(this.reactive(() => props.name), __exactContinuationTask("x3JLureiZflgJmddVWOBoBF", async (__exactDependency: string, { signal: __exactSignal }) => {
        await __exactTaskAwait(__exactSignal, Promise.resolve());
        __exactWrite(this.state, ["status"], () => `Ready for ${__exactDependency}`);
    }));
    return () => (__exactVNode("section", { "data-exact-id": "x91DlmGFHlO7hRIHCYfi6W4" }, __exactVNode("p", { "data-exact-id": "x0uIyTxI6b8R0bMrkGRfcdZ" }, __exactDynamic(() => this.state.status, "x6tBszz1lCYsoheQvnH_Oxo")), __exactBoundary("xrHxq9Y7w8skEZZ2M2GUSX6", "ProfilePage_ExactClient_1", { "__exactState": { saves: this.state.saves }, __exactHydration: "interaction", __exactHydrationFallback: __exactVNode("button", { "data-exact-id": "xsQT8gL9moAWOGCCuPTnOch" }, "Saved ", __exactDynamic(() => this.state.saves, "xIodKowU09dfGB3PKWiIA5d"), " times") })));
};
export const ProfilePage: typeof __exactImplementation_ProfilePage_1 = /* @__PURE__ */ (() => Object.assign(__exactImplementation_ProfilePage_1, {
    [Symbol.for("@exactjs/component")]: true,
    [__exactComponentContract_1]: {
        version: 1,
        id: "xRdU3mscyYrAomNNIg-BJhz",
        placement: "isomorphic",
        role: "executor",
        implementations: [
            { id: "xsX_qll2rbi25aQ5cBiDmbh", name: "ProfilePage_ExactServer_1", role: "server-part", implementation: __exactImplementation_ProfilePage_1 }
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
export { ProfilePage as ProfilePage_ExactServer_1 };
