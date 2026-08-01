import type { ComponentInstance, ContextToken } from './contracts.js';
import { componentDomainInspection } from './domain.js';

/** Publishes a value-free context access event when runtime inspection is attached. */
export function publishContextAccess(
	instance: ComponentInstance<any>,
	token: ContextToken<unknown>,
	operation: 'read' | 'write'
): void {
	componentDomainInspection(instance.domain)?.publish({
		kind: 'context.access',
		component: instance,
		attributes: Object.freeze({
			name: token.description,
			scope: token.scope,
			availability:
				token.keep === 'secret' ? 'secret' : token.keep === 'server' ? 'resource' : 'value',
			operation
		})
	});
}
