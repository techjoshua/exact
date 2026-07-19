import ts from 'typescript';
import type { ExpressionDirective } from '../model.js';
import type { ProjectionCounters } from './contracts.js';

/** Caches declaration and inline directives for one immutable source projection. */
export class ExpressionDirectiveIndex {
	private readonly declarations = new Map<ts.Node, readonly ExpressionDirective[]>();
	private readonly inlineDeclarations = new Map<ts.Node, readonly ExpressionDirective[]>();

	constructor(
		private readonly detailedProfile: boolean,
		private readonly counters: ProjectionCounters
	) {}

	/** Performs the for domain operation for this expression directive index instance. */
	for(node: ts.Node | undefined, inline = false): readonly ExpressionDirective[] {
		if (!node) return Object.freeze([]);
		const cache = inline ? this.inlineDeclarations : this.declarations;
		const cached = cache.get(node);
		if (cached) return cached;
		const directiveSource = node.getSourceFile();
		const fullStart = node.getFullStart();
		const start = node.getStart(directiveSource, false);
		const segments =
			start > fullStart
				? [{ text: directiveSource.text.slice(fullStart, start), start: fullStart }]
				: [];
		if (inline && ts.isVariableDeclaration(node)) {
			const inlineStart = node.name.end;
			const end = node.type?.getFullStart() ?? node.initializer?.getFullStart() ?? node.end;
			if (end > inlineStart)
				segments.push({
					text: directiveSource.text.slice(inlineStart, end),
					start: inlineStart
				});
		}
		if (this.detailedProfile) {
			this.counters.directiveScans += segments.length;
			this.counters.directiveCharacters += segments.reduce(
				(count, segment) => count + segment.text.length,
				0
			);
		}
		const directives = Object.freeze(
			uniqueDirectives(
				segments.flatMap((segment) =>
					segment.text.includes('@exact')
						? parseExpressionDirectives(segment.text, segment.start, directiveSource)
						: []
				)
			)
		);
		cache.set(node, directives);
		return directives;
	}

	/** Performs the for binding domain operation for this expression directive index instance. */
	forBinding(node: ts.Node | undefined): readonly ExpressionDirective[] {
		if (!node) return Object.freeze([]);
		const values = [...this.for(node, ts.isVariableDeclaration(node))];
		if (
			ts.isVariableDeclaration(node) &&
			ts.isVariableDeclarationList(node.parent) &&
			ts.isVariableStatement(node.parent.parent)
		)
			values.unshift(...this.for(node.parent.parent));
		return Object.freeze(uniqueDirectives(values));
	}

	/** Performs the for type domain operation for this expression directive index instance. */
	forType(type: ts.Type): readonly ExpressionDirective[] {
		const symbol = type.aliasSymbol ?? type.getSymbol();
		return Object.freeze(
			uniqueDirectives((symbol?.declarations ?? []).flatMap((declaration) => this.for(declaration)))
		);
	}
}

/** Reads an expression directives from its source representation. */
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

/** Performs the unique directives domain operation. */
export function uniqueDirectives(values: readonly ExpressionDirective[]): ExpressionDirective[] {
	return [
		...new Map(
			values.map((value) => [`${value.span?.start ?? -1}:${value.key}:${value.value ?? ''}`, value])
		).values()
	];
}

/** Performs the fingerprint domain operation. */
export function fingerprint(value: string): string {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index++) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36);
}
