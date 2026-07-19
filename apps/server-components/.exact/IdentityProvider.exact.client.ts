import { createCompiledVNode as __exactVNode, createCompiledFragment as __exactFragment, createExpression as __exactExpression, createDynamicChild as __exactDynamic, createDerived as __exactDerived, writeReactiveLazy as __exactWrite, updateReactiveValue as __exactUpdate, updateReactiveValueWithResult as __exactUpdateResult, deleteReactiveValue as __exactDelete, mutateReactiveArray as __exactArrayMutation } from "@exact/core";
import { createContext, type Child, type Component } from '@exact/core';
/** Defines the server authorization interface contract. */
export interface ServerAuthorization {
    roles(): readonly string[];
}
/** Defines the server brand interface contract. */
export interface ServerBrand {
    publicBrand(): Readonly<{
        name: string;
        accent: string;
    }>;
}
/** Defines the authorization interface contract. */
export interface Authorization {
    hasRole(role: string): boolean;
}
/** Defines the brand interface contract. */
export interface Brand {
    name(): string;
    accent(): string;
}
/** Defines the public identity interface contract. */
export interface PublicIdentity {
    roles: string[];
    brand: {
        name: string;
        accent: string;
    };
}
;
;
/** Provides the canonical authorization context value. */
export const AuthorizationContext = createContext<Authorization>('sample.authorization.public', {
    global: true,
    reactive: false
});
/** Provides the canonical brand context value. */
export const BrandContext = createContext<Brand>('sample.brand.public', {
    global: true,
    reactive: false
});
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
    __exactUpdate(this.state, ["roleNames"], previous => previous ?? (props.initial?.roles ?? []).join(','));
    __exactUpdate(this.state, ["brandName"], previous => previous ?? (props.initial?.brand.name ?? ''));
    __exactUpdate(this.state, ["brandAccent"], previous => previous ?? (props.initial?.brand.accent ?? ''));
    const authorization: Authorization = {
        hasRole: (role) => this.state.roleNames.split(',').includes(role)
    };
    const brand = __exactDerived(() => ({
        name: () => this.state.brandName,
        accent: () => this.state.brandAccent
    }));
    this.setContext(AuthorizationContext, authorization);
    this.setContext(BrandContext, brand.get());
    return () => props.children ?? __exactVNode(IdentitySummary, {});
}
/** Performs the identity summary domain operation. */
export function IdentitySummary(this: Component<Record<string, never>>) {
    const authorization = this.getContext(AuthorizationContext);
    const brand = this.getContext(BrandContext);
    return () => (__exactVNode("button", { "data-exact-id": "xvBifhUQE4tSPJDHaflcGTK", "data-brand": __exactExpression(() => brand.name()), "data-accent": __exactExpression(() => brand.accent()), "data-editor": __exactExpression(() => authorization.hasRole('editor') ? 'true' : 'false') }, __exactDynamic(() => brand.name()), ":", __exactDynamic(() => authorization.hasRole('editor') ? 'editor' : 'viewer')));
}
