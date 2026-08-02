import { unwrap } from '@exactjs/core';
import {
	captureTaskFrame,
	runTaskFrame,
	type TaskFrameExecution,
	type TaskFrameToken
} from '@exactjs/core/framework/task-frames';
import type {
	DragRecognizer,
	GestureCallback,
	GestureDefinition,
	GestureElementProps,
	GestureSample,
	GestureSettings,
	PinchGestureSample,
	PinchRecognizer
} from './contracts.js';

type Point = Readonly<{ x: number; y: number }>;
type PointerRecord = { origin: Point; last: Point; time: number; pointerType: string };
type ActiveRecognizer = {
	kind: 'drag' | 'pan';
	recognizer: DragRecognizer;
	axis: 'x' | 'y' | 'both';
};
type SessionConfiguration = Readonly<{
	element?: Element;
	presented: boolean;
	definition?: GestureDefinition;
	disabled: boolean;
	settings: GestureSettings;
	overrides?: Pick<GestureElementProps, 'press' | 'hover' | 'drag' | 'pan' | 'pinch'>;
}>;

/** Monotonic time source used by recognition and deterministic tests. */
export interface GestureClock {
	now(): number;
}

const browserClock: GestureClock = { now: () => performance.now() };
let activeClock = browserClock;

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
	#abort = new AbortController();
	#sessionExecution?: TaskFrameExecution<void>;
	#sessionFrame?: TaskFrameToken;
	#settleSession?: () => void;
	#pendingMoves = new Map<string, { running: boolean; latest?: GestureSample }>();
	#generation = 0;
	#touchAction = '';
	#userSelect = '';
	#stylesCaptured = false;
	#report: (error: unknown) => void;

	constructor(report: (error: unknown) => void = () => undefined) {
		this.#report = report;
	}

	/** Reconciles the stable session with its current target and prepared policy. */
	configure(configuration: SessionConfiguration): void {
		const previous = this.#configuration;
		const element =
			configuration.presented && !configuration.disabled && configuration.settings.enabled
				? configuration.element
				: undefined;
		if (previous && policyChanged(previous, configuration)) this.cancel('gesture-policy-changed');
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
		this.#abort.abort(reason);
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
	}

	/** Installs idle target listeners and captures authored inline policy. */
	#attach(element: Element): void {
		if (element instanceof HTMLElement) {
			this.#touchAction = element.style.touchAction;
			this.#userSelect = element.style.userSelect;
			this.#stylesCaptured = true;
		}
		element.addEventListener('pointerdown', this.#pointerDown);
		element.addEventListener('pointermove', this.#pointerMove);
		element.addEventListener('pointerup', this.#pointerUp);
		element.addEventListener('pointercancel', this.#pointerCancel);
		element.addEventListener('lostpointercapture', this.#lostCapture);
		element.addEventListener('pointerenter', this.#hoverStart);
		element.addEventListener('pointerleave', this.#hoverEnd);
		element.addEventListener('focusin', this.#hoverStart);
		element.addEventListener('focusout', this.#hoverEnd);
		element.addEventListener('keydown', this.#keyDown);
	}

	/** Removes target listeners and restores authored inline policy. */
	#detach(): void {
		const element = this.#element;
		if (!element) return;
		element.removeEventListener('pointerdown', this.#pointerDown);
		element.removeEventListener('pointermove', this.#pointerMove);
		element.removeEventListener('pointerup', this.#pointerUp);
		element.removeEventListener('pointercancel', this.#pointerCancel);
		element.removeEventListener('lostpointercapture', this.#lostCapture);
		element.removeEventListener('pointerenter', this.#hoverStart);
		element.removeEventListener('pointerleave', this.#hoverEnd);
		element.removeEventListener('focusin', this.#hoverStart);
		element.removeEventListener('focusout', this.#hoverEnd);
		element.removeEventListener('keydown', this.#keyDown);
		if (element instanceof HTMLElement) {
			element.style.touchAction = this.#touchAction;
			element.style.userSelect = this.#userSelect;
		}
		this.#stylesCaptured = false;
	}

	/** Applies the narrow touch-action policy selected by the current definition. */
	#applyIdlePolicy(): void {
		if (!(this.#element instanceof HTMLElement)) return;
		const definition = unwrap(this.#configuration?.definition);
		if (!this.#stylesCaptured) return;
		this.#element.style.touchAction = definition?.touchAction ?? this.#touchAction;
	}

	#pointerDown = (raw: Event): void => {
		const event = raw as PointerEvent;
		if (!this.#configuration || !this.#element) return;
		if (!this.#pointers.size) this.#beginSession();
		const point = this.#point(event);
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
		if (this.#element instanceof HTMLElement) this.#element.style.userSelect = 'none';
		globalThis.addEventListener?.('blur', this.#windowBlur, { once: true });
	};

	#pointerMove = (raw: Event): void => {
		const event = raw as PointerEvent;
		const pointer = this.#pointers.get(event.pointerId);
		if (!pointer) return;
		const point = this.#point(event);
		const previous = { ...pointer };
		pointer.last = point;
		pointer.time = activeClock.now();
		if (this.#pointers.size >= 2 && this.#recognizers().pinch) {
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
		pointer.last = this.#point(event);
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
			const press = this.#recognizers().press;
			const threshold = press?.threshold ?? this.#configuration?.settings.pressThreshold ?? 6;
			const delay = press?.delay ?? 0;
			if (
				press &&
				distance(pointer.origin, pointer.last) <= threshold &&
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
		const hover = this.#recognizers().hover;
		if (hover) this.#invoke('hover', hover.onStart, this.#idleSample('start', event));
	};
	#hoverEnd = (event: Event): void => {
		const hover = this.#recognizers().hover;
		if (hover) this.#invoke('hover', hover.onEnd, this.#idleSample('end', event));
	};

	#keyDown = (event: Event): void => {
		const keyboard = unwrap(this.#configuration?.definition)?.keyboard;
		if (!keyboard) return;
		const key = (event as KeyboardEvent).key;
		const step = keyboard.step ?? 8;
		const delta =
			key === 'ArrowLeft'
				? { x: -step, y: 0 }
				: key === 'ArrowRight'
					? { x: step, y: 0 }
					: key === 'ArrowUp'
						? { x: 0, y: -step }
						: key === 'ArrowDown'
							? { x: 0, y: step }
							: undefined;
		if (!delta) return;
		event.preventDefault();
		const signal = new AbortController().signal;
		this.#invoke(
			'keyboard',
			keyboard.onMove,
			freezeSample({
				phase: 'move',
				pointerType: 'keyboard',
				point: { x: 0, y: 0 },
				localPoint: { x: 0, y: 0 },
				delta,
				velocity: { x: 0, y: 0 },
				elapsed: 0,
				signal,
				originalEvent: event
			})
		);
	};

	/** Resolves definition recognizers with canonical site-specific overrides. */
	#recognizers() {
		const definition = unwrap(this.#configuration?.definition);
		const overrides = this.#configuration?.overrides;
		return {
			press: unwrap(overrides?.press) ?? unwrap(definition?.press),
			hover: unwrap(overrides?.hover) ?? unwrap(definition?.hover),
			drag: unwrap(overrides?.drag) ?? unwrap(definition?.drag),
			pan: unwrap(overrides?.pan) ?? unwrap(definition?.pan),
			pinch: unwrap(overrides?.pinch) ?? unwrap(definition?.pinch)
		};
	}

	/** Opens one named nonblocking task frame for a multi-event input session. */
	#beginSession(): void {
		this.#generation++;
		this.#abort = new AbortController();
		this.#startedAt = activeClock.now();
		this.#sessionExecution = runTaskFrame<void>(
			{
				kind: 'gesture-session',
				label: unwrap(this.#configuration?.definition)?.name ?? 'gesture',
				readiness: 'nonblocking',
				priority: 'immediate'
			},
			{
				work: () => {
					this.#sessionFrame = captureTaskFrame();
					return new Promise<void>((resolve) => (this.#settleSession = resolve));
				}
			}
		);
		void this.#sessionExecution.catch((error) => {
			if (!this.#sessionExecution?.signal.aborted) this.#report(error);
		});
	}

	/** Settles or cancels the session and releases all temporary resources. */
	#finishSession(reason: string, cancelled: boolean): void {
		if (cancelled) this.#sessionExecution?.cancel(reason);
		else this.#settleSession?.();
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
		this.#sessionFrame = undefined;
		this.#settleSession = undefined;
		this.#pendingMoves.clear();
		this.#generation++;
		globalThis.removeEventListener?.('blur', this.#windowBlur);
		if (this.#element instanceof HTMLElement) this.#element.style.userSelect = this.#userSelect;
	}

	/** Selects threshold-qualified single-pointer winners in deterministic priority order. */
	#activateSinglePointer(point: Point, pointer: PointerRecord, event: Event): void {
		const recognizers = this.#recognizers();
		const candidates = [
			recognizers.drag && { kind: 'drag' as const, recognizer: recognizers.drag },
			recognizers.pan && { kind: 'pan' as const, recognizer: recognizers.pan }
		]
			.filter(
				(candidate): candidate is { kind: 'drag' | 'pan'; recognizer: DragRecognizer } =>
					!!candidate
			)
			.sort((a, b) => (b.recognizer.priority ?? 0) - (a.recognizer.priority ?? 0));
		const eligible: ActiveRecognizer[] = [];
		for (const candidate of candidates) {
			const threshold =
				candidate.recognizer.threshold ?? this.#configuration?.settings.dragThreshold ?? 4;
			if (distance(pointer.origin, point) < threshold) continue;
			let axis = candidate.recognizer.axis ?? 'both';
			if (candidate.recognizer.lockDirection && axis === 'both') {
				axis =
					Math.abs(point.x - pointer.origin.x) >= Math.abs(point.y - pointer.origin.y) ? 'x' : 'y';
			}
			eligible.push({ ...candidate, axis });
		}
		const winner = eligible[0];
		if (!winner) return;
		this.#active = [
			winner,
			...eligible
				.slice(1)
				.filter((candidate) => winner.recognizer.simultaneous && candidate.recognizer.simultaneous)
		];
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
		const recognizer = this.#recognizers().pinch;
		if (!recognizer) return;
		const [first, second] = [...this.#pointers.values()];
		if (!first || !second) return;
		this.#pinch = {
			recognizer,
			distance: distance(first.last, second.last),
			angle: angle(first.last, second.last),
			center: midpoint(first.last, second.last),
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
		const center = first && second ? midpoint(first.last, second.last) : pinch.center;
		const currentDistance = first && second ? distance(first.last, second.last) : pinch.distance;
		const currentAngle = first && second ? angle(first.last, second.last) : pinch.angle;
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
		const elapsed = Math.max(0, activeClock.now() - this.#startedAt);
		const seconds = Math.max((activeClock.now() - previous.time) / 1000, 1 / 1000);
		let delta = { x: point.x - pointer.origin.x, y: point.y - pointer.origin.y };
		if (axis === 'x') delta = { x: delta.x, y: 0 };
		if (axis === 'y') delta = { x: 0, y: delta.y };
		const bounds = this.#element?.getBoundingClientRect();
		return freezeSample({
			phase,
			pointerType: normalizePointerType(pointer.pointerType),
			point,
			localPoint: { x: point.x - (bounds?.left ?? 0), y: point.y - (bounds?.top ?? 0) },
			delta,
			velocity: {
				x: (point.x - previous.last.x) / seconds,
				y: (point.y - previous.last.y) / seconds
			},
			elapsed,
			signal: this.#abort.signal,
			originalEvent: event
		});
	}

	/** Creates a zero-coordinate semantic sample for hover and focus intent. */
	#idleSample(phase: 'start' | 'end', event: Event): GestureSample {
		const point = { x: 0, y: 0 };
		return freezeSample({
			phase,
			pointerType: event.type.startsWith('focus') ? 'keyboard' : 'mouse',
			point,
			localPoint: point,
			delta: point,
			velocity: point,
			elapsed: 0,
			signal: new AbortController().signal,
			originalEvent: event
		});
	}

	/** Reads viewport coordinates from a pointer event. */
	#point(event: PointerEvent): Point {
		return { x: event.clientX ?? 0, y: event.clientY ?? 0 };
	}

	/** Delivers a callback immediately or through the latest-only move queue. */
	#invoke(
		kind: string,
		callback: GestureCallback<any> | undefined,
		sample: GestureSample,
		coalesce = false
	): void {
		if (!callback) return;
		if (coalesce && sample.signal.aborted) return;
		if (coalesce) {
			const generation = this.#generation;
			const delivery = this.#pendingMoves.get(kind) ?? { running: false };
			this.#pendingMoves.set(kind, delivery);
			if (delivery.running) {
				delivery.latest = sample;
				return;
			}
			delivery.running = true;
			this.#runCallback(kind, callback, sample).finally(() => {
				delivery.running = false;
				const latest = delivery.latest;
				delivery.latest = undefined;
				if (latest && !latest.signal.aborted && generation === this.#generation) {
					this.#invoke(kind, callback, latest, true);
				}
			});
			return;
		}
		void this.#runCallback(kind, callback, sample);
	}

	/** Runs one callback as named nonblocking work beneath the active gesture session. */
	async #runCallback(
		kind: string,
		callback: GestureCallback<any>,
		sample: GestureSample
	): Promise<void> {
		try {
			const execution = runTaskFrame(
				{
					...(this.#sessionFrame ? { parent: this.#sessionFrame } : {}),
					kind: `gesture-${kind}`,
					label: kind,
					priority: 'immediate',
					readiness: 'nonblocking'
				},
				{ work: async () => await callback(sample) }
			);
			await execution;
		} catch (error) {
			if (!sample.signal.aborted) this.#report(error);
		}
	}
}

function freezeSample(sample: GestureSample): GestureSample {
	return Object.freeze({
		...sample,
		point: Object.freeze(sample.point),
		localPoint: Object.freeze(sample.localPoint),
		delta: Object.freeze(sample.delta),
		velocity: Object.freeze(sample.velocity)
	});
}

function distance(first: Point, second: Point): number {
	return Math.hypot(second.x - first.x, second.y - first.y);
}
function midpoint(first: Point, second: Point): Point {
	return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}
function angle(first: Point, second: Point): number {
	return Math.atan2(second.y - first.y, second.x - first.x);
}
function normalizePointerType(value: string): GestureSample['pointerType'] {
	return value === 'touch' || value === 'pen' ? value : 'mouse';
}

function policyChanged(previous: SessionConfiguration, next: SessionConfiguration): boolean {
	if (
		unwrap(previous.definition) !== unwrap(next.definition) ||
		previous.disabled !== next.disabled ||
		previous.settings.enabled !== next.settings.enabled ||
		previous.settings.dragThreshold !== next.settings.dragThreshold ||
		previous.settings.pressThreshold !== next.settings.pressThreshold
	)
		return true;
	for (const key of ['press', 'hover', 'drag', 'pan', 'pinch'] as const) {
		if (unwrap(previous.overrides?.[key]) !== unwrap(next.overrides?.[key])) return true;
	}
	return false;
}
