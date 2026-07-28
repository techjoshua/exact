import { createIdentifier } from '@typescript/native/unstable/ast/factory';
import {
	isIdentifier,
	type SourceFile,
	visitEachChild,
	type Visitor
} from '@typescript/native/unstable/ast';
import { describe, expect, it } from 'vitest';
import { printNativeSource } from './native-printing.js';

describe('native transformation printing', () => {
	it('prints parsed TypeScript through the TypeScript 7 native visitor pipeline', () => {
		const output = printNativeSource(
			'import { value } from "./value.js";\nexport const doubled: number = value * 2;\n'
		);

		expect(output).toContain('import { value } from "./value.js";');
		expect(output).toContain('export const doubled: number = value * 2;');
	});

	it('refreshes an open virtual source between consecutive transformations', () => {
		expect(printNativeSource('export const first = 1;\n')).toContain('first = 1');
		expect(printNativeSource('export const second = 2;\n')).toContain('second = 2');
		expect(printNativeSource('export const second = 2;\n')).not.toContain('first = 1');
	});

	it('prints nodes replaced by a TypeScript 7 native factory', () => {
		const rename: Visitor = (node) =>
			isIdentifier(node) && node.text === 'before'
				? createIdentifier('after')
				: visitEachChild(node, rename);
		const output = printNativeSource(
			'export const before = 1;\n',
			(sourceFile): SourceFile => visitEachChild(sourceFile, rename)
		);

		expect(output).toContain('export const after = 1;');
		expect(output).not.toContain('before');
	});
});
