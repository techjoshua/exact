import { createCompiledVNode as __exactVNode, createCompiledFragment as __exactFragment, createExpression as __exactExpression, createDynamicChild as __exactDynamic, writeReactiveLazy as __exactWrite, updateReactiveValue as __exactUpdate, updateReactiveValueWithResult as __exactUpdateResult, deleteReactiveValue as __exactDelete, mutateReactiveArray as __exactArrayMutation, taskAwait as __exactTaskAwait, createServerBoundary as __exactBoundary } from "@exactjs/core";
import type { Component } from '@exactjs/core';
const __exactServerComponentDescriptor_1 = /* @__PURE__ */ Symbol.for("@exactjs/server-component-descriptor");
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
    [__exactServerComponentDescriptor_1]: [
        1,
        [
            ["xn4HBfS6VSk_X0fHSn2U6sr", "ProfilePage_ExactServer_1", __exactImplementation_ProfilePage_1]
        ]
    ]
}))();
export { ProfilePage as ProfilePage_ExactServer_1 };
