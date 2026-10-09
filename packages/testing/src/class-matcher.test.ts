/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { exactMatchers } from './matchers/exact.js';
import { TestElement, type TestElementView } from './queries/host.js';

describe('class assertions', () => {
	it('requires all requested tokens and permits additional classes', () => {
		const element = document.createElement('button');
		element.className = 'selected primary extra';
		expect(exactMatchers.toHaveClass(element, 'selected', ' primary  extra ').pass).toBe(true);
		expect(exactMatchers.toHaveClass(element, 'selected', 'absent').pass).toBe(false);
		element.classList.remove('selected');
		expect(exactMatchers.toHaveClass(element, 'selected').pass).toBe(false);
	});

	it('accepts queried controls and follows their retained DOM state', () => {
		const container = document.createElement('div');
		container.innerHTML =
			'<label>Appearance<select class="selected"><option>System</option><option>Dark</option></select></label>';
		document.body.append(container);
		const view: TestElementView = {
			container,
			snapshot: () => undefined,
			action: async (work) => {
				work();
			},
			componentFor: () => {
				throw new Error('No component owner in this query fixture');
			}
		};
		try {
			const root = new TestElement(view, container);
			const control = root.getByLabelText('Appearance');
			expect(root.getAllByRole('option').map((option) => option.text())).toEqual([
				'System',
				'Dark'
			]);
			expect(exactMatchers.toHaveClass(control, 'selected').pass).toBe(true);
			control.element.className = 'changed';
			expect(root.getByLabelText('Appearance').element).toBe(control.element);
			expect(exactMatchers.toHaveClass(control, 'selected').pass).toBe(false);
			expect(exactMatchers.toHaveClass(control, 'changed').pass).toBe(true);
		} finally {
			container.remove();
		}
	});

	it('rejects missing elements and empty expectations', () => {
		const element = document.createElement('button');
		expect(exactMatchers.toHaveClass(undefined, 'primary').pass).toBe(false);
		expect(exactMatchers.toHaveClass(element).pass).toBe(false);
		expect(exactMatchers.toHaveClass(element, '   ').pass).toBe(false);
	});
});
