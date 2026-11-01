import type {
	MotionDefinition,
	MotionDefinitionInput,
	MotionEffect,
	MotionPhase
} from './contracts.js';
import { validateMotionEffect } from './validation.js';

const preparedMotionDefinition = Symbol('exact.motion.definition');

/** Validates reusable motion and copies static effects without freezing authored values. */
export function defineMotion(definition: MotionDefinitionInput): MotionDefinition {
	if (!definition || typeof definition !== 'object')
		throw new TypeError('defineMotion() requires a motion definition object');
	const { enter, change, leave, reduced } = definition;
	const prepared = {
		...(enter ? { enter: preparePhase(enter, 'enter') } : {}),
		...(change ? { change: preparePhase(change, 'change') } : {}),
		...(leave ? { leave: preparePhase(leave, 'leave') } : {}),
		...(reduced
			? {
					reduced: reduced === 'skip' ? 'skip' : preparePhase(reduced, 'reduced')
				}
			: {})
	};
	Object.defineProperty(prepared, preparedMotionDefinition, { value: true });
	return prepared as MotionDefinition;
}

/** Reports whether an unknown value is a package-prepared motion definition. */
export function isMotionDefinition(value: unknown): value is MotionDefinition {
	return !!value && typeof value === 'object' && preparedMotionDefinition in value;
}

function preparePhase(phase: MotionPhase, label: string): MotionPhase {
	if (typeof phase === 'function') return phase;
	return prepareEffect(phase, label, label === 'enter' || label === 'change');
}

function prepareEffect(effect: MotionEffect, label: string, allowLoop: boolean): MotionEffect {
	const keyframes = effect?.keyframes;
	const options = effect?.options;
	const prepared = {
		keyframes: Array.isArray(keyframes)
			? keyframes.map((frame) => ({ ...frame }))
			: keyframes && { ...keyframes },
		...(options ? { options: { ...options } } : {})
	};
	validateMotionEffect(prepared, `Motion ${label} phase`, {
		allowInfiniteIterations: allowLoop
	});
	return prepared;
}
