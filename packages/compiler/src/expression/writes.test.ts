import path from 'node:path';
import { createExpressionProject } from '@exact/expressions';
import { describe, expect, it } from 'vitest';
import { analyzeExpressionWrites, lowerExpressionWrites } from './writes.js';

const root = path.resolve(import.meta.dirname, '../../../..');

describe('expression-backed writes', () => {
	it('lowers assignments, updates, deletes, and array mutations without disturbing directives', () => {
		const project = createExpressionProject({
			tsconfigPath: path.join(root, 'apps/kanban/tsconfig.json')
		});
		const module = project.updateModule(
			path.join(root, 'apps/kanban/src/__expression_writes.tsx'),
			`"use client";
      export function Counter(this: Component<{ count: number; items: number[]; stale?: boolean }>) {
        this.state.count = next();
        this.state.count += amount;
        this.state.count++;
        delete this.state.stale;
        this.state.items.push(value);
      }
    `
		);
		const result = lowerExpressionWrites(module);
		const source = result.module.emit().code;
		expect(result.count).toBe(5);
		expect(source.indexOf(`"use client"`)).toBeLessThan(source.indexOf('@exact/reactive'));
		expect(source).toContain(`__exactWrite(this.state, ["count"], () => (next()))`);
		expect(source).toContain(
			`__exactUpdate(this.state, ["count"], previous => previous + (amount))`
		);
		expect(source).toContain(
			`__exactUpdateResult(this.state, ["count"], previous => { const result = previous++; return [previous, result]; })`
		);
		expect(source).toContain(`__exactDelete(this.state, ["stale"])`);
		expect(source).toContain(`__exactArrayMutation(this.state, ["items"], "push", () => [value])`);
	});

	it('leaves dynamic state paths on the compatibility transform path', () => {
		const project = createExpressionProject({
			tsconfigPath: path.join(root, 'apps/kanban/tsconfig.json')
		});
		const module = project.updateModule(
			path.join(root, 'apps/kanban/src/__expression_dynamic_write.tsx'),
			`
      export function Counter(this: Component<Record<string, number>>, key: string) {
        this.state[key] = 1;
      }
    `
		);
		const result = lowerExpressionWrites(module);
		expect(result.changed).toBe(false);
		expect(result.module).toBe(module);
	});

	it('uses canonical bindings to lower direct and destructured state aliases', () => {
		const project = createExpressionProject({
			tsconfigPath: path.join(root, 'apps/kanban/tsconfig.json')
		});
		const module = project.updateModule(
			path.join(root, 'apps/kanban/src/__expression_alias_write.tsx'),
			`
      export function Counter(this: Component<{ project: { count: number }; items: number[] }>) {
        const state = this.state;
        const { project: current, items } = state;
        current.count = 2;
        items.splice(0, 1);
      }
    `
		);
		const result = lowerExpressionWrites(module);
		const plan = analyzeExpressionWrites(module);
		expect(result.count).toBe(2);
		expect([...plan.aliases.values()]).toEqual(expect.arrayContaining([['project'], ['items']]));
		expect(result.module.emit().code).toContain(
			`__exactWrite(this.state, ["project","count"], () => (2))`
		);
		expect(result.module.emit().code).toContain(
			`__exactArrayMutation(this.state, ["items"], "splice", () => [0, 1])`
		);
	});

	it("does not retain mutable aliases after reassignment or confuse a nested function's this", () => {
		const project = createExpressionProject({
			tsconfigPath: path.join(root, 'apps/kanban/tsconfig.json')
		});
		const module = project.updateModule(
			path.join(root, 'apps/kanban/src/__expression_alias_flow.tsx'),
			`
      export function Counter(this: Component<{ a: { count: number }; b: { count: number } }>) {
        let item = this.state.a;
        item.count = 0;
        item = this.state.b;
        item.count = 1;
        function nested(this: { state: { count: number } }) { this.state.count = 2; }
      }
    `
		);
		expect([...analyzeExpressionWrites(module).sites.values()].map((site) => site.path)).toEqual([
			['a', 'count']
		]);
	});

	it('decodes statically escaped element-access keys', () => {
		const project = createExpressionProject({
			tsconfigPath: path.join(root, 'apps/kanban/tsconfig.json')
		});
		const module = project.updateModule(
			path.join(root, 'apps/kanban/src/__expression_escaped_key.tsx'),
			`
      export function Counter(this: Component<Record<string, number>>) { this.state["line\\nkey"] = 1; }
    `
		);
		expect([...analyzeExpressionWrites(module).sites.values()][0]?.path).toEqual(['line\nkey']);
	});

	it('composes nested state writes in one expression lowering pass', () => {
		const project = createExpressionProject({
			tsconfigPath: path.join(root, 'apps/kanban/tsconfig.json')
		});
		const module = project.updateModule(
			path.join(root, 'apps/kanban/src/__expression_nested_write.tsx'),
			`
      export function Counter(this: Component<{ a: number; b: number }>) {
        return this.state.a = (this.state.b = 1);
      }
    `
		);
		const result = lowerExpressionWrites(module);
		expect(result.count).toBe(2);
		expect(result.module.emit().code).toContain(
			`__exactWrite(this.state, ["a"], () => ((__exactWrite(this.state, ["b"], () => (1)))))`
		);
	});
});
