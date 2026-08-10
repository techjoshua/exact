import type {
	ExactLanguageAnalyzer,
	ExactLanguageAnalyzerFactory,
	ExactLanguageCodeActionRequestV1,
	ExactLanguageCodeActionV1,
	ExactLanguageCompletionRequestV1,
	ExactLanguageCompletionV1,
	ExactLanguageDiagnosticsRequestV1,
	ExactLanguageHoverRequestV1,
	ExactLanguageHoverV1,
	ExactLanguageInlayHintRequestV1,
	ExactLanguageInlayHintV1
} from '@exactjs/language-extension-api';
import { ariaProperties, ariaRoles } from './generated/aria-data.js';
import { accessibilityDiagnostics, accessibilityHover } from './language/analysis.js';
import { isAccessibilityActivation } from './language/facts.js';

const activators = [
	'activeDescendant',
	'controls',
	'describedBy',
	'details',
	'errorMessage',
	'flowTo',
	'focusScope',
	'initialFocus',
	'labelledBy',
	'navigate',
	'owns',
	'returnFocus'
] as const;

/** Creates the Node-only accessibility analyzer used by the generic language-extension host. */
export const createExactLanguageAnalyzer: ExactLanguageAnalyzerFactory = async () =>
	new AccessibilityLanguageAnalyzer();

class AccessibilityLanguageAnalyzer implements ExactLanguageAnalyzer {
	async diagnostics(request: ExactLanguageDiagnosticsRequestV1, signal: AbortSignal) {
		throwIfAborted(signal);
		return accessibilityDiagnostics(request.projection);
	}

	async complete(
		request: ExactLanguageCompletionRequestV1,
		signal: AbortSignal
	): Promise<readonly ExactLanguageCompletionV1[]> {
		throwIfAborted(signal);
		const source = request.projection.document.text ?? '';
		const before = source.slice(Math.max(0, request.position - 120), request.position);
		const stringAttribute = /([\w:-]+)\s*=\s*["']([^"']*)$/u.exec(before);
		if (stringAttribute) {
			const name = stringAttribute[1]!;
			const prefix = stringAttribute[2]!;
			const values = completionValues(name);
			const start = request.position - prefix.length;
			return values
				.filter((value) => value.startsWith(prefix))
				.map((value) => ({ label: value, replace: { start, end: request.position } }));
		}
		const ariaName = /aria-([\w-]*)$/u.exec(before);
		if (ariaName) {
			const prefix = ariaName[1]!;
			return Object.keys(ariaProperties)
				.filter((value) => value.startsWith(prefix))
				.map((value) => ({
					label: `aria-${value}`,
					detail: 'WAI-ARIA state or property',
					replace: { start: request.position - prefix.length - 5, end: request.position }
				}));
		}
		const namespace = /a11y:([\w]*)$/u.exec(before);
		if (!namespace) return [];
		const prefix = namespace[1]!;
		return activators
			.filter((value) => value.startsWith(prefix))
			.map((value) => ({
				label: value,
				detail: 'Accessibility enhancement activator',
				replace: { start: request.position - prefix.length, end: request.position }
			}));
	}

	async hover(
		request: ExactLanguageHoverRequestV1,
		signal: AbortSignal
	): Promise<ExactLanguageHoverV1 | undefined> {
		throwIfAborted(signal);
		return accessibilityHover(request.projection, request.position);
	}

	async inlayHints(
		request: ExactLanguageInlayHintRequestV1,
		signal: AbortSignal
	): Promise<readonly ExactLanguageInlayHintV1[]> {
		throwIfAborted(signal);
		return request.projection.enhancements
			.filter(
				(activation) =>
					isAccessibilityActivation(activation) &&
					activation.activator === 'navigate' &&
					activation.range.start <= request.range.end &&
					request.range.start <= activation.range.end
			)
			.map((activation) => {
				const target = request.projection.jsx.find(
					(element) => element.id === activation.targetJsxId
				);
				const role = target?.attributes.find((attribute) => attribute.name === 'role')?.constant;
				return {
					position: activation.range.end,
					label: ` ⇒ ${typeof role === 'string' ? role : 'composite'} keyboard policy`,
					tooltip:
						'The accessibility enhancement owns focus movement, not selection or application state.',
					paddingLeft: true
				};
			});
	}

	async codeActions(
		request: ExactLanguageCodeActionRequestV1,
		signal: AbortSignal
	): Promise<readonly ExactLanguageCodeActionV1[]> {
		throwIfAborted(signal);
		if (!request.diagnostics.some((code) => code.endsWith('positive-tabindex'))) return [];
		const attribute = request.projection.jsx
			.flatMap((element) => element.attributes)
			.find(
				(candidate) =>
					(candidate.name === 'tabIndex' || candidate.name === 'tabindex') &&
					candidate.range.start <= request.range.end &&
					request.range.start <= candidate.range.end &&
					candidate.valueRange
			);
		if (!attribute?.valueRange) return [];
		const source = request.projection.document.text ?? '';
		const authored = source.slice(attribute.valueRange.start, attribute.valueRange.end);
		const newText = authored.startsWith('{') ? '{0}' : authored[0] === "'" ? "'0'" : '"0"';
		return [
			{
				title: 'Replace positive tabIndex with 0',
				kind: 'quickfix',
				diagnostics: request.diagnostics,
				edits: [
					{
						uri: request.projection.document.uri,
						version: request.projection.document.version,
						range: attribute.valueRange,
						newText
					}
				]
			}
		];
	}
}

function completionValues(name: string): readonly string[] {
	if (name === 'role') return ariaRoles;
	if (name === 'command')
		return [
			'show-modal',
			'close',
			'request-close',
			'show-popover',
			'hide-popover',
			'toggle-popover'
		];
	if (!name.startsWith('aria-')) return [];
	const domain = (ariaProperties as Readonly<Record<string, string | readonly string[]>>)[
		name.slice(5).toLowerCase()
	];
	return Array.isArray(domain) ? domain : [];
}

function throwIfAborted(signal: AbortSignal): void {
	if (signal.aborted)
		throw signal.reason instanceof Error
			? signal.reason
			: new Error('Accessibility language request aborted');
}
