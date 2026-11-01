import type {
	installExactDevtoolsRuntime,
	exactDevtoolsHookSymbol
} from '../../devtools-runtime/src/index.js';
import type { createFrameworkFixtureComponentInstance } from '../../core/src/testing/runtime.js';
import type { createFrameworkComponentDomain } from '../../core/src/component/domain.js';
import type { inspectExactRuntimeComponent } from '../../core/src/component/inspection.js';
/** Checks visible client values through public inspector and component ownership boundaries. */
export function verifyClientInspectionValues(api: {
	createContext: typeof import('../../core/src/keys.js').createContext;
	installExactDevtoolsRuntime: typeof installExactDevtoolsRuntime;
	exactDevtoolsHookSymbol: typeof exactDevtoolsHookSymbol;
	createFrameworkFixtureComponentInstance: typeof createFrameworkFixtureComponentInstance;
	createFrameworkComponentDomain: typeof createFrameworkComponentDomain;
	inspectExactRuntimeComponent: typeof inspectExactRuntimeComponent;
}): Promise<true>;
