import { createCompiledVNode as __exactVNode, createCompiledFragment as __exactFragment, createExpression as __exactExpression, createDynamicChild as __exactDynamic, writeReactiveLazy as __exactWrite, updateReactiveValue as __exactUpdate, updateReactiveValueWithResult as __exactUpdateResult, deleteReactiveValue as __exactDelete, mutateReactiveArray as __exactArrayMutation } from "@exactjs/core";
const __exactClientComponentDescriptor_1 = /* @__PURE__ */ Symbol.for("@exactjs/client-component-descriptor");
/** Tracks the state owned by profile. */
export type ProfileState = {
    saves: number;
    status: string;
};
;
export function ProfilePage_ExactClient_1(this: any, props: any = {}) {
    if (props.__exactState)
        Object.assign(this.state, props.__exactState);
    return () => __exactVNode("button", { "data-exact-id": "xvwdM8r3Rs6YaX-lxA_RXFo", onClick: () => this.state.saves++ }, "Saved ", __exactDynamic(() => this.state.saves), " times");
}
