import {
	renderNativeSuspenseAsyncCapability,
	renderNativeSuspenseSyncCapability
} from '../render/native-boundaries.js';
import { registerSsrStructuralBoundaryCapability } from '../render/structural-boundary-capability.js';

registerSsrStructuralBoundaryCapability({
	renderSuspenseSync: renderNativeSuspenseSyncCapability,
	renderSuspenseAsync: renderNativeSuspenseAsyncCapability
});
