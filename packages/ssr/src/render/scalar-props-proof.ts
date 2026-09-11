import type { ServerComponentReference } from './server-component-reference.js';

// Separate installed SSR copies must consume the same proof when an invocation crosses them.
const scalarPropsProof = Symbol.for('exact.ssr.scalar-props');
const scalarPropsAttempted = Symbol.for('exact.ssr.scalar-props-attempted');

type ScalarPropsInvocation = { [scalarPropsAttempted]?: boolean };

/** Reports previous issuance, including failed proofs whose inputs may already be exposed. */
export function hasScalarPropsAttempt(invocation: object): boolean {
	return !!(invocation as ScalarPropsInvocation)[scalarPropsAttempted];
}

type ScalarPropsReference = ServerComponentReference & {
	[scalarPropsProof]?: Readonly<Record<string, unknown>>;
};

/**
 * Retains a compiler proof for a fresh, private, entirely scalar prop bag.
 * The compiler must establish the complete field set and check actual values. Types alone are
 * insufficient. Normalization that replaced the input bag invalidates this proof immediately.
 * Only the first attempt in one prepared program invocation may issue a proof, even if its
 * predicate fails; later visits may observe inputs exposed by an earlier component execution.
 */
export function markScalarPropsProof(
	reference: ServerComponentReference,
	props: unknown,
	invocation: object,
	key: string | null,
	privateProps = true
): void {
	const owner = invocation as ScalarPropsInvocation;
	if (owner[scalarPropsAttempted]) return;
	owner[scalarPropsAttempted] = true;
	if (!privateProps || reference.props !== props) return;
	const value = key === null ? null : reference.props[key];
	if (value === null || (typeof value !== 'object' && typeof value !== 'function'))
		(reference as ScalarPropsReference)[scalarPropsProof] = reference.props;
}

/**
 * Consumes a proof before component execution can expose its inputs. Replacement, retries, or
 * reuse must take ordinary preparation after this single attempt, even when the attempt fails.
 */
export function consumeScalarPropsProof(
	reference: ServerComponentReference,
	props: Readonly<Record<string, unknown>>
): boolean {
	const prepared = reference as ScalarPropsReference;
	const proof = prepared[scalarPropsProof];
	if (proof === undefined) return false;
	prepared[scalarPropsProof] = undefined;
	return proof === props && reference.props === props;
}
