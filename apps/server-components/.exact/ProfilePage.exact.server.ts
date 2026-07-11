import { createCompiledVNode as __exactVNode, createCompiledFragment as __exactFragment, createExpression as __exactExpression, createDynamicChild as __exactDynamic, createServerBoundary as __exactBoundary } from "@exact/core";
import type { Component } from "@exact/core";
export type ProfileState = {
    saves: number;
    status: string;
};
export function ProfilePage(this: Component<ProfileState>, props: {
    name: string;
}) {
    this.state.saves = 0;
    this.state.status = "Loaded on the server";
    this.task.server(async () => {
        await Promise.resolve();
        this.state.status = `Ready for ${props.name}`;
    });
    return () => (__exactVNode("section", { "data-exact-id": "x8zes4k" }, __exactVNode("p", { "data-exact-id": "x1a3xvng" }, __exactDynamic(() => this.state.status)), __exactBoundary("x1wcbdtx", "ProfilePage_ExactClient_1", { "__exactState": { saves: this.state.saves } })));
}
export { ProfilePage as ProfilePage_ExactServer_1 };
