import { createCompiledVNode as __exactVNode, createCompiledFragment as __exactFragment, createExpression as __exactExpression, createDynamicChild as __exactDynamic, writeReactiveLazy as __exactWrite, updateReactiveValue as __exactUpdate, updateReactiveValueWithResult as __exactUpdateResult, deleteReactiveValue as __exactDelete, mutateReactiveArray as __exactArrayMutation } from "@exact/core";
const __exactClientComponentDescriptor_1 = /* @__PURE__ */ Symbol.for("@exact/client-component-descriptor");
export type ProfileState = {
    saves: number;
    status: string;
};
;
export function ProfilePage_ExactClient_1(this: any, props: any = {}) {
    if (props.__exactState)
        Object.assign(this.state, props.__exactState);
    return () => __exactVNode("button", { "data-exact-id": "xSkXUMmN400ovy0DWzCMFPp", onClick: () => this.state.saves++ }, " Saved ", __exactDynamic(() => this.state.saves), " times ");
}
