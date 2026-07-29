import { afterEach, describe, expect, it } from 'vitest';
import { clearExpressionProjectCache, transformSource } from '../index.js';

afterEach(() => clearExpressionProjectCache());

describe('compiler inspection catalog boundary', () => {
	it('returns a server-owned catalog without embedding rich descriptions in output', () => {
		const source = `export function Page(this: Component<{ count: number }>) {
	return () => <button>{this.state.count}</button>;
}`;
		const result = transformSource(source, {
			filename: 'Page.tsx',
			emitInspection: true
		});
		expect(result.inspectionCatalog?.components[0]).toMatchObject({
			name: 'Page',
			kind: 'component'
		});
		expect(result.code).not.toContain('once-per-instance');
		expect(result.code).not.toContain('reactive-dependency');
	});

	it('omits the catalog for hardened and production-auto builds', () => {
		const previous = process.env.NODE_ENV;
		process.env.NODE_ENV = 'production';
		try {
			const disabled = transformSource('export const value = 1;', {
				filename: 'disabled.ts',
				emitInspection: false
			});
			const automatic = transformSource('export const value = 1;', {
				filename: 'automatic.ts',
				emitInspection: 'auto',
				instrumentInspection: 'auto'
			});
			expect(disabled.inspectionCatalog).toBeUndefined();
			expect(automatic.inspectionCatalog).toBeUndefined();
			expect(automatic.inspectionCorrelation).toBeUndefined();
			expect(automatic.code).not.toContain('@exactjs/devtools-runtime');
		} finally {
			if (previous === undefined) delete process.env.NODE_ENV;
			else process.env.NODE_ENV = previous;
		}
	});

	it('lowers compact canonical IDs without rich source descriptions', () => {
		const source = `export function Page(this: Component<{ count: number }>) {
	return () => <button>{this.state.count}</button>;
}`;
		const result = transformSource(source, {
			filename: 'Page.tsx',
			instrumentInspection: true
		});
		expect(result.inspectionCorrelation?.components[0]?.componentTypeId).toBeTruthy();
		expect(result.code).toContain('@exactjs/devtools-runtime');
		expect(result.code).not.toContain('reactive-dependency');
		expect(result.code).not.toContain('Page.tsx');
	});
});
