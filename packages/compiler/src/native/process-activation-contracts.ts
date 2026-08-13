/** Native explanation for one client range's activation mode. */
export type ExactActivationDecision = Readonly<{
	mode: 'server-only' | 'eager' | 'interaction' | 'inert';
	reasons: readonly ExactActivationReason[];
	targets: readonly ExactActivationTarget[];
}>;

/** One stable conservative fallback reason and its source range. */
export type ExactActivationReason = Readonly<{
	code:
		| 'initial-client-work'
		| 'ref'
		| 'owned-resource'
		| 'eager-task'
		| 'required-context'
		| 'unsafe-capture'
		| 'opaque-spread'
		| 'unsupported-event'
		| 'unsupported-event-data'
		| 'unsplittable-owner'
		| 'enhancement-setup'
		| 'enhancement-target'
		| 'unresolved-effect';
	start: number;
	length: number;
	detail?: string;
}>;

/** One adopted DOM identity and the events authorized to activate it. */
export type ExactActivationTarget = Readonly<{
	id: string;
	events: readonly ExactLazyEventPolicy[];
}>;

/** One bounded event replay operation authorized by native analysis. */
export type ExactLazyEventPolicy = Readonly<{
	type: 'click' | 'submit' | 'input' | 'change' | 'focus' | 'blur' | 'focusin' | 'focusout';
	replay: 'native-click' | 'request-submit' | 'latest-value' | 'notification';
}>;
