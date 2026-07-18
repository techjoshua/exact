import { createCompiledVNode as __exactVNode, createCompiledFragment as __exactFragment, createExpression as __exactExpression, createDynamicChild as __exactDynamic, createDerived as __exactDerived, writeReactiveLazy as __exactWrite, updateReactiveValue as __exactUpdate, updateReactiveValueWithResult as __exactUpdateResult, deleteReactiveValue as __exactDelete, mutateReactiveArray as __exactArrayMutation } from "@exact/core";
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
;
;
export const AuthorizationContext = createContext<Authorization>("sample.authorization.public", { global: true, reactive: false });
export const BrandContext = createContext<Brand>("sample.brand.public", { global: true, reactive: false });
;
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
    return () => (__exactVNode("button", { "data-exact-id": "xrAsRsxwT1oc4dLm7ySe-b6", "data-brand": __exactExpression(() => brand.name()), "data-accent": __exactExpression(() => brand.accent()), "data-editor": __exactExpression(() => authorization.hasRole("editor") ? "true" : "false") }, __exactDynamic(() => brand.name()), ":", __exactDynamic(() => authorization.hasRole("editor") ? "editor" : "viewer")));
}
