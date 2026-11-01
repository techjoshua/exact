import type { validateIntlPackageMetadata } from '../../intl/src/package-metadata.js';
import type { createIntlEnvironment } from '../../intl/src/environment.js';
import type {
	projectIntlTranslationContract,
	materializeIntlTranslation
} from '../../intl/src/translation-contract.js';
/** Runs public pattern observation ownership through source, native and browser hosts. */
export function verifyIntlPatternObservations(api: {
	createIntlEnvironment: typeof createIntlEnvironment;
	validateIntlPackageMetadata: typeof validateIntlPackageMetadata;
	projectIntlTranslationContract: typeof projectIntlTranslationContract;
	materializeIntlTranslation: typeof materializeIntlTranslation;
}): true;
