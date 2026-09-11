import { renderServerBoundary } from '../render/boundaries.js';
import { renderNativeSuspenseCapability } from '../render/native-boundaries.js';
import { registerServerBoundaryCapability } from '../render/server-boundary-capability.js';
import { registerSsrStructuralBoundaryCapability } from '../render/structural-boundary-capability.js';

registerSsrStructuralBoundaryCapability({ renderSuspense: renderNativeSuspenseCapability });
registerServerBoundaryCapability({ renderAsync: renderServerBoundary });
