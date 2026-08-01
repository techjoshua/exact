import { markExactComponent, type Child, type Component } from '@exactjs/core';
import type { RequestContextValue } from './contracts.js';
import { getRequestContext } from './storage.js';
import { RequestContext } from './value.js';

/** Defines the request value and descendants published by RequestProvider. */
export type RequestProviderProps = {
	value?: RequestContextValue;
	children?: Child | Child[];
};

/** Publishes an explicit or ambient request value to descendant components. */
export function RequestProvider(this: Component<{}>, props: RequestProviderProps) {
	const value = props.value ?? getRequestContext();
	if (!value)
		throw new Error('RequestProvider requires an explicit value or active ambient request context');
	this.setContext(RequestContext, value);
	return () => props.children;
}

markExactComponent(RequestProvider, '@exactjs/request:RequestProvider');
