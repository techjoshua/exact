import { PhysicsWorldComponent } from './components.js';
import type { PhysicsWorld as PhysicsWorldContract } from './contracts.js';

/** Ordinary component value paired with the DOM-independent world resource type. */
export const PhysicsWorld = PhysicsWorldComponent;
/** DOM-independent world resource contract. */
export type PhysicsWorld = PhysicsWorldContract;
