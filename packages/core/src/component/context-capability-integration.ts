import { getComponentContext, hasComponentContext, setComponentContext } from './context-api.js';
import {
	registerComponentContextCapability,
	type ComponentContextCapability
} from './context-capability.js';
import { publishContextAccess } from './context-inspection.js';
import { prepareComponentContextResumption } from './context-resumption.js';

const capability: ComponentContextCapability = Object.freeze({
	has: hasComponentContext,
	get: getComponentContext,
	set: setComponentContext,
	publish: publishContextAccess,
	prepare: prepareComponentContextResumption
});

registerComponentContextCapability(capability);
