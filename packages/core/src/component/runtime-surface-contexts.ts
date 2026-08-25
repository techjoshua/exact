import type { Reactive } from '@exactjs/reactive/framework/runtime';
import { componentContextCapability } from './context-capability.js';
import type { AnyComponentInstance, ContextToken } from './contracts.js';
import { registerComponentRuntimeSurface } from './runtime-surface-registration.js';

function hasContext(
	this: AnyComponentInstance,
	token: ContextToken<unknown>
): boolean {
	this.contextTokens.set(token.id, token);
	const capability = componentContextCapability();
	capability.publish(this, token, 'read');
	return capability.has(this, this.ambientContexts, token);
}

function getContext<T>(this: AnyComponentInstance, token: ContextToken<T>): Reactive<T> {
	this.contextTokens.set(token.id, token);
	const capability = componentContextCapability();
	capability.publish(this, token, 'read');
	return capability.get(this, this.ambientContexts, token);
}

function setContext<T>(this: AnyComponentInstance, token: ContextToken<T>, value: T): void {
	this.contextTokens.set(token.id, token);
	const capability = componentContextCapability();
	capability.set(this, token, value);
	capability.publish(this, token, 'write');
}

registerComponentRuntimeSurface({
	hasContext: { configurable: true, writable: true, value: hasContext },
	getContext: { configurable: true, writable: true, value: getContext },
	setContext: { configurable: true, writable: true, value: setContext }
});
