/**
 * Installs native Activity and Suspense rendering for explicit low-level runtime hosts.
 * Compiled boundary usage selects this integration automatically.
 */
import { installStructuralBoundaryIntegration } from './structural-integration.js';

installStructuralBoundaryIntegration();
