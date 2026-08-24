import './structural-boundaries.js';
import '../render/construction-errors.js';
import '../render/generic-render-program-owner.js';
import '@exactjs/core/runtime/component-tasks';
import { renderGenericComponentAsync } from '../render/generic-component-async.js';
import {
	renderGenericComponentSync,
	renderGenericComponentSyncChunks
} from '../render/generic-component-sync.js';
import {
	planSsrEnhancementBoundary,
	planSsrEnhancementBoundaryAsync,
	prepareSsrTargetBoundary,
	prepareSsrTargetBoundaryAsync
} from '../render/enhancement-planning.js';
import { registerSsrEnhancementPlanningCapability } from '../render/enhancement-planning-capability.js';
import {
	registerGenericSsrComponentRenderer,
	registerGenericSyncSsrChunkRenderer,
	registerGenericSyncSsrComponentRenderer
} from '../render/generic-component-capability.js';

registerGenericSsrComponentRenderer(renderGenericComponentAsync);
registerGenericSyncSsrComponentRenderer(renderGenericComponentSync);
registerGenericSyncSsrChunkRenderer(renderGenericComponentSyncChunks);
registerSsrEnhancementPlanningCapability({
	planBoundary: planSsrEnhancementBoundary,
	planBoundaryAsync: planSsrEnhancementBoundaryAsync,
	prepareTarget: prepareSsrTargetBoundary,
	prepareTargetAsync: prepareSsrTargetBoundaryAsync
});
