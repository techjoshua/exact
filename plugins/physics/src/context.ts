import { createContext } from '@exactjs/core';
import type { PhysicsBody, PhysicsWorld } from './contracts.js';

/** Current world inherited through logical component ownership. */
export const PhysicsWorldContext = createContext<PhysicsWorld>('physics.world', {
	global: true,
	reactive: false,
	keep: 'shared'
});

/** Current projected body and world for same-target inner enhancements. */
export const PhysicsBodyContext = createContext<{
	readonly body: PhysicsBody;
	readonly world: PhysicsWorld;
}>('physics.body', { global: true, reactive: false, keep: 'shared' });
