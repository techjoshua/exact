import {
	beginComponentContinuationOutputs,
	componentContinuationDependencies,
	initializeComponentExecution
} from '../tasks/component-execution.js';
import { registerComponentExecutionCapability } from '../tasks/component-execution-capability.js';

registerComponentExecutionCapability({
	initialize: initializeComponentExecution,
	dependencies: componentContinuationDependencies,
	outputs: beginComponentContinuationOutputs
});

export { componentExecutionValueForHost } from '../tasks/component-execution.js';
