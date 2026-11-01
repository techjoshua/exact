/**
 * @vitest-environment jsdom
 */
import { expect, it, onTestFinished, vi } from 'vitest';
import { unmount } from './public.js';
import { createDomWorkBudget, reserveDomWork } from './work.js';
import { roots } from './state.js';
import {
	mountIntrinsicWork,
	mountScalarWork,
	mountStaticWork,
	mountOwnedWork,
	workOwner,
	workRef,
	workReleases,
	workScope
} from './test-support/roots/mount-work.fixtures.js';

for (const [name, mount, requiredWork] of [
	['intrinsic', mountIntrinsicWork, 4],
	['program', mountStaticWork, 3]
] as const) {
	it(`accounts for each newly mounted ${name} root and recovers after a limit failure`, () => {
		const container = document.createElement('div');
		document.body.append(container);
		onTestFinished(() => {
			unmount(container);
			container.remove();
		});
		const reports: unknown[] = [];
		const options = {
			maxTreeNodes: requiredWork - 1,
			onErrorReport: (report: { error: unknown }) => reports.push(report.error)
		};

		// The rejected child can follow already allocated parents. Nothing may reach the host.
		expect(() => mount(container, options)).toThrow('render values');
		expect(container.childNodes).toHaveLength(0);
		const failed = roots.get(container)!;
		expect(failed.workDepth).toBe(0);
		expect(failed.traversalDepth).toBe(0);
		expect(failed.mounted).toBeUndefined();
		expect(reports).toEqual([]);
		expect(unmount(container)).toBe(true);

		mount(container, { ...options, maxTreeNodes: requiredWork });
		if (name === 'intrinsic') {
			const template = container.querySelector('template')!;
			expect(template.childNodes).toHaveLength(0);
			const middle = template.content.querySelector('template')!;
			const inner = middle.content.querySelector('template')!;
			expect(inner.content.textContent).toBe('text');
		} else expect(container.textContent).toBe('text');
		const root = roots.get(container)!;
		const node = container.firstChild;
		const scope = root.mounted!.scope;
		mount(container, { ...options, maxTreeNodes: requiredWork });
		expect(container.firstChild).toBe(node);
		expect(root.mounted!.scope).toBe(scope);
		expect(root.workDepth).toBe(0);
		expect(root.traversalDepth).toBe(0);
		expect(reports).toEqual([]);
		expect(unmount(container)).toBe(true);
		expect(container.childNodes).toHaveLength(0);
		expect(scope?.active).toBe(false);
		expect(roots.has(container)).toBe(false);

		// A following independently owned root still makes progress at its own exact boundary.
		mountScalarWork(container, { ...options, maxTreeNodes: 2 });
		expect(container.textContent).toBe('text');
		expect(reports).toEqual([]);
	});
}

it('releases component scopes and refs after a deeper intrinsic limit failure', () => {
	workReleases.length = 0;
	const container = document.createElement('div');
	onTestFinished(() => {
		unmount(container);
	});
	const reports: unknown[] = [];
	const options = {
		maxTreeNodes: 3,
		onErrorReport: (report: { error: unknown }) => reports.push(report.error)
	};
	expect(() => mountOwnedWork(container, options)).toThrow('render values');
	expect(container.childNodes).toHaveLength(0);
	expect(workScope?.active).toBe(false);
	expect(workScope).toBeDefined();
	expect(workReleases).toEqual([]);
	expect(workOwner!.refs.get(workRef)).toBeUndefined();
	expect(roots.get(container)!.workDepth).toBe(0);
	expect(roots.get(container)!.traversalDepth).toBe(0);
	expect(reports).toEqual([]);
	unmount(container);
	mountOwnedWork(container, { ...options, maxTreeNodes: 5 });
	const owner = workOwner!;
	expect(owner.refs.get(workRef)).toBe(container.querySelector('template'));
	const scope = roots.get(container)!.mounted!.scope;
	expect(scope?.active).toBe(true);
	unmount(container);
	expect(scope?.active).toBe(false);
	expect(workReleases).toEqual(['released']);
	expect(owner.refs.get(workRef)).toBeUndefined();
	expect(reports).toEqual([]);
});

it('refuses a new native root before allocation when its shared budget is exhausted', () => {
	const container = document.createElement('div');
	onTestFinished(() => {
		unmount(container);
	});
	const allocate = vi.spyOn(document, 'createElement');
	onTestFinished(() => allocate.mockRestore());
	for (const mount of [mountIntrinsicWork, mountStaticWork]) {
		allocate.mockClear();
		const budget = createDomWorkBudget(1);
		reserveDomWork(budget, 1);
		const reports: unknown[] = [];
		expect(() =>
			mount(container, {
				workBudget: budget,
				onErrorReport: (report) => reports.push(report.error)
			})
		).toThrow('DOM traversal');
		expect(allocate).not.toHaveBeenCalled();
		expect(container.childNodes).toHaveLength(0);
		expect(roots.get(container)!.mounted).toBeUndefined();
		expect(roots.get(container)!.workDepth).toBe(0);
		expect(reports).toEqual([]);
		unmount(container);
	}
});

it('preserves depth refusal before charging an over-deep intrinsic child', () => {
	const container = document.createElement('div');
	onTestFinished(() => {
		unmount(container);
	});
	const reports: unknown[] = [];
	expect(() =>
		mountIntrinsicWork(container, {
			maxTreeDepth: 1,
			maxTreeNodes: 1,
			onErrorReport: (report) => reports.push(report.error)
		})
	).toThrow('maximum depth of 1');
	expect(container.childNodes).toHaveLength(0);
	expect(roots.get(container)!.workDepth).toBe(0);
	expect(roots.get(container)!.traversalDepth).toBe(0);
	expect(reports).toEqual([]);
});
