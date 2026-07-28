import { createContext } from '@exactjs/core';

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
	brand: { name: string; accent: string };
}

/** Provides the canonical server authorization context value. */
export const ServerAuthorizationContext = createContext<ServerAuthorization>(
	'sample.authorization.server',
	{
		global: true,
		reactive: false,
		keep: 'server',
		scope: 'request'
	}
);

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
