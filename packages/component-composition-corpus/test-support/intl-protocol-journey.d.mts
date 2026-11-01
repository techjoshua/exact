import type {
	validateIntlRuntimeDescriptor,
	validateIntlCatalog,
	prepareIntlActivation,
	registerIntlArtifacts
} from '../../intl/src/internal.js';
import type { canonicalizeIntlValue } from '../../intl/src/canonical.js';
/** Executes the protocol capture contract shared by built-package and browser checks. */
export function verifyIntlProtocolValues(api: {
	validateIntlRuntimeDescriptor: typeof validateIntlRuntimeDescriptor;
	validateIntlCatalog: typeof validateIntlCatalog;
	prepareIntlActivation: typeof prepareIntlActivation;
	registerIntlArtifacts: typeof registerIntlArtifacts;
	canonicalizeIntlValue: typeof canonicalizeIntlValue;
}): true;
/** Checks finite captured limits and normalized publication bounds across descriptor and catalog validation. */
export function verifyIntlValidationLimits(api: {
	validateIntlRuntimeDescriptor: typeof validateIntlRuntimeDescriptor;
	validateIntlCatalog: typeof validateIntlCatalog;
}): true;
/** Checks ordinary registry observations with private generation controls intact. */
export function verifyIntlArtifactObservations(api: {
	registerIntlArtifacts: typeof registerIntlArtifacts;
	snapshotIntlArtifacts: typeof import('../../intl/src/artifacts.js').snapshotIntlArtifacts;
}): void;
/** Checks ordinary aliases in a generated module without retaining their temporary changes. */
export function verifyIntlGeneratedObservations(module: {
	readonly descriptors: readonly { readonly owner: string }[];
	readonly catalogs: readonly unknown[];
	readonly clientRequirements: readonly unknown[];
}): void;
