import { createCompiledVNode as __exactVNode, createCompiledFragment as __exactFragment, createExpression as __exactExpression, createDynamicChild as __exactDynamic, writeReactiveLazy as __exactWrite, updateReactiveValue as __exactUpdate, updateReactiveValueWithResult as __exactUpdateResult, deleteReactiveValue as __exactDelete, mutateReactiveArray as __exactArrayMutation } from "@exactjs/core";
const __exactComponentContract_1 = /* @__PURE__ */ Symbol.for("@exactjs/component-contract");
/** Tracks the state owned by profile. */
export type ProfileState = {
    saves: number;
    status: string;
};
;
export function ProfilePage_ExactClient_1(this: any, props: any = {}) {
    if (props.__exactState)
        Object.assign(this.state, props.__exactState);
    return () => __exactVNode("button", { "data-exact-id": "x_36QDkuwkjhvmVwTM7OF9w", onClick: () => this.state.saves++ }, "Saved ", __exactDynamic(() => this.state.saves), " times");
}
