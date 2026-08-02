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

/** Starts finite motion inside an immediate, nonblocking task frame. */
export function animate(element: Element, effect: MotionEffect): MotionPlayback {
	validateEffect(effect);
	const parent = captureTaskFrame();
	return runTaskFrame(
		{
			...(parent ? { parent } : {}),
			kind: 'motion',
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
	if (reduced && reducedPhase === 'skip') return undefined;
	const selected = reduced && reducedPhase ? reducedPhase : phase;
	if (selected === 'skip') return undefined;
	const resolved =
		typeof selected === 'function'
			? selected({ phase: phaseName, element, reducedMotion: reduced })
			: selected;
	const effect = unwrap(resolved);
	if (!effect) return undefined;
	return {
		keyframes: effect.keyframes,
		options: {
			duration: 180,
			easing: 'ease-out',
			...settings.transition,
			...effect.options
		}
	};
}

function reducedMotion(policy: MotionSettings['reducedMotion']): boolean {
	if (policy === 'always') return true;
	if (policy === 'never') return false;
	return (
		typeof globalThis.matchMedia === 'function' &&
		globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
	);
}

function validateEffect(effect: MotionEffect): void {
	if (!effect || typeof effect !== 'object' || !effect.keyframes)
		throw new TypeError('animate() requires a finite motion effect');
	const iterations = effect.options?.iterations;
	if (iterations === Infinity) throw new TypeError('animate() accepts only finite effects');
}

function describeElement(element: Element): string {
	return `Animate ${element.localName || 'element'}`;
}
