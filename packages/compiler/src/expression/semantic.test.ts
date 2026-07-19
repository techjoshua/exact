import { describe, expect, it } from 'vitest';
import { expressionModuleFor, clearExpressionProjectCache } from './session.js';
import { buildExpressionSemanticGraph } from '../semantic.js';

describe('expression-backed semantic graph', () => {
	it('resolves lexical declarations, imports, references, and exports', () => {
		clearExpressionProjectCache();
		const filename = 'expression-semantic.tsx';
		const source = `
      import type { Model as Data } from "./model.js";
      import { helper as run } from "./helper.js";
      const value = 1;
      export function View(input: Data) {
        const value = run(input);
        return <section>{value}</section>;
      }
      export { value as answer };
    `;
		const expression = buildExpressionSemanticGraph(expressionModuleFor(filename, source));

		expect(expression.declarations).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: 'Data',
					kind: 'import',
					importedName: 'Model',
					moduleSpecifier: './model.js',
					typeOnly: true
				}),
				expect.objectContaining({
					name: 'run',
					kind: 'import',
					importedName: 'helper',
					moduleSpecifier: './helper.js'
				}),
				expect.objectContaining({ name: 'View', kind: 'function', exportedName: 'View' })
			])
		);
		expect(expression.references).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: 'run', source: 'import', moduleSpecifier: './helper.js' }),
				expect.objectContaining({ name: 'value', source: 'local' })
			])
		);
		expect(
			expression.references.some((reference) => reference.name === 'Data' && reference.typeOnly)
		).toBe(true);
		expect(expression.exports).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ exportedName: 'View', localName: 'View' }),
				expect.objectContaining({ exportedName: 'answer', localName: 'value' })
			])
		);
	});
});
