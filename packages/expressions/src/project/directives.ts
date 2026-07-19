import type ts from 'typescript';
import type { ExpressionDirective } from '../model.js';

export function parseExpressionDirectives(
	text: string,
	offset: number,
	sourceFile: ts.SourceFile
): ExpressionDirective[] {
	const directives: ExpressionDirective[] = [];
	const marker = /@([A-Za-z_$][\w$-]*)\b([^\r\n*]*)/g;
	for (let match = marker.exec(text); match; match = marker.exec(text)) {
		const namespace = match[1]!;
		if (namespace !== 'exact') continue;
		const body = match[2] ?? '';
		const token =
			/([A-Za-z_$][\w$-]*(?:\.[A-Za-z_$][\w$-]*)?)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([A-Za-z_$][\w$]*)))?/g;
		for (let item = token.exec(body); item; item = token.exec(body)) {
			const start = offset + match.index + match[0].indexOf(body) + item.index;
			const line = sourceFile.getLineAndCharacterOfPosition(Math.max(0, start));
			directives.push(
				Object.freeze({
					namespace,
					key: item[1]!,
					...((item[2] ?? item[3] ?? item[4]) ? { value: item[2] ?? item[3] ?? item[4] } : {}),
					span: Object.freeze({
						start,
						end: start + item[0].length,
						line: line.line + 1,
						column: line.character + 1
					})
				})
			);
		}
	}
	return directives;
}

export function uniqueDirectives(values: readonly ExpressionDirective[]): ExpressionDirective[] {
	return [
		...new Map(
			values.map((value) => [`${value.span?.start ?? -1}:${value.key}:${value.value ?? ''}`, value])
		).values()
	];
}

export function fingerprint(value: string): string {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index++) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36);
}
