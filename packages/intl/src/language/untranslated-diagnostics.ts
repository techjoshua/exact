import type { ExactLanguageDiagnosticV1 } from '@exactjs/language-extension-api';
import type { IntlLanguageSpan } from './analysis-contracts.js';

/** Projects analyzer-proven untranslated spans into actionable provider warnings. */
export function intlUntranslatedDiagnostics(
	spans: readonly IntlLanguageSpan[]
): readonly ExactLanguageDiagnosticV1[] {
	return spans.map((span) => ({
		code: 'missing-intl',
		severity: 'warning',
		range: { start: span.start, end: span.start + span.length },
		summary: 'This likely linguistic content is not marked for translation.',
		explanation:
			'Add the corresponding intl enhancement, or add the standard inherited translate="no" attribute when this content must intentionally remain untranslated. lang and dir describe content but do not opt it out of translation.'
	}));
}
