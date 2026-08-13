import type { Child, RefBinding } from '@exactjs/core';

/** One ref-addressed ARIA relationship target. */
export type AriaRef = RefBinding<Element>;
/** Optional single-target relationship value. */
export type OptionalAriaRef = AriaRef | false | null | undefined;
/** Optional ordered relationship target list. */
export type AriaRefList = AriaRef | readonly AriaRef[] | false | null | undefined;

/** Axis policy for a supported composite navigation pattern. */
export type NavigateOrientation = 'horizontal' | 'vertical' | 'both';

/** Options accepted by the composite navigation enhancement. */
export interface NavigateOptions {
	mode?: 'roving' | 'activeDescendant';
	orientation?: NavigateOrientation;
	wrap?: boolean;
	homeEnd?: boolean;
	pageSize?: number;
}

/** Complete public prop surface grouped into one canonical enhancement component. */
export interface AccessibilityProps {
	focusScope?: true;
	initialFocus?: RefBinding<HTMLElement>;
	returnFocus?: RefBinding<HTMLElement> | false;
	activeDescendant?: OptionalAriaRef;
	controls?: AriaRefList;
	describedBy?: AriaRefList;
	details?: OptionalAriaRef;
	errorMessage?: OptionalAriaRef;
	flowTo?: AriaRefList;
	labelledBy?: AriaRefList;
	owns?: AriaRefList;
	navigate?: true | NavigateOptions;
	children?: Child | Child[];
}
