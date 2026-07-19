import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { analyzeExpressionJsx } from './jsx.js';
import { clearExpressionProjectCache, expressionModuleFor } from './project.js';
import { buildExactProvenance } from '../provenance.js';

describe('expression-backed JSX plan', () => {
	it('indexes typed attributes, stable intrinsic ids, and reactive cells', () => {
		clearExpressionProjectCache();
		const module = expressionModuleFor(
			'ExpressionJsx.tsx',
			`function Card(this: Component<{ title: string }>) {
      return () => <article className="card"><Title value={this.state.title} />{this.state.title}</article>;
    }`
		);
		const plan = analyzeExpressionJsx(module, buildExactProvenance(module));
		const article = [...plan.elements.values()].find((element) => element.tagName === 'article')!;
		const title = [...plan.elements.values()].find((element) => element.tagName === 'Title')!;
		expect(article.attributes).toContain('className');
		expect(article.exactId).toMatch(/^x/);
		expect(title.exactId).toBeUndefined();
		expect(plan.cells.size).toBeGreaterThanOrEqual(2);
		expect([...plan.cells.values()].every((cell) => cell.reactive)).toBe(true);
	});

	it('indexes nonreactive JSX expressions without classifying them as reactive', () => {
		clearExpressionProjectCache();
		const module = expressionModuleFor(
			'StaticJsx.tsx',
			"const label = 'ready'; const view = <p title={label}>{1 + 2}</p>;"
		);
		const plan = analyzeExpressionJsx(module, buildExactProvenance(module));
		expect(plan.cells.size).toBe(2);
		expect([...plan.cells.values()].every((cell) => !cell.reactive)).toBe(true);
	});

	it('retains contextual JSX callback parameter types for emission', () => {
		clearExpressionProjectCache();
		const filename = path.resolve(
			import.meta.dirname,
			'../../../../apps/workbench/src/__contextual_event.tsx'
		);
		const module = expressionModuleFor(
			filename,
			`const view = <form onSubmit={event => event.preventDefault()} />;`
		);
		const plan = analyzeExpressionJsx(module, buildExactProvenance(module));
		expect([...plan.contextualParameters.values()]).toEqual(['Event']);
	});
});
