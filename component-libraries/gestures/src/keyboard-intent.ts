import { unwrap } from '@exactjs/core';
import type { AnyGestureCallback, GestureSample } from './contracts.js';
import { resolveGestureRecognizers, type SessionConfiguration } from './session-policy.js';

/** Resolved semantic callback and sample for one supported keyboard gesture. */
export type KeyboardGestureIntent = Readonly<{
	kind: 'keyboard' | 'keyboard-press';
	callback: AnyGestureCallback;
	sample: GestureSample;
}>;

/** Converts an activation or arrow key into a semantic gesture callback and sample. */
export function resolveKeyboardGestureIntent(
	configuration: SessionConfiguration | undefined,
	event: KeyboardEvent
): KeyboardGestureIntent | undefined {
	const keyboard = unwrap(configuration?.definition)?.keyboard;
	if (!keyboard) return undefined;
	const recognizers = resolveGestureRecognizers(configuration);
	if (event.key === 'Enter' || event.key === ' ') {
		const callback = keyboard.onPress ?? recognizers.press?.onPress;
		return callback
			? { kind: 'keyboard-press', callback, sample: createKeyboardSample(event, { x: 0, y: 0 }) }
			: undefined;
	}
	const step = keyboard.step ?? 8;
	const delta =
		event.key === 'ArrowLeft'
			? { x: -step, y: 0 }
			: event.key === 'ArrowRight'
				? { x: step, y: 0 }
				: event.key === 'ArrowUp'
					? { x: 0, y: -step }
					: event.key === 'ArrowDown'
						? { x: 0, y: step }
						: undefined;
	const callback = keyboard.onMove ?? recognizers.drag?.onMove ?? recognizers.pan?.onMove;
	return delta && callback
		? { kind: 'keyboard', callback, sample: createKeyboardSample(event, delta) }
		: undefined;
}

function createKeyboardSample(event: KeyboardEvent, delta: { x: number; y: number }) {
	return {
		phase: delta.x || delta.y ? 'move' : 'end',
		pointerType: 'keyboard',
		point: { x: 0, y: 0 },
		localPoint: { x: 0, y: 0 },
		delta,
		velocity: { x: 0, y: 0 },
		elapsed: 0,
		signal: new AbortController().signal,
		originalEvent: event
	} satisfies GestureSample;
}
