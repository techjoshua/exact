import { profileTimestamp, publishExactProfile } from '@exactjs/instrumentation';
import type { DomProfileEvent, Root } from '../types.js';
import { domPhaseProfiling } from './profiling-policy.js';

type DomProfileSpan = {
	readonly startedAt: number;
	childElapsedMs: number;
	readonly parent?: DomProfileSpan;
};

const activeSpans = new WeakMap<Root, DomProfileSpan>();

/** Starts an optional DOM phase timer without reading the clock when profiling is disabled. */
export function beginDomProfile(root: Root): DomProfileSpan | undefined {
	if (!domPhaseProfiling || !root.onProfile) return undefined;
	const span: DomProfileSpan = {
		startedAt: profileTimestamp(),
		childElapsedMs: 0,
		...(activeSpans.get(root) ? { parent: activeSpans.get(root) } : {})
	};
	activeSpans.set(root, span);
	return span;
}

/** Publishes one focused DOM phase while keeping instrumentation failures observational. */
export function finishDomProfile(
	root: Root,
	phase: DomProfileEvent['phase'],
	span: DomProfileSpan | undefined
): void {
	if (!domPhaseProfiling || !span) return;
	const elapsedMs = profileTimestamp() - span.startedAt;
	if (span.parent) {
		span.parent.childElapsedMs += elapsedMs;
		activeSpans.set(root, span.parent);
	} else activeSpans.delete(root);
	publishExactProfile(root.onProfile, {
		subsystem: 'dom',
		phase,
		elapsedMs: Math.max(0, elapsedMs - span.childElapsedMs)
	});
}
