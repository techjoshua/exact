import { registerResumptionBoundaryCapability } from '../render/resumption-boundary-capability.js';
import { renderResumableComponentBoundary } from '../render/resumption-boundaries.js';

registerResumptionBoundaryCapability(renderResumableComponentBoundary);
