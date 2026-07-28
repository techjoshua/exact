import { createCompiledVNode as __exactVNode, createExpression as __exactExpression, createDynamicChild as __exactDynamic, writeReactiveLazy as __exactWrite, updateReactiveValue as __exactUpdate, taskAwait as __exactTaskAwait, markComponentContinuationTask as __exactContinuationTask } from "@exactjs/core";
import { createContext, type Child, type Component } from '@exactjs/core';
/** Defines the server authorization interface contract. */
export interface ServerAuthorization {
    /** @exact shared */
    roles(): readonly string[];
}
/** Defines the server brand interface contract. */
export interface ServerBrand {
    /** @exact shared */
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
/** Provides the canonical server authorization context value. */
export const ServerAuthorizationContext = createContext<ServerAuthorization>('sample.authorization.server', {
    global: true,
    reactive: false,
    keep: 'server',
    scope: 'request'
});
/** Provides the canonical server brand context value. */
export const ServerBrandContext = createContext<ServerBrand>('sample.brand.server', {
    global: true,
    reactive: false,
    keep: 'server',
    scope: 'application'
});
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
/**
 * Reads protected server contexts and projects only explicitly shared public
 * results into client-visible component state.
 */
export function ServerIdentityProjection(this: Component<{
    roleNames: string;
    brandName: string;
    brandAccent: string;
}>) {
    __exactUpdate(this.state, ["roleNames"], previous => previous ?? '');
    __exactUpdate(this.state, ["brandName"], previous => previous ?? '');
    __exactUpdate(this.state, ["brandAccent"], previous => previous ?? '');
    this.task.server(__exactContinuationTask("xBSFY15Nxenh4yiPSTnHZOB", async ({ signal: __exactSignal }) => {
        await __exactTaskAwait(__exactSignal, Promise.resolve());
        const authorization = this.getContext(ServerAuthorizationContext);
        const brand = this.getContext(ServerBrandContext);
        const publicBrand = brand.publicBrand();
        __exactWrite(this.state, ["roleNames"], () => authorization.roles().join(','));
        __exactWrite(this.state, ["brandName"], () => publicBrand.name);
        __exactWrite(this.state, ["brandAccent"], () => publicBrand.accent);
    }));
    return () => (__exactVNode(IdentityProvider, { initial: __exactExpression(() => ({
            roles: this.state.roleNames.split(',').filter(Boolean),
            brand: {
                name: this.state.brandName,
                accent: this.state.brandAccent
            }
        })) }));
}
Object.assign(ServerIdentityProjection, { [Symbol.for("@exactjs/component")]: true });
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
    const brand = {
        name: () => this.state.brandName,
        accent: () => this.state.brandAccent
    };
    this.setContext(AuthorizationContext, authorization);
    this.setContext(BrandContext, brand);
    return () => props.children ?? __exactVNode(IdentitySummary, {});
}
Object.assign(IdentityProvider, { [Symbol.for("@exactjs/component")]: true });
/** Performs the identity summary domain operation. */
export function IdentitySummary(this: Component<Record<string, never>>) {
    const authorization = this.getContext(AuthorizationContext);
    const brand = this.getContext(BrandContext);
    return () => (__exactVNode("button", { "data-exact-id": "xczfR4as2ORYHnW6n2Y0hU9", "data-brand": __exactExpression(() => brand.name()), "data-accent": __exactExpression(() => brand.accent()), "data-editor": __exactExpression(() => authorization.hasRole('editor') ? 'true' : 'false') }, __exactDynamic(() => brand.name(), "xFb9nRzr4451CyTG9GFbdtb"), ":", __exactDynamic(() => authorization.hasRole('editor') ? 'editor' : 'viewer', "xgQR3dLVk7L7B6JPABwp1PX")));
}
Object.assign(IdentitySummary, { [Symbol.for("@exactjs/component")]: true });
