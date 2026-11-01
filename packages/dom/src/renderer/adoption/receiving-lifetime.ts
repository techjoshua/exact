import type { EffectScope } from '@exactjs/reactive/framework/runtime';
import { roots } from '../../state.js';
import type { Root } from '../../types.js';

/** Carries one canceled acquisition and its own suppressed cleanup failures. */
class AdoptionSuperseded extends Error {}

/** Identifies private cancellation without translating it into a markup mismatch. */
export function isAdoptionSuperseded(value: unknown): boolean {
	return value instanceof AdoptionSuperseded;
}

/**
 * Captures one receiving epoch before callback-bearing adoption acquires its output.
 * Target updates return false on cancellation. Only their initial hydration has an adoption
 * caller that can unwind the private signal without reporting it as an authored reactive error.
 */
export function captureAdoptionCurrent(
	root: Root,
	scope: EffectScope,
	allowCanceledUpdate = false
): () => boolean {
	const initialAdoption =
		!root.initialCommitComplete && (root.mode === 'hydrated' || root.mode === 'document');
	const registered = roots.get(root.container);
	const attempt = root.componentInputAttempt;
	const version = root.version;
	const plan = root.suppliedPlacementPlan;
	return () => {
		if (
			!scope.active ||
			roots.get(root.container) !== registered ||
			root.componentInputAttempt !== attempt ||
			root.version !== version ||
			attempt?.disposed ||
			(plan && !plan.isCurrent())
		) {
			if (!allowCanceledUpdate || initialAdoption)
				throw new AdoptionSuperseded('Hydration receiving lifetime was superseded');
			return false;
		}
		return true;
	};
}
