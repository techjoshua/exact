import type {
	ExactEnhancementActivationV1,
	ExactLanguageAnalyzer,
	ExactLanguageAnalyzerFactory,
	ExactLanguageCompletionRequestV1,
	ExactLanguageCompletionV1,
	ExactLanguageDiagnosticV1,
	ExactLanguageDiagnosticsRequestV1,
	ExactLanguageHoverRequestV1,
	ExactLanguageHoverV1,
	ExactLanguageInlayHintRequestV1,
	ExactLanguageInlayHintV1,
	ExactLanguageProjectionV1
} from '@exactjs/language-extension-api';
import type { TimeUpdatePolicy } from './contracts.js';

const policies = [
	'auto',
	'millisecond',
	'second',
	'minute',
	'hour',
	'day',
	'week',
	'month',
	'year',
	'disabled'
] as const satisfies readonly Exclude<TimeUpdatePolicy, true>[];

/** Creates the Node-only time analyzer used by the generic language-extension host. */
export const createExactLanguageAnalyzer: ExactLanguageAnalyzerFactory = async () =>
	new TimeLanguageAnalyzer();

class TimeLanguageAnalyzer implements ExactLanguageAnalyzer {
	async diagnostics(
		request: ExactLanguageDiagnosticsRequestV1,
		signal: AbortSignal
	): Promise<readonly ExactLanguageDiagnosticV1[]> {
		throwIfAborted(signal);
		const diagnostics: ExactLanguageDiagnosticV1[] = [];
		for (const activation of timeActivations(request.projection)) {
			const attribute = updateAttribute(request.projection, activation);
			if (!attribute) continue;
			if (
				attribute.valueKind === 'string' &&
				typeof attribute.constant === 'string' &&
				!policies.includes(attribute.constant as never)
			)
				diagnostics.push({
					code: 'invalid-time-update-policy',
					severity: 'error',
					range: attribute.valueRange ?? attribute.range,
					summary: `Unsupported time:update policy “${attribute.constant}”.`,
					explanation: `Use one of ${policies.join(', ')}.`,
					documentation: 'https://exact.js.org/components/date-time'
				});
			const source = activationAnalysisSource(request.projection, activation);
			if (/smallestUnit\s*:\s*["'](?:microsecond|nanosecond)s?["']/u.test(source)) {
				diagnostics.push({
					code: 'time-clock-precision-unavailable',
					severity: 'error',
					range: attribute.range,
					summary: 'The selected clock provides millisecond precision.',
					explanation:
						'Temporal microsecond and nanosecond view updates require a higher-precision clock capability.',
					documentation: 'https://exact.js.org/components/date-time'
				});
			} else if (!hasClockSource(source)) {
				diagnostics.push({
					code: 'time-update-without-clock',
					severity: 'error',
					range: attribute.range,
					summary: 'time:update has no reachable clock dependency.',
					explanation:
						'Use Date.now(), zero-argument new Date(), or Temporal.Now in this lexical range, or remove the enhancement.',
					documentation: 'https://exact.js.org/components/date-time'
				});
			} else if (attributeMayUseAuto(attribute.constant) && !hasBoundedAutoEvidence(source)) {
				diagnostics.push({
					code: 'time-auto-inference-unbounded',
					severity: 'error',
					range: attribute.range,
					summary: 'Automatic clock-update accuracy cannot be inferred.',
					explanation:
						'Use an explicit accuracy such as time:update="second", or expose quantized clock math to the compiler.',
					documentation: 'https://exact.js.org/components/date-time'
				});
			}
		}
		return Object.freeze(diagnostics);
	}

	async complete(
		request: ExactLanguageCompletionRequestV1,
		signal: AbortSignal
	): Promise<readonly ExactLanguageCompletionV1[]> {
		throwIfAborted(signal);
		const source = request.projection.document.text ?? '';
		const before = source.slice(Math.max(0, request.position - 80), request.position);
		const value = /time:update\s*=\s*["']([^"']*)$/u.exec(before);
		if (value) {
			const prefix = value[1]!;
			return policies
				.filter((policy) => policy.startsWith(prefix))
				.map((policy) => ({
					label: policy,
					detail: policyDetail(policy),
					replace: { start: request.position - prefix.length, end: request.position }
				}));
		}
		if (!/time:([\w-]*)$/u.test(before)) return [];
		return [{ label: 'update', detail: 'Make clock reads in this view range reactive' }];
	}

	async hover(
		request: ExactLanguageHoverRequestV1,
		signal: AbortSignal
	): Promise<ExactLanguageHoverV1 | undefined> {
		throwIfAborted(signal);
		const activation = timeActivations(request.projection).find(
			(candidate) =>
				candidate.range.start <= request.position && request.position <= candidate.range.end
		);
		if (!activation) return undefined;
		const attribute = updateAttribute(request.projection, activation);
		const policy = attribute?.constant === true ? 'auto' : attribute?.constant;
		const evidence = inferSourceEvidence(activationAnalysisSource(request.projection, activation));
		return {
			range: activation.range,
			markdown: [
				'**Reactive clock view**',
				'',
				`Policy: \`${typeof policy === 'string' ? policy : 'reactive'}\``,
				activation.ownerComponentId ? `Owner: \`${activation.ownerComponentId}\`` : undefined,
				`Plan: ${evidence}`,
				'',
				'Clock reads are sampled once per reactive cycle. Auto mode derives the next visible change when the expression is compiler-provable; explicit policies provide the requested maximum update cadence.'
			]
				.filter((line): line is string => line !== undefined)
				.join('\n')
		};
	}

	async inlayHints(
		request: ExactLanguageInlayHintRequestV1,
		signal: AbortSignal
	): Promise<readonly ExactLanguageInlayHintV1[]> {
		throwIfAborted(signal);
		return timeActivations(request.projection)
			.filter(
				(activation) =>
					activation.range.end >= request.range.start && activation.range.start <= request.range.end
			)
			.map((activation) => {
				const attribute = updateAttribute(request.projection, activation);
				const policy = attribute?.constant === true ? 'auto' : attribute?.constant;
				return {
					position: activation.range.end,
					label: ` clock: ${typeof policy === 'string' ? policy : 'reactive'}`,
					tooltip: 'One range-local registration on the clock-shared earliest-deadline scheduler.',
					evidence: [
						{
							range: activation.range,
							kind: 'time-update',
							explanation: 'This resolved enhancement activates reactive clock lowering.'
						}
					]
				};
			});
	}
}

function timeActivations(projection: ExactLanguageProjectionV1) {
	return projection.enhancements.filter(
		(activation) =>
			activation.activator === 'update' &&
			(activation.package?.name === '@exactjs/time' ||
				activation.module?.startsWith('@exactjs/time') === true)
	);
}

function updateAttribute(
	projection: ExactLanguageProjectionV1,
	activation: ExactEnhancementActivationV1
) {
	return projection.jsx
		.find((element) => element.id === activation.targetJsxId)
		?.attributes.find(
			(attribute) => attribute.name === 'time:update' || attribute.localName === 'update'
		);
}

function activationAnalysisSource(
	projection: ExactLanguageProjectionV1,
	activation: ExactEnhancementActivationV1
): string {
	const source = projection.document.text ?? '';
	const element = projection.jsx.find((candidate) => candidate.id === activation.targetJsxId);
	let analysis = element ? source.slice(element.range.start, element.range.end) : '';
	const visited = new Set<string>();
	for (let depth = 0; depth < 8; depth++) {
		let expanded = false;
		for (const identifier of analysis.matchAll(/\b[$A-Z_a-z][$\w]*\b/gu)) {
			const name = identifier[0];
			if (visited.has(name)) continue;
			visited.add(name);
			const declaration = new RegExp(
				`\\b(?:const|let)\\s+${escapeRegExp(name)}(?:\\s*:[^=;]+)?\\s*=\\s*([^;]+)`,
				'u'
			).exec(source);
			if (!declaration?.[1]) continue;
			analysis += `\n${declaration[1]}`;
			expanded = true;
		}
		if (!expanded) break;
	}
	return analysis;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function hasClockSource(source: string): boolean {
	return /\bDate\.now\s*\(|\bnew\s+Date\s*\(\s*\)|\bTemporal\.Now\.[A-Za-z]+\s*\(/u.test(source);
}

function hasBoundedAutoEvidence(source: string): boolean {
	return (
		/Math\.(?:floor|ceil|round|trunc)\s*\([\s\S]*?\/\s*[\d_]+/u.test(source) ||
		/Intl\.DateTimeFormat\s*\(/u.test(source) ||
		/(?:\.until|\.since)\s*\([\s\S]*?\.round\s*\(\s*(?:["'](?:millisecond|second|minute|hour)s?["']|\{[\s\S]*?smallestUnit\s*:\s*["'](?:millisecond|second|minute|hour)s?["'])/u.test(
			source
		) ||
		/\.toLocaleString\s*\(/u.test(source)
	);
}

function attributeMayUseAuto(constant: unknown): boolean {
	return constant === true || constant === 'auto' || typeof constant !== 'string';
}

function inferSourceEvidence(source: string): string {
	if (/\?[^:]+:/u.test(source) && /Math\.(?:floor|ceil|round|trunc)/u.test(source))
		return 'adaptive finite branches; active precision plus the next branch threshold';
	if (/fractionalSecondDigits/u.test(source)) return 'formatter-derived fractional-second boundary';
	if (/\bsecond\b|\/\s*1_?000\b/u.test(source)) return 'aligned second boundary';
	if (/\bminute\b|\/\s*60_?000\b/u.test(source)) return 'aligned minute boundary';
	if (/\byear\b/u.test(source)) return 'calendar-year boundary in the effective zone/calendar';
	if (/\bmonth\b/u.test(source)) return 'calendar-month boundary in the effective zone/calendar';
	if (/Intl\.DateTimeFormat|\.toLocaleString/u.test(source))
		return 'formatter-derived calendar boundary';
	return 'explicit maximum accuracy';
}

function policyDetail(policy: (typeof policies)[number]): string {
	if (policy === 'auto') return 'Infer the earliest visible change';
	if (policy === 'disabled') return 'Freeze the last sample and withdraw scheduling';
	return `Update with ${policy} precision`;
}

function throwIfAborted(signal: AbortSignal): void {
	if (signal.aborted)
		throw signal.reason instanceof Error
			? signal.reason
			: new Error('Time language request aborted');
}
