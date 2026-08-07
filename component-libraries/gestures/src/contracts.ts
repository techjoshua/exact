import type { Child } from '@exactjs/core';

declare const gestureDefinitionBrand: unique symbol;
declare const gestureRecognizerBrand: unique symbol;

/** Immutable normalized semantic input delivered by gesture recognizers. */
export interface GestureSample {
	readonly phase: 'start' | 'move' | 'end' | 'cancel';
	readonly pointerType: 'mouse' | 'pen' | 'touch' | 'keyboard';
	readonly point: Readonly<{ x: number; y: number }>;
	readonly localPoint: Readonly<{ x: number; y: number }>;
	readonly delta: Readonly<{ x: number; y: number }>;
	readonly velocity: Readonly<{ x: number; y: number }>;
	readonly elapsed: number;
	readonly signal: AbortSignal;
	readonly originalEvent: Event;
}

/** Pinch sample extending the shared semantic input contract. */
export interface PinchGestureSample extends GestureSample {
	readonly scale: number;
	readonly rotation: number;
}

/** Callback invoked for one immutable sample; synchronous results are ignored and thenables awaited. */
export type GestureCallback<Sample extends GestureSample = GestureSample> = (
	sample: Sample
) => unknown | PromiseLike<unknown>;

/** Priority and competition policy shared by prepared recognizers. */
export type GestureRecognizerBase = Readonly<{
	priority?: number;
	exclusiveGroup?: string;
	simultaneous?: boolean;
	name?: string;
}>;

/** Preparation input for click-like press intent. */
export type PressRecognizerInput = GestureRecognizerBase &
	Readonly<{
		threshold?: number;
		delay?: number;
		onPress?: GestureCallback;
		onCancel?: GestureCallback;
	}>;

/** Preparation input for pointer-hover and focus-visible equivalence. */
export type HoverRecognizerInput = GestureRecognizerBase &
	Readonly<{
		onStart?: GestureCallback;
		onEnd?: GestureCallback;
	}>;

/** Preparation input for thresholded direct manipulation. */
export type DragRecognizerInput = GestureRecognizerBase &
	Readonly<{
		axis?: 'x' | 'y' | 'both';
		threshold?: number;
		lockDirection?: boolean;
		onStart?: GestureCallback;
		onMove?: GestureCallback;
		onEnd?: GestureCallback;
		onCancel?: GestureCallback;
	}>;

/** Preparation input for free panning behavior. */
export type PanRecognizerInput = DragRecognizerInput;

/** Preparation input for two-pointer scale and rotation behavior. */
export type PinchRecognizerInput = GestureRecognizerBase &
	Readonly<{
		threshold?: number;
		onStart?: GestureCallback<PinchGestureSample>;
		onMove?: GestureCallback<PinchGestureSample>;
		onEnd?: GestureCallback<PinchGestureSample>;
		onCancel?: GestureCallback<PinchGestureSample>;
	}>;

/** Arrow-key movement policy for control-like gestures. */
export type KeyboardRecognizerInput = Readonly<{
	step?: number;
	onMove?: GestureCallback;
	onPress?: GestureCallback;
}>;

/** Immutable branded recognizer accepted by site-specific overrides. */
export type PreparedRecognizer<Input extends object> = Readonly<Input> &
	Readonly<{ [gestureRecognizerBrand]: true }>;
/** Prepared press recognizer. */
export type PressRecognizer = PreparedRecognizer<PressRecognizerInput>;
/** Prepared hover recognizer. */
export type HoverRecognizer = PreparedRecognizer<HoverRecognizerInput>;
/** Prepared drag recognizer. */
export type DragRecognizer = PreparedRecognizer<DragRecognizerInput>;
/** Prepared pan recognizer. */
export type PanRecognizer = PreparedRecognizer<PanRecognizerInput>;
/** Prepared pinch recognizer. */
export type PinchRecognizer = PreparedRecognizer<PinchRecognizerInput>;

/** Shared author input for one stable collection of competing recognizers. */
type GestureDefinitionBase = Readonly<{
	name?: string;
	press?: PressRecognizerInput | PressRecognizer;
	hover?: HoverRecognizerInput | HoverRecognizer;
	drag?: DragRecognizerInput | DragRecognizer;
	pan?: PanRecognizerInput | PanRecognizer;
	pinch?: PinchRecognizerInput | PinchRecognizer;
	touchAction?: 'auto' | 'none' | 'pan-x' | 'pan-y' | 'manipulation';
}>;

/** Author input that classifies decorative or control-like recognition policy. */
export type GestureDefinitionInput = GestureDefinitionBase &
	(
		| Readonly<{ semantics: 'decorative'; keyboard?: KeyboardRecognizerInput }>
		| Readonly<{ semantics: 'control'; keyboard: KeyboardRecognizerInput }>
	);

/** Validated immutable reusable gesture policy. */
export type GestureDefinition = Readonly<
	Omit<GestureDefinitionBase, 'press' | 'hover' | 'drag' | 'pan' | 'pinch'> & {
		press?: PressRecognizer;
		hover?: HoverRecognizer;
		drag?: DragRecognizer;
		pan?: PanRecognizer;
		pinch?: PinchRecognizer;
	} & (
			| Readonly<{ semantics: 'decorative'; keyboard?: KeyboardRecognizerInput }>
			| Readonly<{ semantics: 'control'; keyboard: KeyboardRecognizerInput }>
		)
> &
	Readonly<{ [gestureDefinitionBrand]: true }>;

/** Canonical props accepted by the enhancement JSX namespace. */
export interface GestureElementProps {
	apply?: GestureDefinition;
	press?: PressRecognizer;
	hover?: HoverRecognizer;
	drag?: DragRecognizer;
	pan?: PanRecognizer;
	pinch?: PinchRecognizer;
	disabled?: boolean;
	children?: Child;
}

/** Inherited recognition defaults for one logical subtree. */
export interface GestureSettings {
	readonly enabled: boolean;
	readonly dragThreshold: number;
	readonly pressThreshold: number;
}

/** Props for one inherited gesture-policy boundary. */
export type GestureConfigProps = Readonly<{
	enabled?: boolean;
	dragThreshold?: number;
	pressThreshold?: number;
	children?: Child;
}>;
