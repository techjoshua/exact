import { createCompiledVNode as __exactVNode, createCompiledFragment as __exactFragment, createExpression as __exactExpression, createDynamicChild as __exactDynamic, writeReactiveLazy as __exactWrite, updateReactiveValue as __exactUpdate, updateReactiveValueWithResult as __exactUpdateResult, deleteReactiveValue as __exactDelete, mutateReactiveArray as __exactArrayMutation, taskAwait as __exactTaskAwait, createServerBoundary as __exactBoundary } from "@exact/core";
import type { Component } from "@exact/core";
export type ProfileState = {
    saves: number;
    status: string;
};
/** Demonstrates a component with server task state and client-side interaction. */
export function ProfilePage(this: Component<ProfileState>, props: {
    name: string;
}) {
    __exactWrite(this.state, ["saves"], () => 0);
    __exactWrite(this.state, ["status"], () => "Loaded on the server");
    this.task.server(async ({ signal: __exactSignal }) => {
        await __exactTaskAwait(__exactSignal, Promise.resolve());
        __exactWrite(this.state, ["status"], () => `Ready for ${props.name}`);
    });
    return () => (__exactVNode("section", { "data-exact-id": "x-9VbHpbms6-6JYwOBdXZoC" }, __exactVNode("p", { "data-exact-id": "xFaOdLd6Xxx8a37j9LXe_S0" }, __exactDynamic(() => this.state.status)), __exactBoundary("xjbD874UpZxqjxcAu1_iYpK", "ProfilePage_ExactClient_1", { "__exactState": { saves: this.state.saves } })));
}
export { ProfilePage as ProfilePage_ExactServer_1 };
