import { GravityFieldComponent } from './components.js';
import type { GravityField as GravityFieldContract } from './contracts.js';

/** Ordinary field-registration component paired with the prepared field value type. */
export const GravityField = GravityFieldComponent;
/** Pure prepared acceleration field contract. */
export type GravityField = GravityFieldContract;
