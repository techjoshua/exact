import type {
	ExactServerComponentExecution,
	ExactServerExecutableComponentContract
} from '@exactjs/core/framework/component-contracts';

/** Selects complete client ownership from local publication or an unpartitioned root contract. */
export function ownsClientResumption(contract: ExactServerExecutableComponentContract): boolean {
	return (
		(contract.placement === 'client' || contract.placement === 'isomorphic') &&
		// Local activation owns the client subtree even when descriptive boundaries
		// contain candidates that the compiler did not emit as independent islands.
		((contract.artifact.execution.publication?.kind === 'resumption' &&
			contract.continuations.length === 0) ||
			!contract.boundaries.some((boundary) => boundary.kind === 'client-island'))
	);
}

/** An existing client owner adopts a descendant instead of publishing another island. */
export function needsIndependentResumption(
	publication: ExactServerComponentExecution['publication'],
	hasComponentAncestor: boolean,
	clientResumptionOwner: boolean | undefined,
	rendererEnhancement = false
): publication is NonNullable<ExactServerComponentExecution['publication']> {
	return (
		hasComponentAncestor &&
		publication?.kind === 'resumption' &&
		!clientResumptionOwner &&
		!rendererEnhancement
	);
}
