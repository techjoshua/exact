import { unwrap } from '@exactjs/core';
import type {
	DragRecognizer,
	GestureDefinition,
	GestureElementProps,
	GestureSettings
} from './contracts.js';
import { pointDistance, type Point } from './gesture-samples.js';

export type ActiveRecognizer = {
	kind: 'drag' | 'pan';
	recognizer: DragRecognizer;
	axis: 'x' | 'y' | 'both';
};

export type SessionConfiguration = Readonly<{
	element?: Element;
	presented: boolean;
	definition?: GestureDefinition;
	disabled: boolean;
	settings: GestureSettings;
	overrides?: Pick<GestureElementProps, 'press' | 'hover' | 'drag' | 'pan' | 'pinch'>;
}>;

/** Resolves prepared recognizers with canonical site-specific overrides. */
export function resolveGestureRecognizers(configuration: SessionConfiguration | undefined) {
	const definition = unwrap(configuration?.definition);
	const overrides = configuration?.overrides;
	return {
		press: unwrap(overrides?.press) ?? unwrap(definition?.press),
		hover: unwrap(overrides?.hover) ?? unwrap(definition?.hover),
		drag: unwrap(overrides?.drag) ?? unwrap(definition?.drag),
		pan: unwrap(overrides?.pan) ?? unwrap(definition?.pan),
		pinch: unwrap(overrides?.pinch) ?? unwrap(definition?.pinch)
	};
}

/** Reports whether a configuration change invalidates in-flight recognition. */
export function gesturePolicyChanged(
	previous: SessionConfiguration,
	next: SessionConfiguration
): boolean {
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

/** Returns the highest explicit recognizer priority available at one target. */
export function gestureRoutingPriority(configuration: SessionConfiguration | undefined): number {
	const recognizers = resolveGestureRecognizers(configuration);
	return Math.max(
		recognizers.press?.priority ?? 0,
		recognizers.drag?.priority ?? 0,
		recognizers.pan?.priority ?? 0,
		recognizers.pinch?.priority ?? 0
	);
}

/** Selects threshold-qualified single-pointer winners and their cancelled competitors. */
export function selectSinglePointerRecognizers(
	configuration: SessionConfiguration | undefined,
	origin: Point,
	point: Point
): Readonly<{ active: ActiveRecognizer[]; cancelled: ActiveRecognizer[] }> {
	const recognizers = resolveGestureRecognizers(configuration);
	const candidates = [
		recognizers.drag && { kind: 'drag' as const, recognizer: recognizers.drag },
		recognizers.pan && { kind: 'pan' as const, recognizer: recognizers.pan }
	]
		.filter(
			(candidate): candidate is { kind: 'drag' | 'pan'; recognizer: DragRecognizer } => !!candidate
		)
		.sort((a, b) => (b.recognizer.priority ?? 0) - (a.recognizer.priority ?? 0));
	const eligible: ActiveRecognizer[] = [];
	for (const candidate of candidates) {
		const threshold = candidate.recognizer.threshold ?? configuration?.settings.dragThreshold ?? 4;
		if (pointDistance(origin, point) < threshold) continue;
		let axis = candidate.recognizer.axis ?? 'both';
		if (candidate.recognizer.lockDirection && axis === 'both') {
			axis = Math.abs(point.x - origin.x) >= Math.abs(point.y - origin.y) ? 'x' : 'y';
		}
		eligible.push({ ...candidate, axis });
	}
	const groupWinners: ActiveRecognizer[] = [];
	const claimedGroups = new Set<string>();
	for (const candidate of eligible) {
		const group = candidate.recognizer.exclusiveGroup ?? candidate.kind;
		if (claimedGroups.has(group)) continue;
		claimedGroups.add(group);
		groupWinners.push(candidate);
	}
	const winner = groupWinners[0];
	if (!winner) return { active: [], cancelled: [] };
	const active = [
		winner,
		...groupWinners
			.slice(1)
			.filter((candidate) => winner.recognizer.simultaneous && candidate.recognizer.simultaneous)
	];
	const selected = new Set(active);
	return { active, cancelled: eligible.filter((candidate) => !selected.has(candidate)) };
}
