import type {
	MotionDefinition,
	MotionDefinitionInput,
	MotionEffect,
	MotionPhase
} from './contracts.js';
import { validateMotionEffect } from './validation.js';

const preparedMotionDefinition = Symbol('exact.motion.definition');

/** Validates and freezes a reusable motion definition. */
export function defineMotion(definition: MotionDefinitionInput): MotionDefinition {
	if (!definition || typeof definition !== 'object')
		throw new TypeError('defineMotion() requires a motion definition object');
	const prepared = {
		...(definition.enter ? { enter: preparePhase(definition.enter, 'enter') } : {}),
		...(definition.change ? { change: preparePhase(definition.change, 'change') } : {}),
		...(definition.leave ? { leave: preparePhase(definition.leave, 'leave') } : {}),
		...(definition.reduced
			? {
					reduced:
						definition.reduced === 'skip' ? 'skip' : preparePhase(definition.reduced, 'reduced')
				}
			: {})
	};
	Object.defineProperty(prepared, preparedMotionDefinition, { value: true });
	return Object.freeze(prepared) as MotionDefinition;
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
	validateMotionEffect(effect, `Motion ${label} phase`, {
		allowInfiniteIterations: allowLoop
	});
	const keyframes = Array.isArray(effect.keyframes)
		? Object.freeze(effect.keyframes.map((frame) => Object.freeze({ ...frame })))
		: Object.freeze({ ...effect.keyframes });
	return Object.freeze({
		keyframes,
		...(effect.options ? { options: Object.freeze({ ...effect.options }) } : {})
	}) as MotionEffect;
}
