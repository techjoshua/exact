/** Realm-stable operation key carried only by an opaque foreign-ownership contribution handle. */
const exactCompatibilityContribution = Symbol.for('@exactjs/compatibility-contribution');
const exactCompatibilityContributionKey = Symbol.for('@exactjs/compatibility-contribution-key');

/** Target-owned focused placement surface called by one supplier-generated range operation. */
export type ExactCompatibilityContributionTarget = Readonly<{
	place(value: unknown): object;
}>;

/** Opaque handle retained, keyed, and cloned by a foreign owner without inspecting native shape. */
export type ExactCompatibilityContribution = Readonly<{
	[exactCompatibilityContribution](target: ExactCompatibilityContributionTarget): object;
	[exactCompatibilityContributionKey]?: string;
}>;

/** Supplier-generated operation that places its authored contribution through focused target work. */
export type ExactCompatibilityContributionOperation = (
	target: ExactCompatibilityContributionTarget
) => object;

/**
 * Creates one opaque crossing handle around a compiler-selected child-range operation.
 *
 * The operation, rather than the handle or foreign owner, retains native topology and lifecycle
 * knowledge. The handle exposes no value kind, topology, or materialization operation.
 */
export function createCompatibilityContribution(
	operation: ExactCompatibilityContributionOperation,
	key?: string
): ExactCompatibilityContribution {
	if (typeof operation !== 'function')
		throw new TypeError('A compatibility contribution requires a compiled placement operation');
	const contribution = Object.defineProperty({}, exactCompatibilityContribution, {
		value: operation,
		enumerable: false
	}) as ExactCompatibilityContribution;
	if (key !== undefined)
		Object.defineProperty(contribution, exactCompatibilityContributionKey, {
			value: key,
			enumerable: false
		});
	return Object.freeze(contribution);
}

/** Reads only the foreign-owner identity attached by the supplying compiled operation. */
export function compatibilityContributionKey(
	contribution: ExactCompatibilityContribution
): string | undefined {
	if (!isCompatibilityContribution(contribution))
		throw new TypeError('Invalid compatibility contribution handle');
	return contribution[exactCompatibilityContributionKey];
}

/** Reports only whether a value carries the opaque crossing protocol, never what it contributes. */
export function isCompatibilityContribution(
	value: unknown
): value is ExactCompatibilityContribution {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as Partial<ExactCompatibilityContribution>)[exactCompatibilityContribution] ===
			'function'
	);
}

/** Invokes a supplier-owned contribution without exposing its authored value to the foreign owner. */
export function placeCompatibilityContribution(
	contribution: ExactCompatibilityContribution,
	target: ExactCompatibilityContributionTarget
): object {
	if (!isCompatibilityContribution(contribution))
		throw new TypeError('Invalid compatibility contribution handle');
	return contribution[exactCompatibilityContribution](target);
}
