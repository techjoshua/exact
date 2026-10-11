/** Global property carrying compiler-derived context effects needed before enhancement activation. */
export const exactEnhancementContexts = Symbol.for('@exactjs/enhancement-contexts');
/** Minimal context effects used to order co-targeted ordinary components. */
export interface EnhancementContextContract {
	/** Compiler proof that preparation can share hosts without crossing structural output. */
	readonly transparentTarget?: boolean;
	readonly provides?: readonly symbol[];
	readonly requires?: readonly symbol[];
	readonly optionallyConsumes?: readonly symbol[];
}
