import type { ExactServerExecutableComponentContract } from '@exactjs/core/framework/component-contracts';

const dependencies = new WeakMap<ExactServerExecutableComponentContract, ReadonlySet<string>>();

/**
 * Capturing shared context requires its producer's completed continuation identity as well as its
 * value. A context write can precede task completion; publishing it early would replay the task
 * during hydration. Only writers of compiler-selected captured contexts become dependencies.
 */
export function contextPublicationDependencies(
	contract: ExactServerExecutableComponentContract
): ReadonlySet<string> | undefined {
	const contexts = contract.resumption?.contexts;
	if (!contexts?.length) return undefined;
	let required = dependencies.get(contract);
	if (!required) {
		required = new Set(
			contract.continuations
				.filter((continuation) =>
					continuation.contextWrites?.some((name) => contexts.includes(name))
				)
				.map((continuation) => continuation.id)
		);
		dependencies.set(contract, required);
	}
	return required;
}
