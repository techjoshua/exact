import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createCompilerSession, transformSource } from './index.js';

describe('compiler HMR session retention', () => {
	it('plateaus retained module state across repeated edits and releases removed overlays', () => {
		const session = createCompilerSession({ compiler: 'legacy' });
		const root = path.resolve(import.meta.dirname, '../../..');
		const filename = path.join(root, 'apps/kanban/src/__hmr_memory_panel.tsx');
		const compile = (revision: number) =>
			transformSource(
				`
      export function MemoryPanel(this: Component<{ count: number }>) {
        const offset = ${revision % 3};
        return () => <button onClick={() => this.state.count++}>{this.state.count + offset}</button>;
      }
    `,
				{ filename, session }
			);

		compile(0);
		const baseline = session.stats();
		for (let revision = 1; revision <= 24; revision++) {
			session.invalidate(filename);
			compile(revision);
		}
		const retained = session.stats();

		expect(retained.workspaces).toBe(1);
		expect(retained.modules).toBe(baseline.modules);
		expect(retained.overlays).toBe(baseline.overlays);
		expect(retained.nodeIdentityRoots).toBe(baseline.nodeIdentityRoots);
		expect(retained.symbolIdentities).toBeLessThanOrEqual(baseline.symbolIdentities + 20);

		session.invalidate(filename, true);
		const removed = session.stats();
		expect(removed.modules).toBe(0);
		expect(removed.overlays).toBe(0);
		expect(removed.nodeIdentityRoots).toBe(0);
		session.dispose();
	}, 60_000);

	it('isolates owned sessions and rejects work after disposal', () => {
		const first = createCompilerSession({ compiler: 'legacy' });
		const second = createCompilerSession({ compiler: 'legacy' });
		const options = {
			filename: 'src/session.ts',
			root: path.resolve(import.meta.dirname, '../../..')
		};
		first.expressionModuleFor(options.filename, 'export const value = 1;', options);
		const retained = second.expressionModuleFor(
			options.filename,
			'export const value = 2;',
			options
		);

		first.dispose();
		expect(() =>
			first.expressionModuleFor(options.filename, 'export const value = 3;', options)
		).toThrow('disposed');
		expect(second.expressionModuleFor(options.filename, 'export const value = 2;', options)).toBe(
			retained
		);
		second.dispose();
	});

	it('rebuilds only the workspace affected by an HMR change', () => {
		const session = createCompilerSession({ compiler: 'legacy' });
		const root = path.resolve(import.meta.dirname, '../../..');
		const kanban = path.join(root, 'apps/kanban/src/__scoped_hmr.ts');
		const shipping = path.join(root, 'apps/shipping-calculator/src/__scoped_hmr.ts');
		session.expressionModuleFor(kanban, 'export const kanbanValue = 1;');
		session.expressionModuleFor(shipping, 'export const shippingValue = 1;');
		const before = session.stats();

		session.invalidate(kanban);
		const after = session.stats();
		expect(before.workspaces).toBe(2);
		expect(after.rebuilds - before.rebuilds).toBe(0);
		session.expressionModuleFor(kanban, 'export const kanbanValue = 1;');
		expect(session.stats().rebuilds - before.rebuilds).toBe(1);
		session.dispose();
	});

	it("removes a deleted file's stable identities as well as its overlay", () => {
		const session = createCompilerSession({ compiler: 'legacy' });
		const root = path.resolve(import.meta.dirname, '../../..');
		const filename = path.join(root, 'apps/kanban/src/__removed_identity.ts');
		session.expressionModuleFor(
			filename,
			'export const removedIdentity = 1; void removedIdentity;'
		);
		expect(session.stats().symbolIdentities).toBeGreaterThan(0);

		session.invalidate(filename, true);
		expect(session.stats()).toMatchObject({
			modules: 0,
			overlays: 0,
			nodeIdentityRoots: 0,
			symbolIdentities: 0
		});
		session.dispose();
	});

	it('keeps semantic generated validation available outside the transform hot path', () => {
		const session = createCompilerSession({ compiler: 'legacy' });
		const root = path.resolve(import.meta.dirname, '../../..');
		const syntaxFile = path.join(root, 'apps/kanban/src/__syntax_validation.tsx');
		const semanticFile = path.join(root, 'apps/kanban/src/__semantic_validation.tsx');
		const source = 'export const view = <span>ready</span>;';

		transformSource(source, { filename: syntaxFile, session });
		const afterSyntax = session.stats();
		transformSource(source, { filename: semanticFile, session, generatedValidation: 'semantic' });
		const afterSemantic = session.stats();

		expect(afterSyntax.semanticDiagnostics).toBe(0);
		expect(afterSemantic.semanticDiagnostics).toBeGreaterThanOrEqual(2);
		session.dispose();
	}, 15_000);
});
