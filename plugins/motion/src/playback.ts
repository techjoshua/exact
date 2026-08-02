import { unwrap } from '@exactjs/core';
import { captureTaskFrame, runTaskFrame } from '@exactjs/core/framework/task-frames';
import type {
	MotionEffect,
	MotionPhase,
	MotionPhaseContext,
	MotionPlayback,
	MotionSettings
} from './contracts.js';
import { motionDriver } from './driver.js';
import { validateMotionEffect } from './validation.js';

type MotionFrameKind =
	| 'motion'
	| 'motion-enter'
	| 'motion-change'
	| 'motion-leave'
	| 'layout-transition';

/** Starts finite motion inside an immediate, nonblocking task frame. */
export function animate(element: Element, effect: MotionEffect): MotionPlayback {
	return animateInFrame(element, effect, 'motion');
}

/** Starts package-owned motion with a phase-specific semantic task kind. */
export function animateInFrame(
	element: Element,
	effect: MotionEffect,
	kind: MotionFrameKind
): MotionPlayback {
	validateMotionEffect(effect, 'animate() effect');
	const parent = captureTaskFrame();
	return runTaskFrame(
		{
			...(parent ? { parent } : {}),
			kind,
			label: describeElement(element),
			priority: 'immediate',
			readiness: 'nonblocking'
		},
		{
			work: (context) => motionDriver().play(element, effect, context.signal)
		}
	) as MotionPlayback;
}

/** Resolves one authored phase against reduced-motion and transition policy. */
export function resolveMotionEffect(
	phase: MotionPhase | undefined,
	element: Element,
	phaseName: MotionPhaseContext['phase'],
	settings: MotionSettings,
	reducedPhase?: MotionPhase | 'skip'
): MotionEffect | undefined {
	if (!settings.enabled || !phase) return undefined;
	const reduced = reducedMotion(settings.reducedMotion);
	const selected = reduced ? (reducedPhase ?? 'skip') : phase;
	if (selected === 'skip') return undefined;
	const resolved =
		typeof selected === 'function'
			? selected({ phase: phaseName, element, reducedMotion: reduced })
			: selected;
	const resolvedEffect = unwrap(resolved);
	if (!resolvedEffect) return undefined;
	const effect = {
		keyframes: resolvedEffect.keyframes,
		options: {
			duration: 180,
			easing: 'ease-out',
			...settings.transition,
			...resolvedEffect.options
		}
	};
	validateMotionEffect(effect, `${phaseName} motion`);
	return effect;
}

function reducedMotion(policy: MotionSettings['reducedMotion']): boolean {
	if (policy === 'always') return true;
	if (policy === 'never') return false;
	return (
		typeof globalThis.matchMedia === 'function' &&
		globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
	);
}

function describeElement(element: Element): string {
	return `Animate ${element.localName || 'element'}`;
}
