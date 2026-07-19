import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createExpressionProject } from './index.js';

const root = path.resolve(import.meta.dirname, '../../..');

describe('@exact/expressions runtime syntax coverage', () => {
	it('represents control flow, classes, async code, mutation, and JSX with specialized kinds', () => {
		const project = createExpressionProject({
			tsconfigPath: path.join(root, 'apps/kanban/tsconfig.json')
		});
		const filename = path.join(root, 'apps/kanban/src/__expressions_syntax.tsx');
		const source = `
      export class Counter {
        static total = 0;
        #value = 0;
        get value() { return this.#value; }
        set value(next: number) { this.#value = next; }
        async run(input?: number) {
          const values = [input ?? 0, ...[1, 2]];
          const { length: size } = values;
          label: for (let index = 0; index < size; index++) {
            if (index === 1) continue label;
            this.#value += values[index]!;
          }
          for (const value of values) this.#value += value;
          while (this.#value < 10) this.#value++;
          do { this.#value--; } while (this.#value > 10);
          switch (this.#value) { case 0: break; default: this.#value ||= 1; }
          try { await Promise.resolve(); } catch (error) { throw error; } finally { Counter.total++; }
          const format = (parts: TemplateStringsArray, value: number) => parts[0] + value;
          const text = format\`value=\${this.#value}\`;
          return <><span data-value={this.#value} {...{ title: text }}>{text}</span></>;
        }
      }
      export function* sequence() { yield 1; yield* [2, 3]; }
      export const result = new Counter().run?.(1);
    `;
		const module = project.updateModule(filename, source);
		const kinds = new Set(
			module
				.walk()
				.toArray()
				.map((ref) => ref.kind)
		);
		const required = [
			'ClassDeclaration',
			'PropertyDeclaration',
			'GetAccessor',
			'SetAccessor',
			'MethodDeclaration',
			'ForStatement',
			'ForOfStatement',
			'WhileStatement',
			'DoStatement',
			'SwitchStatement',
			'TryStatement',
			'CatchClause',
			'ThrowStatement',
			'AwaitExpression',
			'YieldExpression',
			'BinaryExpression',
			'PostfixUnaryExpression',
			'TaggedTemplateExpression',
			'NewExpression',
			'JsxFragment',
			'JsxElement',
			'JsxSpreadAttribute'
		];
		for (const kind of required) expect(kinds.has(kind), `missing ${kind}`).toBe(true);
		expect(
			module.diagnostics.filter(
				(diagnostic) => diagnostic.code.startsWith('TS1') && diagnostic.severity === 'error'
			)
		).toEqual([]);
	});
});
