import { createCompiledVNode as __exactVNode, createCompiledFragment as __exactFragment, createExpression as __exactExpression, createDynamicChild as __exactDynamic, writeReactiveLazy as __exactWrite, updateReactiveValue as __exactUpdate, updateReactiveValueWithResult as __exactUpdateResult, deleteReactiveValue as __exactDelete, mutateReactiveArray as __exactArrayMutation, taskAwait as __exactTaskAwait, createServerBoundary as __exactBoundary } from "@exactjs/core";
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
    this.task.server(this.reactive(() => props.name), async (__exactDependency, { signal: __exactSignal }) => {
        await __exactTaskAwait(__exactSignal, Promise.resolve());
        __exactWrite(this.state, ["status"], () => `Ready for ${__exactDependency}`);
    });
    return () => (__exactVNode("section", { "data-exact-id": "xbSlycRQOMTMIout-46XRGt" }, __exactVNode("p", { "data-exact-id": "xI2oufUW56KAQo6TSBTmvEG" }, __exactDynamic(() => this.state.status)), __exactBoundary("xjbD874UpZxqjxcAu1_iYpK", "ProfilePage_ExactClient_1", { "__exactState": { saves: this.state.saves } })));
};
export const ProfilePage: typeof __exactImplementation_ProfilePage_1 = /* @__PURE__ */ (() => Object.assign(__exactImplementation_ProfilePage_1, {
    [__exactComponentContract_1]: {
        version: 1,
        id: "x7gsBV1RVj9VfGBkq4km6f7",
        placement: "isomorphic",
        role: "executor",
        implementations: [
            { id: "xn4HBfS6VSk_X0fHSn2U6sr", name: "ProfilePage_ExactServer_1", role: "server-part", implementation: __exactImplementation_ProfilePage_1 }
        ],
        continuations: [
            {
                id: "x3JLureiZflgJmddVWOBoBF",
                componentId: "x7gsBV1RVj9VfGBkq4km6f7",
                stateReads: [],
                stateWrites: [
                    {
                        path: "status",
                        kind: "write",
                        confidence: "exact"
                    }
                ],
                publicContexts: [],
                serverContexts: [],
                boundaries: [
                    "xjbD874UpZxqjxcAu1_iYpK"
                ]
            }
        ],
        boundaries: [
            {
                id: "xjbD874UpZxqjxcAu1_iYpK",
                componentId: "x7gsBV1RVj9VfGBkq4km6f7",
                ownerComponentId: "x7gsBV1RVj9VfGBkq4km6f7",
                kind: "client-island"
            }
        ],
        resumption: {
            componentId: "x7gsBV1RVj9VfGBkq4km6f7",
            statePaths: [
                "saves"
            ],
            valueCaptures: [],
            boundaries: [
                "xjbD874UpZxqjxcAu1_iYpK"
            ]
        }
    }
}))();
export { ProfilePage as ProfilePage_ExactServer_1 };
