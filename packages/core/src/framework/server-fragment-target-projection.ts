import type { AnyComponentInstance, Child } from '../component/contracts.js';
import { createPreparedServerChildRange } from '../component-abi/server-child-range.js';
import { createFragmentTargetProjectionWithRanges } from './fragment-target-projection-plan.js';

/** Projects one server render attempt without creating client subscriptions or effect scopes. */
export function createServerFragmentTargetProjection(
	supplied: Child | (() => Child),
	tag: string,
	owner?: AnyComponentInstance
): (children: readonly Child[]) => Child[] {
	return createFragmentTargetProjectionWithRanges(
		supplied,
		tag,
		owner,
		(read, markerId, mayReplaceSubtree) =>
			createPreparedServerChildRange(read(), markerId, mayReplaceSubtree)
	);
}
