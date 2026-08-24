import {
	renderNativeSuspenseAsyncCapability,
	renderNativeSuspenseSyncCapability
} from '../render/native-boundaries.js';
import { renderServerBoundary, renderServerBoundaryAsync } from '../render/boundaries.js';
import { registerServerBoundaryCapability } from '../render/server-boundary-capability.js';
import { registerServerBoundaryChunkCapability } from '../render/server-boundary-chunk-capability.js';
import { registerSsrStructuralBoundaryCapability } from '../render/structural-boundary-capability.js';
import { renderClientBoundaryChunks } from '../render/client-boundary-chunks.js';

registerSsrStructuralBoundaryCapability({
	renderSuspenseSync: renderNativeSuspenseSyncCapability,
	renderSuspenseAsync: renderNativeSuspenseAsyncCapability
});
registerServerBoundaryCapability({
	render: renderServerBoundary,
	renderAsync: renderServerBoundaryAsync
});
registerServerBoundaryChunkCapability(renderClientBoundaryChunks);
