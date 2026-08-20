import { type AnyComponentInstance, unwrap } from '@exactjs/core';
import type {
	AnyGestureCallback,
	GestureSample,
	PinchGestureSample,
	PinchRecognizer
} from './contracts.js';
import { GestureCallbackDelivery } from './callback-delivery.js';
import {
	createIdleGestureSample,
	createPointerGestureSample,
	pointerEventPoint,
	pointAngle,
	pointDistance,
	pointMidpoint,
	type Point,
	type PointerRecord
} from './gesture-samples.js';
import { resolveKeyboardGestureIntent } from './keyboard-intent.js';
import {
	gesturePolicyChanged,
	gestureRoutingPriority,
	resolveGestureRecognizers,
	selectSinglePointerRecognizers,
	type ActiveRecognizer,
	type SessionConfiguration
} from './session-policy.js';
import { GestureTargetBinding } from './target-binding.js';

/** Monotonic time source used by recognition and deterministic tests. */
export interface GestureClock {
	now(): number;
}

const browserClock: GestureClock = { now: () => performance.now() };
let activeClock = browserClock;
const sessionsByOwner = new WeakMap<AnyComponentInstance, GestureSession>();
const routedPointerDown = new WeakSet<Event>();

/** Installs a gesture clock and returns a restoration function. */
export function installGestureClock(clock: GestureClock): () => void {
	const previous = activeClock;
	activeClock = clock;
	return () => {
		if (activeClock === clock) activeClock = previous;
	};
}

/** Stable component-owned recognizer session with deterministic listener cleanup. */
export class GestureSession implements Disposable {
	#configuration?: SessionConfiguration;
	#element?: Element;
	#pointers = new Map<number, PointerRecord>();
	#active: ActiveRecognizer[] = [];
	#pinch?: {
		recognizer: PinchRecognizer;
		distance: number;
		angle: number;
		center: Point;
		started: boolean;
	};
	#pinchCompleted = false;
	#startedAt = 0;
	#delivery: GestureCallbackDelivery;
	#binding?: GestureTargetBinding;
	#owner?: AnyComponentInstance;

	constructor(report: (error: unknown) => void = () => undefined, owner?: AnyComponentInstance) {
		this.#delivery = new GestureCallbackDelivery(report);
		this.#owner = owner;
		if (owner) sessionsByOwner.set(owner, this);
	}

	/** Reconciles the stable session with its current target and prepared policy. */
	configure(configuration: SessionConfiguration): void {
		const previous = this.#configuration;
		const element =
			configuration.presented && !configuration.disabled && configuration.settings.enabled
				? configuration.element
				: undefined;
		if (previous && gesturePolicyChanged(previous, configuration))
			this.cancel('gesture-policy-changed');
		if (element !== this.#element) {
			this.cancel('target-reconfigured');
			this.#detach();
			this.#element = element;
			if (element) this.#attach(element);
		}
		this.#configuration = configuration;
		if (!element) this.cancel('gesture-disabled');
		this.#applyIdlePolicy();
	}

	/** Cancels active recognition and delivers semantic cancellation to winners. */
	cancel(reason: string): void {
		if (!this.#pointers.size && !this.#active.length && !this.#pinch) return;
		const event = new Event('gesturecancel');
		const pointer = this.#pointers.values().next().value as PointerRecord | undefined;
		this.#delivery.abort(reason);
		if (pointer) {
			for (const active of this.#active) {
				this.#invoke(
					active.kind,
					active.recognizer.onCancel,
					this.#sample('cancel', pointer.last, pointer, event, pointer, active.axis)
				);
			}
		}
		if (this.#pinch) {
			this.#invoke('pinch', this.#pinch.recognizer.onCancel, this.#pinchSample('cancel', event));
		}
		this.#finishSession(reason, true);
	}

	/** Cancels input and removes every listener and temporary browser policy. */
	[Symbol.dispose](): void {
		this.cancel('gesture-session-disposed');
		this.#detach();
		this.#element = undefined;
		if (this.#owner && sessionsByOwner.get(this.#owner) === this)
			sessionsByOwner.delete(this.#owner);
	}

	/** Installs idle target listeners and captures authored inline policy. */
	#attach(element: Element): void {
		this.#binding = new GestureTargetBinding(element, {
			pointerdown: this.#pointerDown,
			pointermove: this.#pointerMove,
			pointerup: this.#pointerUp,
			pointercancel: this.#pointerCancel,
			lostpointercapture: this.#lostCapture,
			pointerenter: this.#hoverStart,
			pointerleave: this.#hoverEnd,
			focusin: this.#hoverStart,
			focusout: this.#hoverEnd,
			keydown: this.#keyDown
		});
	}

	/** Removes target listeners and restores authored inline policy. */
	#detach(): void {
		this.#binding?.[Symbol.dispose]();
		this.#binding = undefined;
	}

	/** Applies the narrow touch-action policy selected by the current definition. */
	#applyIdlePolicy(): void {
		const definition = unwrap(this.#configuration?.definition);
		this.#binding?.applyTouchAction(definition?.touchAction);
	}

	#pointerDown = (raw: Event): void => {
		const event = raw as PointerEvent;
		if (routedPointerDown.has(event)) return;
		routedPointerDown.add(event);
		this.#nestedWinner().#acceptPointerDown(event);
	};

	/** Starts the session selected by logical target ancestry and recognizer priority. */
	#acceptPointerDown(event: PointerEvent): void {
		if (!this.#configuration || !this.#element) return;
		if (!this.#pointers.size) this.#beginSession();
		const point = pointerEventPoint(event);
		this.#pointers.set(event.pointerId, {
			origin: point,
			last: point,
			time: activeClock.now(),
			pointerType: event.pointerType || 'mouse'
		});
		try {
			(this.#element as Element & { setPointerCapture?(id: number): void }).setPointerCapture?.(
				event.pointerId
			);
		} catch {
			// Capture can fail when the target was detached during the initiating event.
		}
		if (this.#pointers.size === 2) this.#preparePinch();
		this.#binding?.suppressSelection();
		globalThis.addEventListener?.('blur', this.#windowBlur, { once: true });
	}

	/** Selects one deterministic winner across nested logical gesture components. */
	#nestedWinner(): GestureSession {
		let winner: GestureSession = this;
		let priority = gestureRoutingPriority(this.#configuration);
		let cursor = this.#owner?.parent;
		while (cursor) {
			const candidate = sessionsByOwner.get(cursor);
			if (candidate && candidate.#element) {
				const candidatePriority = gestureRoutingPriority(candidate.#configuration);
				if (candidatePriority > priority) {
					winner = candidate;
					priority = candidatePriority;
				}
			}
			cursor = cursor.parent;
		}
		return winner;
	}

	#pointerMove = (raw: Event): void => {
		const event = raw as PointerEvent;
		const pointer = this.#pointers.get(event.pointerId);
		if (!pointer) return;
		const point = pointerEventPoint(event);
		const previous = { ...pointer };
		pointer.last = point;
		pointer.time = activeClock.now();
		if (this.#pointers.size >= 2 && resolveGestureRecognizers(this.#configuration).pinch) {
			this.#movePinch(event);
			return;
		}
		if (!this.#active.length) this.#activateSinglePointer(point, pointer, event);
		for (const active of this.#active) {
			const sample = this.#sample('move', point, pointer, event, previous, active.axis);
			this.#invoke(active.kind, active.recognizer.onMove, sample, true);
		}
	};

	#pointerUp = (raw: Event): void => {
		const event = raw as PointerEvent;
		const pointer = this.#pointers.get(event.pointerId);
		if (!pointer) return;
		pointer.last = pointerEventPoint(event);
		if (this.#pinch) {
			this.#invoke('pinch', this.#pinch.recognizer.onEnd, this.#pinchSample('end', event));
			this.#pinch = undefined;
			this.#pinchCompleted = true;
		} else if (this.#active.length) {
			for (const active of this.#active) {
				this.#invoke(
					active.kind,
					active.recognizer.onEnd,
					this.#sample('end', pointer.last, pointer, event, pointer, active.axis)
				);
			}
		} else if (!this.#pinchCompleted) {
			const press = resolveGestureRecognizers(this.#configuration).press;
			const threshold = press?.threshold ?? this.#configuration?.settings.pressThreshold ?? 6;
			const delay = press?.delay ?? 0;
			if (
				press &&
				pointDistance(pointer.origin, pointer.last) <= threshold &&
				activeClock.now() - this.#startedAt >= delay
			) {
				this.#invoke('press', press.onPress, this.#sample('end', pointer.last, pointer, event));
			}
		}
		this.#pointers.delete(event.pointerId);
		if (!this.#pointers.size) this.#finishSession('gesture-ended', false);
	};

	#pointerCancel = (): void => this.cancel('pointer-cancelled');
	#lostCapture = (): void => this.cancel('pointer-capture-lost');
	#windowBlur = (): void => this.cancel('window-blurred');

	#hoverStart = (event: Event): void => {
		const hover = resolveGestureRecognizers(this.#configuration).hover;
		if (hover) this.#invoke('hover', hover.onStart, this.#idleSample('start', event));
	};
	#hoverEnd = (event: Event): void => {
		const hover = resolveGestureRecognizers(this.#configuration).hover;
		if (hover) this.#invoke('hover', hover.onEnd, this.#idleSample('end', event));
	};

	#keyDown = (event: Event): void => {
		const intent = resolveKeyboardGestureIntent(this.#configuration, event as KeyboardEvent);
		if (!intent) return;
		event.preventDefault();
		this.#invoke(intent.kind, intent.callback, intent.sample);
	};

	/** Opens one named nonblocking task frame for a multi-event input session. */
	#beginSession(): void {
		this.#startedAt = activeClock.now();
		this.#delivery.begin(unwrap(this.#configuration?.definition)?.name ?? 'gesture');
	}

	/** Settles or cancels the session and releases all temporary resources. */
	#finishSession(reason: string, cancelled: boolean): void {
		this.#delivery.finish(reason, cancelled);
		for (const pointerId of this.#pointers.keys()) {
			try {
				(
					this.#element as (Element & { releasePointerCapture?(id: number): void }) | undefined
				)?.releasePointerCapture?.(pointerId);
			} catch {
				// Capture may already have been released by the browser.
			}
		}
		this.#pointers.clear();
		this.#active = [];
		this.#pinch = undefined;
		this.#pinchCompleted = false;
		globalThis.removeEventListener?.('blur', this.#windowBlur);
		this.#binding?.restoreSelection();
	}

	/** Selects threshold-qualified single-pointer winners in deterministic priority order. */
	#activateSinglePointer(point: Point, pointer: PointerRecord, event: Event): void {
		const recognizers = resolveGestureRecognizers(this.#configuration);
		const selection = selectSinglePointerRecognizers(this.#configuration, pointer.origin, point);
		if (!selection.active.length) return;
		this.#active = selection.active;
		const cancellation = this.#sample('cancel', point, pointer, event, pointer);
		for (const candidate of selection.cancelled)
			this.#invoke(candidate.kind, candidate.recognizer.onCancel, cancellation);
		const press = recognizers.press;
		if (press) this.#invoke('press', press.onCancel, cancellation);
		for (const active of this.#active) {
			this.#invoke(
				active.kind,
				active.recognizer.onStart,
				this.#sample('start', point, pointer, event, pointer, active.axis)
			);
		}
	}

	/** Captures the initial geometry for a possible two-pointer pinch. */
	#preparePinch(): void {
		const recognizer = resolveGestureRecognizers(this.#configuration).pinch;
		if (!recognizer) return;
		const [first, second] = [...this.#pointers.values()];
		if (!first || !second) return;
		this.#pinch = {
			recognizer,
			distance: pointDistance(first.last, second.last),
			angle: pointAngle(first.last, second.last),
			center: pointMidpoint(first.last, second.last),
			started: false
		};
		if (this.#active.length) {
			const event = new Event('gesturecancel');
			for (const active of this.#active) {
				this.#invoke(
					active.kind,
					active.recognizer.onCancel,
					this.#sample('cancel', first.last, first, event, first, active.axis)
				);
			}
		}
		this.#active = [];
	}

	/** Activates and delivers bounded pinch movement after its threshold is met. */
	#movePinch(event: Event): void {
		if (!this.#pinch) this.#preparePinch();
		if (!this.#pinch) return;
		const sample = this.#pinchSample('move', event);
		const threshold = this.#pinch.recognizer.threshold ?? 0.02;
		if (Math.abs(sample.scale - 1) < threshold && sample.rotation === 0) return;
		if (!this.#pinch.started) {
			this.#pinch.started = true;
			this.#invoke('pinch', this.#pinch.recognizer.onStart, { ...sample, phase: 'start' });
		}
		this.#invoke('pinch', this.#pinch.recognizer.onMove, sample, true);
	}

	/** Creates one immutable scale-and-rotation sample from current pointer geometry. */
	#pinchSample(phase: GestureSample['phase'], event: Event): PinchGestureSample {
		const [first, second] = [...this.#pointers.values()];
		const pinch = this.#pinch!;
		const center = first && second ? pointMidpoint(first.last, second.last) : pinch.center;
		const currentDistance =
			first && second ? pointDistance(first.last, second.last) : pinch.distance;
		const currentAngle = first && second ? pointAngle(first.last, second.last) : pinch.angle;
		return Object.freeze({
			...this.#sample(
				phase,
				center,
				first ?? { origin: center, last: center, time: activeClock.now(), pointerType: 'touch' },
				event
			),
			scale: pinch.distance ? currentDistance / pinch.distance : 1,
			rotation: currentAngle - pinch.angle
		});
	}

	/** Normalizes one pointer event into viewport, local, delta, velocity, and timing data. */
	#sample(
		phase: GestureSample['phase'],
		point: Point,
		pointer: PointerRecord,
		event: Event,
		previous = pointer,
		axis: 'x' | 'y' | 'both' = 'both'
	): GestureSample {
		return createPointerGestureSample({
			phase,
			point,
			pointer,
			event,
			previous,
			axis,
			startedAt: this.#startedAt,
			now: () => activeClock.now(),
			element: this.#element,
			signal: this.#delivery.signal
		});
	}

	/** Creates a zero-coordinate semantic sample for hover and focus intent. */
	#idleSample(phase: 'start' | 'end', event: Event): GestureSample {
		return createIdleGestureSample(phase, event);
	}

	/** Delivers a callback immediately or through the latest-only move queue. */
	#invoke(
		kind: string,
		callback: AnyGestureCallback | undefined,
		sample: GestureSample,
		coalesce = false
	): void {
		this.#delivery.invoke(kind, callback, sample, coalesce);
	}
}
