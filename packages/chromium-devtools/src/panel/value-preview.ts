import type { ExactValuePreview } from '@exactjs/devtools-protocol';

const compactPreviewLimit = 120;

/** Renders a safe preview, keeping nested objects collapsed behind compact own-property text. */
export function renderExactValuePreview(
	preview: ExactValuePreview,
	path: readonly string[],
	expandObject = false
): HTMLElement {
	if (preview.kind !== 'object') return scalarPreview(preview);
	if (expandObject) return objectEntries(preview, path);
	const summaryText = compactPreview(preview);
	if (!preview.entries.length) return previewText(summaryText, 'preview-complex-summary');
	const disclosure = document.createElement('details');
	disclosure.className = 'preview-complex';
	disclosure.setAttribute('data-panel-disclosure-key', `value:${JSON.stringify(path)}`);
	const summary = document.createElement('summary');
	summary.append(previewText(summaryText, 'preview-complex-summary'));
	disclosure.append(summary, objectEntries(preview, path));
	return disclosure;
}

function objectEntries(
	preview: Extract<ExactValuePreview, { kind: 'object' }>,
	path: readonly string[]
) {
	const list = element('dl', 'preview-object');
	for (const entry of preview.entries) {
		const key = document.createElement('dt');
		key.textContent = entry.key;
		const value = document.createElement('dd');
		value.append(renderExactValuePreview(entry.value, [...path, entry.key]));
		list.append(key, value);
	}
	if (preview.truncated) list.append(labeledPreview('', '… preview truncated'));
	return list;
}

function compactPreview(preview: Extract<ExactValuePreview, { kind: 'object' }>): string {
	const output: string[] = [];
	appendCompact(preview, output, { remaining: compactPreviewLimit });
	return output.join('');
}

function appendCompact(
	preview: ExactValuePreview,
	output: string[],
	budget: { remaining: number }
): void {
	if (budget.remaining <= 0) return;
	if (preview.kind !== 'object') {
		appendBounded(output, scalarText(preview), budget);
		return;
	}
	const arrayLike = preview.type === 'Array' || preview.type === 'Set';
	const prefix = preview.type === 'Object' || arrayLike ? '' : `${preview.type} `;
	appendBounded(output, `${prefix}${arrayLike ? '[' : '{'}`, budget);
	for (let index = 0; index < preview.entries.length && budget.remaining > 1; index++) {
		if (index) appendBounded(output, ', ', budget);
		const entry = preview.entries[index]!;
		if (!arrayLike) appendBounded(output, `${JSON.stringify(entry.key)}: `, budget);
		appendCompact(entry.value, output, budget);
	}
	if (preview.truncated && budget.remaining > 1)
		appendBounded(output, `${preview.entries.length ? ', ' : ''}…`, budget);
	appendBounded(output, arrayLike ? ']' : '}', budget);
}

function appendBounded(output: string[], text: string, budget: { remaining: number }): void {
	if (text.length <= budget.remaining) {
		output.push(text);
		budget.remaining -= text.length;
		return;
	}
	if (budget.remaining > 1) output.push(`${text.slice(0, budget.remaining - 1)}…`);
	budget.remaining = 0;
}

function scalarPreview(preview: Exclude<ExactValuePreview, { kind: 'object' }>): HTMLElement {
	return previewText(scalarText(preview), `preview-value preview-${preview.kind}`);
}

function scalarText(preview: Exclude<ExactValuePreview, { kind: 'object' }>): string {
	return preview.kind === 'scalar'
		? typeof preview.value === 'string'
			? JSON.stringify(preview.value)
			: String(preview.value)
		: preview.kind === 'function'
			? `ƒ ${preview.name ?? 'anonymous'}`
			: preview.kind === 'dom'
				? `<${preview.tag}${preview.id ? `#${preview.id}` : ''}>`
				: preview.kind === 'redacted'
					? `redacted (${preview.reason})`
					: `unavailable (${preview.reason})`;
}

function labeledPreview(label: string, value: string): HTMLElement {
	const row = element('div', 'labeled-value');
	row.append(previewText(label), previewText(value, 'preview-unavailable'));
	return row;
}

function previewText(text: string, className?: string): HTMLElement {
	const value = element('span', className);
	value.textContent = text;
	return value;
}

function element<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	className?: string
): HTMLElementTagNameMap[K] {
	const value = document.createElement(tag);
	if (className) value.className = className;
	return value;
}
