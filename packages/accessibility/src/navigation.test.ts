/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { CompositeNavigationSession } from './navigation.js';
import { testRootBinding } from './test-support/ref-binding.js';

describe('@exactjs/accessibility composite navigation', () => {
	it('moves roving focus in logical listbox order and restores authored tab indexes', () => {
		const listbox = composite('listbox', ['option', 'option', 'option']);
		document.body.append(listbox);
		const items = Array.from(listbox.children) as HTMLElement[];
		const session = new CompositeNavigationSession(testRootBinding(listbox), { navigate: true });
		session.reconcile();
		expect(items.map((item) => item.tabIndex)).toEqual([0, -1, -1]);

		items[0]!.focus();
		items[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
		expect(document.activeElement).toBe(items[1]);

		const added = item('option');
		listbox.append(added);
		items[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
		expect(document.activeElement).toBe(added);

		session.dispose();
		expect(Array.from(listbox.children, (child) => child.hasAttribute('tabindex'))).toEqual([
			false,
			false,
			false,
			false
		]);
		listbox.remove();
	});

	it('keeps focus on an active-descendant container and assigns permanent item identity', () => {
		const listbox = composite('listbox', ['option', 'option']);
		document.body.append(listbox);
		const items = Array.from(listbox.children) as HTMLElement[];
		const session = new CompositeNavigationSession(testRootBinding(listbox), {
			navigate: { mode: 'activeDescendant' }
		});
		session.reconcile();
		expect(listbox.getAttribute('aria-activedescendant')).toBe(items[0]!.id);

		listbox.focus();
		listbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
		expect(document.activeElement).toBe(listbox);
		expect(listbox.getAttribute('aria-activedescendant')).toBe(items[1]!.id);
		const generated = items[1]!.id;

		session.dispose();
		expect(items[1]!.id).toBe(generated);
		listbox.remove();
	});

	it('retains a container tab stop while empty and preserves later external writes', () => {
		const listbox = composite('listbox', []);
		listbox.setAttribute('tabindex', '-1');
		document.body.append(listbox);
		const session = new CompositeNavigationSession(testRootBinding(listbox), { navigate: true });
		session.reconcile();
		expect(listbox.tabIndex).toBe(0);
		listbox.setAttribute('tabindex', '2');
		session.dispose();
		expect(listbox.getAttribute('tabindex')).toBe('2');
		listbox.remove();
	});

	it('switches ownership between active-descendant and roving modes', () => {
		const listbox = composite('listbox', ['option', 'option']);
		document.body.append(listbox);
		const props: { navigate: true | { mode: 'activeDescendant' | 'roving' } } = {
			navigate: { mode: 'activeDescendant' }
		};
		const session = new CompositeNavigationSession(testRootBinding(listbox), props);
		session.reconcile();
		expect(listbox.hasAttribute('aria-activedescendant')).toBe(true);

		props.navigate = { mode: 'roving' };
		session.reconcile();
		expect(listbox.hasAttribute('aria-activedescendant')).toBe(false);
		expect(Array.from(listbox.children, (child) => (child as HTMLElement).tabIndex)).toEqual([
			0, -1
		]);
		session.dispose();
		listbox.remove();
	});

	it('uses rendered direction only for spatial grid columns', () => {
		const grid = document.createElement('div');
		grid.setAttribute('role', 'grid');
		grid.style.direction = 'rtl';
		const row = document.createElement('div');
		row.setAttribute('role', 'row');
		row.append(item('gridcell'), item('gridcell'));
		grid.append(row);
		document.body.append(grid);
		const cells = Array.from(row.children) as HTMLElement[];
		const session = new CompositeNavigationSession(testRootBinding(grid), { navigate: true });
		session.reconcile();

		cells[0]!.focus();
		cells[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
		expect(document.activeElement).toBe(cells[1]);
		session.dispose();
		grid.remove();
	});

	it('skips disabled items and selects the nearest survivor after removal', () => {
		const listbox = composite('listbox', ['option', 'option', 'option']);
		document.body.append(listbox);
		const items = Array.from(listbox.children) as HTMLElement[];
		items[1]!.setAttribute('aria-disabled', 'true');
		const session = new CompositeNavigationSession(testRootBinding(listbox), { navigate: true });
		session.reconcile();
		items[0]!.focus();
		items[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
		expect(document.activeElement).toBe(items[2]);

		items[2]!.remove();
		session.reconcile();
		expect(items[0]!.tabIndex).toBe(0);
		session.dispose();
		listbox.remove();
	});

	it('lets an arrow-owning toolbar input handle its own cursor keys', () => {
		const toolbar = composite('toolbar', []);
		const input = document.createElement('input');
		const button = document.createElement('button');
		toolbar.append(input, button);
		document.body.append(toolbar);
		const session = new CompositeNavigationSession(testRootBinding(toolbar), { navigate: true });
		session.reconcile();
		input.focus();
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		expect(document.activeElement).toBe(input);
		session.dispose();
		toolbar.remove();
	});

	it('disconnects bounded observation and restores owned values on disposal', async () => {
		const listbox = composite('listbox', ['option']);
		const first = listbox.firstElementChild as HTMLElement;
		const session = new CompositeNavigationSession(testRootBinding(listbox), { navigate: true });
		session.reconcile();
		expect(first.tabIndex).toBe(0);
		session.dispose();
		const added = item('option');
		listbox.append(added);
		await Promise.resolve();
		expect(first.hasAttribute('tabindex')).toBe(false);
		expect(added.hasAttribute('tabindex')).toBe(false);
	});

	it('rejects roles whose complete keyboard policy is not shipped', () => {
		const tree = composite('tree', ['treeitem']);
		const session = new CompositeNavigationSession(testRootBinding(tree), { navigate: true });
		expect(() => session.reconcile()).toThrow(/supported role/);
	});
});

function composite(role: string, roles: readonly string[]): HTMLElement {
	const element = document.createElement('div');
	element.setAttribute('role', role);
	element.append(...roles.map(item));
	return element;
}

function item(role: string): HTMLElement {
	const element = document.createElement('div');
	element.setAttribute('role', role);
	return element;
}
