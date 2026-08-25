import './structural-boundaries.js';
import './resumption-boundaries.js';
import './enhancements.js';
import '../render/construction-errors.js';
import '../render/generic-render-program-owner.js';
import '@exactjs/core/runtime/component-tasks';
import { encodeReactiveProtocolValue } from '@exactjs/reactive/framework/protocol';
import { peek } from '@exactjs/reactive/framework/tracking';
import { registerHydrationProtocolEncoder } from '../hydration-encoding-capability.js';
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
import { registerSsrReactivePeek } from '../render/reactive-tracking-capability.js';
import {
	registerGenericSsrComponentRenderer,
	registerGenericSyncSsrChunkRenderer,
	registerGenericSyncSsrComponentRenderer
} from '../render/generic-component-capability.js';

registerGenericSsrComponentRenderer(renderGenericComponentAsync);
registerHydrationProtocolEncoder(encodeReactiveProtocolValue);
registerSsrReactivePeek(peek);
registerGenericSyncSsrComponentRenderer(renderGenericComponentSync);
registerGenericSyncSsrChunkRenderer(renderGenericComponentSyncChunks);
registerSsrEnhancementPlanningCapability({
	planBoundary: planSsrEnhancementBoundary,
	planBoundaryAsync: planSsrEnhancementBoundaryAsync,
	prepareTarget: prepareSsrTargetBoundary,
	prepareTargetAsync: prepareSsrTargetBoundaryAsync
});
