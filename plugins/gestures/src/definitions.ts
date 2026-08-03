import type {
	DragRecognizer,
	DragRecognizerInput,
	GestureDefinition,
	GestureDefinitionInput,
	HoverRecognizer,
	HoverRecognizerInput,
	PanRecognizer,
	PanRecognizerInput,
	PinchRecognizer,
	PinchRecognizerInput,
	PreparedRecognizer,
	PressRecognizer,
	PressRecognizerInput
} from './contracts.js';

const definitionBrand = Symbol('exact.gesture-definition');
const recognizerBrand = Symbol('exact.gesture-recognizer');

/** Prepares one immutable reusable gesture definition. */
export function defineGesture(input: GestureDefinitionInput): GestureDefinition {
	if (!input || typeof input !== 'object')
		throw new TypeError('defineGesture() requires an object');
	if (input.semantics !== 'decorative' && input.semantics !== 'control')
		throw new TypeError('defineGesture() requires decorative or control semantics');
	if (input.semantics === 'control' && !input.keyboard)
		throw new TypeError('control-like gestures require a keyboard policy');
	const prepared = {
		...input,
		press: input.press && prepareRecognizer(input.press, 'press'),
		hover: input.hover && prepareRecognizer(input.hover, 'hover'),
		drag: input.drag && prepareRecognizer(input.drag, 'drag'),
		pan: input.pan && prepareRecognizer(input.pan, 'pan'),
		pinch: input.pinch && prepareRecognizer(input.pinch, 'pinch')
	};
	return Object.freeze(
		Object.defineProperty(prepared, definitionBrand, { value: true })
	) as GestureDefinition;
}

/** Prepares one immutable press recognizer for a canonical override. */
export function definePress(input: PressRecognizerInput): PressRecognizer {
	return prepareRecognizer(input, 'press');
}
/** Prepares one immutable hover recognizer for a canonical override. */
export function defineHover(input: HoverRecognizerInput): HoverRecognizer {
	return prepareRecognizer(input, 'hover');
}
/** Prepares one immutable drag recognizer for a canonical override. */
export function defineDrag(input: DragRecognizerInput): DragRecognizer {
	return prepareRecognizer(input, 'drag');
}
/** Prepares one immutable pan recognizer for a canonical override. */
export function definePan(input: PanRecognizerInput): PanRecognizer {
	return prepareRecognizer(input, 'pan');
}
/** Prepares one immutable pinch recognizer for a canonical override. */
export function definePinch(input: PinchRecognizerInput): PinchRecognizer {
	return prepareRecognizer(input, 'pinch');
}

/** Reports whether a value was prepared by this package. */
export function isGestureDefinition(value: unknown): value is GestureDefinition {
	return !!value && typeof value === 'object' && definitionBrand in value;
}

function prepareRecognizer<Input extends object>(
	input: Input,
	kind: string
): PreparedRecognizer<Input> {
	if (!input || typeof input !== 'object')
		throw new TypeError(`${kind} recognizer requires an object`);
	const threshold = 'threshold' in input ? input.threshold : undefined;
	if (threshold !== undefined && (!Number.isFinite(threshold) || (threshold as number) < 0)) {
		throw new RangeError(`${kind} threshold must be a non-negative finite number`);
	}
	const delay = 'delay' in input ? input.delay : undefined;
	if (delay !== undefined && (!Number.isFinite(delay) || (delay as number) < 0)) {
		throw new RangeError(`${kind} delay must be a non-negative finite number`);
	}
	const prepared = { ...input };
	return Object.freeze(
		Object.defineProperty(prepared, recognizerBrand, { value: true })
	) as PreparedRecognizer<Input>;
}
