import { createCellVNode, createVNode, Fragment } from '@exactjs/core';
import type {
	Activity,
	Child,
	ComponentFunction,
	RefBinding,
	Suspense,
	VNode
} from '@exactjs/core';

export { Fragment };

/** Provides the canonical  value. */
export const _ = Fragment as unknown as ComponentFunction<any, { children?: Child | Child[] }>;

type Props = Record<string, unknown> & {
	children?: Child | Child[];
	key?: string;
};

type JsxType =
	| string
	| ComponentFunction<any, any>
	| typeof Activity
	| typeof Fragment
	| typeof Suspense;

/** Creates a vnode for the automatic JSX runtime's single-child entrypoint. */
export function jsx<P extends Props>(
	type: ComponentFunction<any, P>,
	props: P | null,
	key?: string
): VNode<P>;
export function jsx(
	type: string | typeof Activity | typeof Fragment | typeof Suspense,
	props: Props | null,
	key?: string
): VNode;
export function jsx(type: JsxType, props: Props | null, key?: string): VNode {
	return createJsxVNode(type, props, key);
}

/** Creates a vnode for the automatic JSX runtime's multi-child entrypoint. */
export function jsxs<P extends Props>(
	type: ComponentFunction<any, P>,
	props: P | null,
	key?: string
): VNode<P>;
export function jsxs(
	type: string | typeof Activity | typeof Fragment | typeof Suspense,
	props: Props | null,
	key?: string
): VNode;
export function jsxs(type: JsxType, props: Props | null, key?: string): VNode {
	return createJsxVNode(type, props, key);
}

/** Creates a vnode for development JSX transforms. */
export function jsxDEV(type: JsxType, props: Props | null, key?: string): VNode {
	return createJsxVNode(type, props, key);
}

function createJsxVNode(type: JsxType, props: Props | null, key?: string): VNode {
	const { children, ...rest } = props ?? {};
	const normalizedKey = key ?? (typeof rest.key === 'string' ? rest.key : undefined);
	if ('key' in rest) delete rest.key;
	const childList = Array.isArray(children) ? children : children === undefined ? [] : [children];
	return createCellVNode(
		createVNode(type, normalizedKey ? { ...rest, key: normalizedKey } : rest, ...childList)
	);
}

export namespace JSX {
	export type Element = VNode;
	export type ElementType =
		| string
		| typeof Activity
		| typeof Fragment
		| typeof Suspense
		| ComponentFunction<any, any>;
	export type TargetedEvent<
		TCurrentTarget extends EventTarget,
		TEvent extends Event = Event
	> = TEvent & {
		readonly currentTarget: TCurrentTarget;
	};
	export type EventHandler<
		TEvent extends Event = Event,
		TCurrentTarget extends EventTarget = EventTarget
	> = (event: TargetedEvent<TCurrentTarget, TEvent>) => void;
	export type StyleValue = unknown;
	export type StyleObject = Record<string, StyleValue>;
	export interface IntrinsicAttributes {
		key?: string;
	}
	export interface ElementChildrenAttribute {
		children: {};
	}
	export interface IntrinsicElementBaseProps<TElement extends EventTarget = EventTarget> {
		children?: Child | Child[];
		key?: string;
		ref?: RefBinding<TElement>;
		class?: unknown;
		className?: unknown;
		style?: string | StyleObject;
		disabled?: unknown;
		checked?: unknown;
		value?: unknown;
		'value:input'?: unknown;
		'value:change'?: unknown;
		'checked:change'?: unknown;
		[attributeName: string]: unknown;
	}

	type DOMEventName =
		| 'Abort'
		| 'AnimationCancel'
		| 'AnimationEnd'
		| 'AnimationIteration'
		| 'AnimationStart'
		| 'AuxClick'
		| 'BeforeInput'
		| 'BeforeMatch'
		| 'BeforeToggle'
		| 'Blur'
		| 'Cancel'
		| 'CanPlay'
		| 'CanPlayThrough'
		| 'Change'
		| 'Click'
		| 'Close'
		| 'CompositionEnd'
		| 'CompositionStart'
		| 'CompositionUpdate'
		| 'ContextLost'
		| 'ContextMenu'
		| 'ContextRestored'
		| 'Copy'
		| 'CueChange'
		| 'Cut'
		| 'DoubleClick'
		| 'Drag'
		| 'DragEnd'
		| 'DragEnter'
		| 'DragLeave'
		| 'DragOver'
		| 'DragStart'
		| 'Drop'
		| 'DurationChange'
		| 'Emptied'
		| 'Ended'
		| 'Error'
		| 'Focus'
		| 'FocusIn'
		| 'FocusOut'
		| 'FormData'
		| 'GotPointerCapture'
		| 'Input'
		| 'Invalid'
		| 'KeyDown'
		| 'KeyPress'
		| 'KeyUp'
		| 'Load'
		| 'LoadedData'
		| 'LoadedMetadata'
		| 'LoadStart'
		| 'LostPointerCapture'
		| 'MouseDown'
		| 'MouseEnter'
		| 'MouseLeave'
		| 'MouseMove'
		| 'MouseOut'
		| 'MouseOver'
		| 'MouseUp'
		| 'Paste'
		| 'Pause'
		| 'Play'
		| 'Playing'
		| 'PointerCancel'
		| 'PointerDown'
		| 'PointerEnter'
		| 'PointerLeave'
		| 'PointerMove'
		| 'PointerOut'
		| 'PointerOver'
		| 'PointerRawUpdate'
		| 'PointerUp'
		| 'Progress'
		| 'RateChange'
		| 'Reset'
		| 'Resize'
		| 'Scroll'
		| 'ScrollEnd'
		| 'SecurityPolicyViolation'
		| 'Seeked'
		| 'Seeking'
		| 'Select'
		| 'SelectionChange'
		| 'SelectStart'
		| 'SlotChange'
		| 'Stalled'
		| 'Submit'
		| 'Suspend'
		| 'TimeUpdate'
		| 'Toggle'
		| 'TouchCancel'
		| 'TouchEnd'
		| 'TouchMove'
		| 'TouchStart'
		| 'TransitionCancel'
		| 'TransitionEnd'
		| 'TransitionRun'
		| 'TransitionStart'
		| 'VolumeChange'
		| 'Waiting'
		| 'WebkitAnimationEnd'
		| 'WebkitAnimationIteration'
		| 'WebkitAnimationStart'
		| 'WebkitTransitionEnd'
		| 'Wheel';

	type NativeEventName<TName extends DOMEventName> = TName extends 'DoubleClick'
		? 'dblclick'
		: Lowercase<TName>;

	type NativeEvent<TName extends DOMEventName> =
		NativeEventName<TName> extends keyof GlobalEventHandlersEventMap
			? GlobalEventHandlersEventMap[NativeEventName<TName>]
			: Event;

	type DOMEventAttributes<TElement extends EventTarget> = {
		[TName in DOMEventName as `on${TName}`]?: EventHandler<NativeEvent<TName>, TElement>;
	} & {
		[TName in DOMEventName as `on${TName}Capture`]?: EventHandler<NativeEvent<TName>, TElement>;
	};

	export type IntrinsicElementProps<TElement extends EventTarget = EventTarget> =
		IntrinsicElementBaseProps<TElement> & DOMEventAttributes<TElement>;

	type HTMLIntrinsicElements = {
		[TTag in keyof HTMLElementTagNameMap]: IntrinsicElementProps<HTMLElementTagNameMap[TTag]>;
	};

	export interface IntrinsicElements extends HTMLIntrinsicElements {
		[elementName: string]: IntrinsicElementProps<any>;
	}
}
