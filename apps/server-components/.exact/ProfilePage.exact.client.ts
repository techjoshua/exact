import { createCompiledVNode as __exactVNode, createCompiledFragment as __exactFragment, createExpression as __exactExpression, createDynamicChild as __exactDynamic } from "@exact/core";
export type ProfileState = {
    saves: number;
    status: string;
};
;
export function ProfilePage_ExactClient_1(this: any, props: any = {}) {
    if (props.__exactState)
        Object.assign(this.state, props.__exactState);
    return () => __exactVNode("button", { "data-exact-id": "x1nqbqr2", onClick: () => this.state.saves++ }, " Saved ", __exactDynamic(() => this.state.saves), " times ");
}
