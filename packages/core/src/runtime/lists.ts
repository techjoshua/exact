/** Compiler-selected registration for component keyed-list ownership. */
import '../component/list-capability-integration.js';
import '../component/runtime-surface-lists.js';
import type { ReactiveValue } from '@exactjs/reactive/framework/runtime';
import type { Child } from '../component/contracts.js';
import { componentListCapability } from '../component/list-capability.js';

/** Evaluates one compiler-keyed render-program lane through its component-local range cache. */
export function mapExactCompiledKeyedChildren<T>(
	owner: object,
	collection: Iterable<T> | ReactiveValue<Iterable<T>>,
	key: (item: T) => string,
	render: (item: T) => Child,
	id: string,
	provenance?: Iterable<T>,
	keyIdentity?: string
): Child[] {
	return componentListCapability().mapDirect(
		owner,
		collection,
		key,
		render,
		id,
		provenance,
		keyIdentity
	);
}
