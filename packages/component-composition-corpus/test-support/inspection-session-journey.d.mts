import type {
	installExactDevtoolsRuntime,
	exactDevtoolsHookSymbol
} from '../../devtools-runtime/src/index.js';
/** Checks writable session descriptions and private lifecycle authority in source, native hosts and browsers. */
export function verifyInspectionSessionObservations(api: {
	installExactDevtoolsRuntime: typeof installExactDevtoolsRuntime;
	exactDevtoolsHookSymbol: typeof exactDevtoolsHookSymbol;
}): Promise<true>;
