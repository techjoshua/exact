// @vitest-environment jsdom
import '@exactjs/dom/framework/enhancements';
import { type AnyComponentFunction, createVNode } from '@exactjs/core';
import { render } from '@exactjs/dom';
import { flushSync } from '@exactjs/reactive';
import {
	action,
	field,
	scope,
	selection,
	separator,
	status,
	surface,
	text
} from '@exactjs/theme/enhancements';
import { describe, expect, it } from 'vitest';
import { ThemeSpecimen } from './specimen.js';

describe('independent theme component-library fixture', () => {
	it('renders every semantic role and a derived accessible chart without fixture CSS', () => {
		const entries = { action, field, selection, separator, status, surface, text };
		const catalog = new Map<string, AnyComponentFunction>(
			Object.entries(entries).map(([name, component]) => [
				`@exactjs/theme/enhancements#${name}`,
				component
			])
		);
		const container = document.createElement('div');
		render(
			createVNode(
				scope,
				{ scope: true, tonic: 'teal', appearance: 'light', depth: 'elevated' },
				createVNode(ThemeSpecimen, { label: 'Fixture' })
			),
			container,
			{ enhancementCatalog: catalog }
		);
		for (const role of Object.keys(entries))
			expect(container.querySelector(`[data-exact-theme-role="${role}"]`)).not.toBeNull();
		expect(container.querySelector('section')?.dataset.exactThemeRole).toBe('surface');
		expect(container.querySelector('h2')?.dataset.exactThemeRole).toBe('text');
		expect(container.querySelectorAll('.theme-lab-chart path')).toHaveLength(3);
		expect(container.querySelector('.theme-lab-chart table')).not.toBeNull();
		expect(
			container.querySelector<HTMLElement>('.theme-lab-chart table')?.dataset.exactThemeRole
		).toBeUndefined();
		expect(
			container.querySelector<HTMLElement>('.theme-lab-chart thead th')?.dataset.exactThemeRole
		).toBe('text');
		expect(
			container.querySelector<HTMLElement>('.theme-lab-chart tbody td')?.dataset.exactThemeRole
		).toBe('text');
		expect(container.querySelector('.theme-lab-chart th.exact-theme-surface')).toBeNull();
		expect(container.querySelector('progress')?.getAttribute('aria-label')).toBe('Confidence');
		expect(
			(container.querySelector('.theme-lab-chart table') as HTMLElement).style.borderRadius
		).toBe('');
		expect((container.querySelector('.theme-lab-chart th') as HTMLElement).style.borderRadius).toBe(
			''
		);
		expect(
			(container.querySelector('.theme-lab-selection') as HTMLElement).style.marginBlockStart
		).toBe('max(var(--exact-theme-control-gap), 0.25rem)');
		const draggable = container.querySelector('[draggable="true"]') as HTMLElement;
		const save = [...container.querySelectorAll('.exact-theme-action')].find(
			(element) => element.textContent === 'Save changes'
		) as HTMLElement;
		const depthOutput = container.querySelector(
			'[aria-label="Current depth demonstration state"]'
		) as HTMLOutputElement;
		expect(depthOutput.textContent).toContain('rest → shadow-sm');
		save.dispatchEvent(new Event('pointerover', { bubbles: true }));
		flushSync();
		expect(depthOutput.textContent).toContain('hover → shadow-md');
		save.dispatchEvent(new Event('pointerdown', { bubbles: true }));
		flushSync();
		expect(depthOutput.textContent).toContain('pressed → surface-sunken-shadow');
		save.dispatchEvent(new Event('pointerout', { bubbles: true }));
		flushSync();
		expect(depthOutput.textContent).toContain('rest → shadow-sm');
		expect(draggable.dataset.exactThemeDragging).toBeUndefined();
		draggable.dispatchEvent(new Event('dragstart', { bubbles: true }));
		flushSync();
		expect(draggable.dataset.exactThemeDragging).toBe('true');
		expect(depthOutput.textContent).toContain('dragging → shadow-lg');
		draggable.dispatchEvent(new Event('dragend', { bubbles: true }));
		flushSync();
		expect(draggable.dataset.exactThemeDragging).toBeUndefined();
		expect(container.querySelectorAll('.theme-lab-chart [class*="pattern-"]')).toHaveLength(3);
	});
});
