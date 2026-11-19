import { createCompiledComponentInputReceipt } from '@exactjs/core/runtime/component-operations';
import { isExactComponent } from '@exactjs/core/framework/component-contracts';
import { Fragment } from '@exactjs/core';
import type {
	AnyAuthoredComponentFunction,
	AnyStateAuthoredComponentFunction,
	AnyStateComponentFunction,
	Activity,
	Child,
	InteractionHandler,
	RefBinding,
	Suspense
} from '@exactjs/core';

export { Fragment };

/** Provides the canonical  value. */
export const _ = Fragment as unknown as AnyStateComponentFunction<{
	children?: Child | Child[];
}>;

type Props = Record<string, unknown> & {
	children?: Child | Child[];
	key?: string | number;
};

type JsxType =
	| string
	| AnyAuthoredComponentFunction
	| typeof Activity
	| typeof Fragment
	| typeof Suspense;

/**
 * Extension point for compiler-supported foreign JSX component types.
 *
 * Runtime packages augment this registry only when their explicit type facade
 * is referenced by an application.
 */
declare global {
	/** Component types enabled by an explicitly referenced JSX interop facade. */
	interface ExactJsxInteropElementTypeRegistry {}
}

type InteropElementType =
	ExactJsxInteropElementTypeRegistry[keyof ExactJsxInteropElementTypeRegistry];

/** JSX result lowered by the compiler or issued for an already-compiled component by the host. */
export type CompiledJsxOperation = Readonly<{ __exactCompiledJsxOperation: never }>;

/** Issues host JSX for an already-compiled component; intrinsic JSX still requires native lowering. */
export function jsx<P extends Props>(
	type: AnyStateAuthoredComponentFunction<P>,
	props: P | null,
	key?: string | number
): CompiledJsxOperation;
export function jsx(
	type: string | typeof Activity | typeof Fragment | typeof Suspense,
	props: Props | null,
	key?: string | number
): CompiledJsxOperation;
export function jsx(
	_type: JsxType,
	_props: Props | null,
	_key?: string | number
): CompiledJsxOperation {
	return compiledComponentJsx(_type, _props, _key);
}

/** Issues host JSX with eager children already present in the props bag. */
export function jsxs<P extends Props>(
	type: AnyStateAuthoredComponentFunction<P>,
	props: P | null,
	key?: string | number
): CompiledJsxOperation;
export function jsxs(
	type: string | typeof Activity | typeof Fragment | typeof Suspense,
	props: Props | null,
	key?: string | number
): CompiledJsxOperation;
export function jsxs(
	_type: JsxType,
	_props: Props | null,
	_key?: string | number
): CompiledJsxOperation {
	return compiledComponentJsx(_type, _props, _key);
}

/** Uses the same compiled-component admission for development host JSX. */
export function jsxDEV(
	_type: JsxType,
	_props: Props | null,
	_key?: string | number,
	_isStaticChildren?: boolean,
	_source?: { fileName?: string; lineNumber?: number; columnNumber?: number },
	_self?: unknown
): CompiledJsxOperation {
	return compiledComponentJsx(_type, _props, _key);
}

/** Implements host key-after-spread JSX for compiled components, not general element creation. */
export function createElement<P extends Props>(
	type: AnyStateAuthoredComponentFunction<P>,
	props: P | null,
	...children: Child[]
): CompiledJsxOperation {
	return compiledComponentJsx(type, props, undefined, children.length ? children : undefined);
}

/** Admits only a current compiled eXact component and preserves eager host prop acquisition. */
function compiledComponentJsx(
	type: JsxType,
	props: Props | null,
	key?: string | number,
	children?: Child[]
): CompiledJsxOperation {
	if (!isExactComponent(type)) return rejectUncompiledJsx();
	return createCompiledComponentInputReceipt(
		type,
		key === undefined ? props : { key, ...props },
		children === undefined ? undefined : { kind: 'eager', values: children }
	) as unknown as CompiledJsxOperation;
}

function rejectUncompiledJsx(): never {
	throw new Error(
		'Uncompiled or intrinsic eXact JSX must be lowered by the eXact compiler; host JSX requires a compiled component'
	);
}

export namespace JSX {
	export type Element = CompiledJsxOperation;
	export type ElementType =
		| string
		| typeof Activity
		| typeof Fragment
		| typeof Suspense
		| AnyAuthoredComponentFunction
		| InteropElementType;
	export type TargetedEvent<
		TCurrentTarget extends EventTarget,
		TEvent extends Event = Event
	> = TEvent & {
		readonly currentTarget: TCurrentTarget;
	};
	export type EventHandler<
		TEvent extends Event = Event,
		TCurrentTarget extends EventTarget = EventTarget
	> = InteractionHandler<[event: TargetedEvent<TCurrentTarget, TEvent>]>;
	export type StyleValue = unknown;
	export type StyleObject = Record<string, StyleValue>;
	export interface IntrinsicAttributes {
		key?: string | number;
		[binding: `${string}:${string}`]: unknown;
	}
	export interface ElementChildrenAttribute {
		children: {};
	}
	export interface IntrinsicElementBaseProps<TElement extends EventTarget = EventTarget> {
		children?: Child | Child[];
		key?: string | number;
		ref?: RefBinding<TElement>;
		class?: unknown;
		className?: unknown;
		style?: string | StyleObject;
		disabled?: unknown;
		checked?: unknown;
		value?: unknown;
		'value:onInput'?: unknown;
		'value:onChange'?: unknown;
		'checked:onChange'?: unknown;
		'open:onToggle'?: unknown;
		'modal:isOpen'?: unknown;
		command?:
			| 'show-modal'
			| 'close'
			| 'request-close'
			| 'show-popover'
			| 'hide-popover'
			| 'toggle-popover';
		commandFor?: string;
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
		_target: IntrinsicElementProps<EventTarget> & { children?: Child | Child[] };
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- The custom-element fallback must be a bivariant supertype of every specifically typed HTML intrinsic entry.
		[elementName: string]: IntrinsicElementProps<any>;
	}
}
