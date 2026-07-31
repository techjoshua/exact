/** Compiler-recognized brand for callbacks that begin framework interaction scopes. */
export const interactionHandler: unique symbol = Symbol('exact.interaction-handler');

/** Marks a callback position as an interaction source without changing ordinary call semantics. */
export type InteractionHandler<Args extends readonly unknown[]> = InteractionCallable<Args> & {
	readonly [interactionHandler]?: true;
};

/**
 * Expands common callback arities explicitly because the native checker contextualizes a generic
 * rest tuple as one tuple parameter.
 */
type InteractionCallable<Args extends readonly unknown[]> = Args extends readonly []
	? () => unknown
	: Args extends readonly [infer First]
		? (first: First) => unknown
		: Args extends readonly [infer First, infer Second]
			? (first: First, second: Second) => unknown
			: Args extends readonly [infer First, infer Second, infer Third]
				? (first: First, second: Second, third: Third) => unknown
				: Args extends readonly [infer First, infer Second, infer Third, infer Fourth]
					? (first: First, second: Second, third: Third, fourth: Fourth) => unknown
					: (...args: Args) => unknown;
