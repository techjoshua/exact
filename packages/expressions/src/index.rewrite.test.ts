import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	cloneWithVariables,
	expressions,
	lowerModuleText,
	rewriteModule,
	validateExpressionTree
} from './index.js';
import { createExpressionProject } from './test-support/project.js';

const root = path.resolve(import.meta.dirname, '../../..');
const kanbanConfig = path.join(root, 'apps/kanban/tsconfig.json');

describe('@exactjs/expressions: rewrite', () => {
	it('rewrites source losslessly outside the selected node', () => {
		const project = createExpressionProject({ tsconfigPath: kanbanConfig });
		const filename = path.join(root, 'apps/kanban/src/__expressions_rewrite.ts');
		const source = `// retained comment\nconst value = 1;\nexport { value };\n`;
		const module = project.updateModule(filename, source);
		const replacement = expressions.module('replacement.ts').literal(2);
		const rewritten = rewriteModule(module, (rewriter) => {
			rewriter.replaceWhere(
				(ref) => ref.node.text === '1',
				() => replacement
			);
		});

		expect(rewritten.emit().code).toBe(
			`// retained comment\nconst value = 2;\nexport { value };\n`
		);
		expect(rewritten.state).toBe('unbound');
	});

	it('preserves directives, comments, and newline style around structural edits', () => {
		const project = createExpressionProject({ tsconfigPath: kanbanConfig });
		const filename = path.join(root, 'apps/kanban/src/__expressions_trivia.ts');
		const source = `"use strict";\r\n// retained for the following region\r\nconst first = 1;\r\nconst second = 2;\r\n`;
		const module = project.updateModule(filename, source);
		const generated = expressions.module('generated.ts');
		generated.exportFunction('inserted', (fn) => fn.returns(generated.literal(3)));
		const declaration = generated.build().root.node.children[0]!;
		const rewritten = rewriteModule(module, (rewriter) => {
			const second = module.walk().first((ref) => ref.node.text === 'const second = 2;')!;
			rewriter.insertBefore(second, declaration);
		});

		expect(rewritten.emit().code).toBe(
			`"use strict";\r\n// retained for the following region\r\nconst first = 1;\r\nexport function inserted() {\r\n  return 3;\r\n}\r\nconst second = 2;\r\n`
		);
		expect(rewritten.trivia.directives).toEqual(['use strict']);
	});

	it('supports scope-safe generated text rewrites followed by checked rebinding', async () => {
		const project = createExpressionProject({ tsconfigPath: kanbanConfig });
		const filename = path.join(root, 'apps/kanban/src/__text_rewrite.ts');
		const module = project.updateModule(filename, 'export const value = 1 + 2;\n');
		const rewritten = rewriteModule(module, (rewriter) => {
			rewriter.replaceTextWhere(
				(ref) => ref.node.kind === 'BinaryExpression',
				(ref) => `(${ref.node.text}) * 3`
			);
		});
		expect(rewritten.validate().filter((diagnostic) => diagnostic.severity === 'error')).toEqual(
			[]
		);
		if (rewritten.state !== 'unbound') throw new Error('A text rewrite must require rebinding');
		const rebound = await project.bind(rewritten);
		expect(rebound.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
		expect(rebound.emit().code).toContain('(1 + 2) * 3');
	});

	it('composes nested text lowerings against one stable source tree', () => {
		const project = createExpressionProject({ tsconfigPath: kanbanConfig });
		const filename = path.join(root, 'apps/kanban/src/__composed_lowering.ts');
		const module = project.updateModule(filename, '// keep\nexport const value = 1 + 2;\n');
		const output = lowerModuleText(module, ({ reference, text }) => {
			if (reference.node.kind === 'NumericLiteral') return String(Number(text) * 10);
			if (reference.node.kind === 'BinaryExpression') return `(${text})`;
			return undefined;
		});
		expect(output).toBe('// keep\nexport const value = (10 + 20);\n');
	});

	it('rejects overlapping structural edits instead of silently dropping one', () => {
		const project = createExpressionProject({ tsconfigPath: kanbanConfig });
		const filename = path.join(root, 'apps/kanban/src/__overlap_rewrite.ts');
		const module = project.updateModule(filename, 'const value = 1 + 2;');
		expect(() =>
			rewriteModule(module, (rewriter) => {
				rewriter.replaceTextWhere(
					(reference) => reference.node.kind === 'BinaryExpression',
					() => '3'
				);
				rewriter.replaceTextWhere(
					(reference) => reference.node.text === '1',
					() => '4'
				);
			})
		).toThrow(/Overlapping expression rewrites/);
	});

	it('requires rebinding between independent span-based rewrite passes', () => {
		const project = createExpressionProject({ tsconfigPath: kanbanConfig });
		const filename = path.join(root, 'apps/kanban/src/__sequential_rewrite.ts');
		const module = project.updateModule(filename, 'const value = 1;');
		const first = rewriteModule(module, (rewriter) =>
			rewriter.replaceTextWhere(
				(reference) => reference.node.text === '1',
				() => '2'
			)
		);
		expect(() =>
			rewriteModule(first, (rewriter) =>
				rewriter.replaceTextWhere(
					(reference) => reference.node.text === 'value',
					() => 'other'
				)
			)
		).toThrow(/Rebind an unbound rewritten module/);
	});

	it('requires complete clone remapping and allocates unique clone identities', () => {
		const project = createExpressionProject({ tsconfigPath: kanbanConfig });
		const filename = path.join(root, 'apps/kanban/src/__clone_variables.ts');
		const module = project.updateModule(filename, 'const value = 1; void value;');
		const reference = module
			.walk()
			.references()
			.where((candidate) => candidate.name === 'value')
			.toArray()
			.at(-1)!;
		expect(() => cloneWithVariables(reference.node, new Map())).toThrow(
			/explicit mapping for value/
		);
		const variables = new Map([[reference.variable!, reference.variable!]]);
		expect(cloneWithVariables(reference.node, variables).id).not.toBe(
			cloneWithVariables(reference.node, variables).id
		);
	});

	it('resets loop legality when validating a nested function', () => {
		const project = createExpressionProject({ tsconfigPath: kanbanConfig });
		const filename = path.join(root, 'apps/kanban/src/__nested_control_validation.ts');
		const module = project.updateModule(
			filename,
			'while (true) { function nested() { break; continue; } }'
		);
		expect(
			validateExpressionTree(module.rootNode, filename).map((diagnostic) => diagnostic.code)
		).toEqual(expect.arrayContaining(['EXPR_BREAK_OUTSIDE_CONTROL', 'EXPR_CONTINUE_OUTSIDE_LOOP']));
	});

	it('maps parsed, generated, and rebound lines back to immutable original source', async () => {
		const project = createExpressionProject({ tsconfigPath: kanbanConfig });
		const filename = path.join(root, 'apps/kanban/src/__source_map.ts');
		const source = 'const first = 1;\nconst second = 2;';
		const module = project.updateModule(filename, source);
		expect(module.emit({ sourceMap: true }).map?.mappings).toBe('AAAA;AACA');
		const second = module.root.children().toArray()[1]!;
		const rewritten = rewriteModule(module, (rewriter) =>
			rewriter.insertTextBefore(second, '// generated')
		);
		const emitted = rewritten.emit({ sourceMap: true });
		expect(emitted.code).toBe('const first = 1;\n// generated\nconst second = 2;');
		expect(emitted.map?.sourcesContent).toEqual([source]);
		expect(emitted.map?.mappings).toBe('AAAA;AACA;AAAA');
		if (rewritten.state !== 'unbound') throw new Error('An insertion must require rebinding');
		const rebound = await project.bind(rewritten);
		expect(rebound.emit({ sourceMap: true }).map).toEqual(emitted.map);
	});
});
