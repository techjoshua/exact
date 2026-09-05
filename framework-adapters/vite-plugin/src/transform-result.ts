import type { ExactLanguageValidationSession } from '@exactjs/language-extension-host';
import type { transformExactViteModule } from './transform.js';

type ExactViteTransform = NonNullable<ReturnType<typeof transformExactViteModule>>;
type ExactViteTransformResult = Omit<ExactViteTransform, 'languageProjection'>;

/** Validates and removes adapter-only language metadata before returning a Vite transform result. */
export function finalizeExactViteTransform(
	transformed: ExactViteTransform | null,
	languageValidation: ExactLanguageValidationSession | undefined
): ExactViteTransformResult | null | Promise<ExactViteTransformResult> {
	if (!transformed) return null;
	const { languageProjection, ...result } = transformed;
	return languageProjection && languageValidation
		? languageValidation.validate([languageProjection]).then(() => result)
		: result;
}
