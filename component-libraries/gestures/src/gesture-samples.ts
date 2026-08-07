import type { GestureSample } from './contracts.js';

/** Immutable viewport coordinate used by normalized gesture calculations. */
export type Point = Readonly<{ x: number; y: number }>;
/** Mutable session record retaining a pointer's origin and latest observed position. */
export type PointerRecord = { origin: Point; last: Point; time: number; pointerType: string };

type PointerSampleInput = Readonly<{
	phase: GestureSample['phase'];
	point: Point;
	pointer: PointerRecord;
	event: Event;
	previous?: PointerRecord;
	axis?: 'x' | 'y' | 'both';
	startedAt: number;
	now(): number;
	element?: Element;
	signal: AbortSignal;
}>;

/** Normalizes pointer state into an immutable viewport/local gesture sample. */
export function createPointerGestureSample(input: PointerSampleInput): GestureSample {
	const previous = input.previous ?? input.pointer;
	const axis = input.axis ?? 'both';
	const elapsed = Math.max(0, input.now() - input.startedAt);
	const seconds = Math.max((input.now() - previous.time) / 1000, 1 / 1000);
	let delta = {
		x: input.point.x - input.pointer.origin.x,
		y: input.point.y - input.pointer.origin.y
	};
	if (axis === 'x') delta = { x: delta.x, y: 0 };
	if (axis === 'y') delta = { x: 0, y: delta.y };
	const bounds = input.element?.getBoundingClientRect();
	return freezeGestureSample({
		phase: input.phase,
		pointerType: normalizePointerType(input.pointer.pointerType),
		point: input.point,
		localPoint: {
			x: input.point.x - (bounds?.left ?? 0),
			y: input.point.y - (bounds?.top ?? 0)
		},
		delta,
		velocity: {
			x: (input.point.x - previous.last.x) / seconds,
			y: (input.point.y - previous.last.y) / seconds
		},
		elapsed,
		signal: input.signal,
		originalEvent: input.event
	});
}

/** Creates a zero-coordinate semantic sample for hover, focus, and keyboard intent. */
export function createIdleGestureSample(phase: 'start' | 'end', event: Event): GestureSample {
	const point = { x: 0, y: 0 };
	return freezeGestureSample({
		phase,
		pointerType:
			event.type.startsWith('focus') || event.type.startsWith('key') ? 'keyboard' : 'mouse',
		point,
		localPoint: point,
		delta: point,
		velocity: point,
		elapsed: 0,
		signal: new AbortController().signal,
		originalEvent: event
	});
}

/** Freezes a semantic sample and each public coordinate so callbacks cannot mutate session data. */
export function freezeGestureSample(sample: GestureSample): GestureSample {
	return Object.freeze({
		...sample,
		point: Object.freeze(sample.point),
		localPoint: Object.freeze(sample.localPoint),
		delta: Object.freeze(sample.delta),
		velocity: Object.freeze(sample.velocity)
	});
}

/** Reads one pointer event as a viewport coordinate, tolerating incomplete test events. */
export function pointerEventPoint(event: PointerEvent): Point {
	return { x: event.clientX ?? 0, y: event.clientY ?? 0 };
}

/** Returns the Euclidean distance between two viewport coordinates. */
export function pointDistance(first: Point, second: Point): number {
	return Math.hypot(second.x - first.x, second.y - first.y);
}

/** Returns the coordinate centered between two pointer positions. */
export function pointMidpoint(first: Point, second: Point): Point {
	return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

/** Returns the directed angle in radians from the first coordinate to the second. */
export function pointAngle(first: Point, second: Point): number {
	return Math.atan2(second.y - first.y, second.x - first.x);
}

function normalizePointerType(value: string): GestureSample['pointerType'] {
	return value === 'touch' || value === 'pen' ? value : 'mouse';
}
