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

/** Prepares one reusable gesture definition. */
export function defineGesture(input: GestureDefinitionInput): GestureDefinition {
	if (!input || typeof input !== 'object')
		throw new TypeError('defineGesture() requires an object');
	const prepared = captureGestureInput(input, [
		'semantics',
		'keyboard',
		'press',
		'hover',
		'drag',
		'pan',
		'pinch',
		'name',
		'touchAction'
	]);
	if (prepared.semantics !== 'decorative' && prepared.semantics !== 'control')
		throw new TypeError('defineGesture() requires decorative or control semantics');
	if (prepared.semantics === 'control' && !prepared.keyboard)
		throw new TypeError('control-like gestures require a keyboard policy');
	prepared.press = prepared.press && prepareRecognizer(prepared.press, 'press');
	prepared.hover = prepared.hover && prepareRecognizer(prepared.hover, 'hover');
	prepared.drag = prepared.drag && prepareRecognizer(prepared.drag, 'drag');
	prepared.pan = prepared.pan && prepareRecognizer(prepared.pan, 'pan');
	prepared.pinch = prepared.pinch && prepareRecognizer(prepared.pinch, 'pinch');
	return Object.defineProperty(prepared, definitionBrand, { value: true }) as GestureDefinition;
}

/** Prepares one press recognizer for a canonical override. */
export function definePress(input: PressRecognizerInput): PressRecognizer {
	return prepareRecognizer(input, 'press');
}
/** Prepares one hover recognizer for a canonical override. */
export function defineHover(input: HoverRecognizerInput): HoverRecognizer {
	return prepareRecognizer(input, 'hover');
}
/** Prepares one drag recognizer for a canonical override. */
export function defineDrag(input: DragRecognizerInput): DragRecognizer {
	return prepareRecognizer(input, 'drag');
}
/** Prepares one pan recognizer for a canonical override. */
export function definePan(input: PanRecognizerInput): PanRecognizer {
	return prepareRecognizer(input, 'pan');
}
/** Prepares one pinch recognizer for a canonical override. */
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
	const prepared = captureGestureInput(input, [
		'threshold',
		'delay',
		'priority',
		'exclusiveGroup',
		'simultaneous',
		'name',
		'axis',
		'lockDirection',
		'onPress',
		'onCancel',
		'onStart',
		'onMove',
		'onEnd'
	]);
	const threshold = 'threshold' in prepared ? prepared.threshold : undefined;
	if (threshold !== undefined && (!Number.isFinite(threshold) || (threshold as number) < 0)) {
		throw new RangeError(`${kind} threshold must be a non-negative finite number`);
	}
	const delay = 'delay' in prepared ? prepared.delay : undefined;
	if (delay !== undefined && (!Number.isFinite(delay) || (delay as number) < 0)) {
		throw new RangeError(`${kind} delay must be a non-negative finite number`);
	}
	return Object.defineProperty(prepared, recognizerBrand, {
		value: true
	}) as PreparedRecognizer<Input>;
}

/** Copies own metadata once and captures declared fields inherited from authored objects. */
function captureGestureInput<Input extends object>(
	input: Input,
	fields: readonly string[]
): { -readonly [Key in keyof Input]: Input[Key] } {
	const prepared = { ...input };
	for (const field of fields) {
		if (!Object.hasOwn(prepared, field) && field in input)
			Reflect.set(prepared, field, Reflect.get(input, field));
	}
	return prepared;
}
