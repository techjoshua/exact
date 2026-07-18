import { createCompiledVNode as __exactVNode, createCompiledFragment as __exactFragment, createExpression as __exactExpression, createDynamicChild as __exactDynamic, createDerived as __exactDerived, writeReactiveLazy as __exactWrite, updateReactiveValue as __exactUpdate, updateReactiveValueWithResult as __exactUpdateResult, deleteReactiveValue as __exactDelete, mutateReactiveArray as __exactArrayMutation, taskAwait as __exactTaskAwait } from "@exact/core";
import { createContext, type Child, type Component } from "@exact/core";
export interface ServerAuthorization {
    roles(): readonly string[];
}
export interface ServerBrand {
    publicBrand(): Readonly<{
        name: string;
        accent: string;
    }>;
}
export interface Authorization {
    hasRole(role: string): boolean;
}
export interface Brand {
    name(): string;
    accent(): string;
}
export interface PublicIdentity {
    roles: string[];
    brand: {
        name: string;
        accent: string;
    };
}
export const ServerAuthorizationContext = createContext<ServerAuthorization>("sample.authorization.server", {
    global: true,
    reactive: false,
    keep: "server",
    scope: "request"
});
export const ServerBrandContext = createContext<ServerBrand>("sample.brand.server", {
    global: true,
    reactive: false,
    keep: "server",
    scope: "application"
});
export const AuthorizationContext = createContext<Authorization>("sample.authorization.public", { global: true, reactive: false });
export const BrandContext = createContext<Brand>("sample.brand.public", { global: true, reactive: false });
/** Reads protected server contexts and projects only public identity state. */
export function ServerIdentityProjection(this: Component<{
    roleNames: string;
    brandName: string;
    brandAccent: string;
}>) {
    __exactUpdate(this.state, ["roleNames"], previous => previous ?? "");
    __exactUpdate(this.state, ["brandName"], previous => previous ?? "");
    __exactUpdate(this.state, ["brandAccent"], previous => previous ?? "");
    this.task.server(async ({ signal: __exactSignal }) => {
        await __exactTaskAwait(__exactSignal, Promise.resolve());
        const authorization = this.getContext(ServerAuthorizationContext);
        const brand = this.getContext(ServerBrandContext);
        const publicBrand = brand.publicBrand();
        __exactWrite(this.state, ["roleNames"], () => authorization.roles().join(","));
        __exactWrite(this.state, ["brandName"], () => publicBrand.name);
        __exactWrite(this.state, ["brandAccent"], () => publicBrand.accent);
    });
    return () => (__exactVNode(IdentityProvider, { initial: __exactExpression(() => ({
            roles: this.state.roleNames.split(",").filter(Boolean),
            brand: {
                name: this.state.brandName,
                accent: this.state.brandAccent
            }
        })) }));
}
/**
 * Reconstructs public context methods from plain state during both SSR and
 * hydration. This context remains component-tree scoped.
 */
export function IdentityProvider(this: Component<{
    roleNames: string;
    brandName: string;
    brandAccent: string;
}>, props: {
    initial?: PublicIdentity;
    children?: Child;
}) {
    __exactUpdate(this.state, ["roleNames"], previous => previous ?? (props.initial?.roles ?? []).join(","));
    __exactUpdate(this.state, ["brandName"], previous => previous ?? (props.initial?.brand.name ?? ""));
    __exactUpdate(this.state, ["brandAccent"], previous => previous ?? (props.initial?.brand.accent ?? ""));
    const authorization: Authorization = {
        hasRole: role => this.state.roleNames.split(",").includes(role)
    };
    const brand = __exactDerived(() => ({
        name: () => this.state.brandName,
        accent: () => this.state.brandAccent
    }));
    this.setContext(AuthorizationContext, authorization);
    this.setContext(BrandContext, brand.get());
    return () => props.children ?? __exactVNode(IdentitySummary, {});
}
export function IdentitySummary(this: Component<Record<string, never>>) {
    const authorization = this.getContext(AuthorizationContext);
    const brand = this.getContext(BrandContext);
    return () => (__exactVNode("button", { "data-exact-id": "xVWFTRbOBqLn8B_yGf6mTEp", "data-brand": __exactExpression(() => brand.name()), "data-accent": __exactExpression(() => brand.accent()), "data-editor": __exactExpression(() => authorization.hasRole("editor") ? "true" : "false") }, __exactDynamic(() => brand.name()), ":", __exactDynamic(() => authorization.hasRole("editor") ? "editor" : "viewer")));
}
