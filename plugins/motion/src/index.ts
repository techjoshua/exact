export { MotionConfig, MotionContext, defaultMotionSettings } from './context.js';
export { defineMotion, isMotionDefinition } from './definitions.js';
export { MotionElement } from './motion-element.js';
export { Motion } from './motion.js';
export { MotionList } from './motion-list.js';
export { Presence } from './presence.js';
export { animate, resolveMotionEffect } from './playback.js';
export type {
	MotionConfigProps,
	MotionDefinition,
	MotionDefinitionInput,
	MotionDriver,
	MotionEffect,
	MotionElementProps,
	MotionPhase,
	MotionPhaseContext,
	MotionPlayback,
	MotionPluginConfig,
	MotionListProps,
	MotionProps,
	MotionReducedPolicy,
	MotionSettings,
	MotionTransition,
	PresenceProps
} from './contracts.js';

export { MotionElement as default } from './motion-element.js';
