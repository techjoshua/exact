/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import {
	accessibleName,
	isElementVisible,
	labelText,
	matchesName,
	minimalTextMatches,
	roleOf
} from './queries/accessibility.js';
import { createEvent, setNativeValue, windowFor } from './queries/events.js';

describe('testing query semantics', () => {
	it('maps native controls and landmarks to their implicit roles', () => {
		const container = document.createElement('div');
		container.innerHTML = `
			<a href="/">link</a>
			<h2>heading</h2>
			<img alt="description">
			<img alt="">
			<ul><li>item</li></ul>
			<nav></nav><main></main>
			<table><tbody><tr><th>head</th><td>cell</td></tr></tbody></table>
			<textarea></textarea>
			<select></select><select multiple></select>
			<form aria-label="search"></form><form></form>
			<input><input type="checkbox"><input type="radio">
			<input type="range"><input type="number"><input type="file">
			<div role="switch checkbox"></div>
		`;

		expect(Array.from(container.querySelectorAll('*')).map(roleOf)).toEqual([
			'link',
			'heading',
			'img',
			undefined,
			'list',
			'listitem',
			'navigation',
			'main',
			'table',
			undefined,
			'row',
			'columnheader',
			'cell',
			'textbox',
			'combobox',
			'listbox',
			'form',
			undefined,
			'textbox',
			'checkbox',
			'radio',
			'slider',
			'spinbutton',
			undefined,
			'switch'
		]);
	});

	it('resolves accessible names in ARIA, label, value, and content precedence order', () => {
		const container = document.createElement('div');
		container.innerHTML = `
			<span id="first">First</span><span id="last">Last</span>
			<button aria-labelledby="first last" aria-label="ignored">content</button>
			<label>Account <input id="account" value="fallback"></label>
			<input id="named" aria-label="Direct" value="ignored">
			<input id="valued" value="Value">
		`;
		document.body.append(container);

		expect(accessibleName(container.querySelector('button')!)).toBe('First Last');
		expect(accessibleName(container.querySelector('#account')!)).toBe('Account');
		expect(labelText(container.querySelector('#account')!)).toBe('Account');
		expect(labelText(container.querySelector('button')!)).toBeUndefined();
		expect(accessibleName(container.querySelector('#named')!)).toBe('Direct');
		expect(accessibleName(container.querySelector('#valued')!)).toBe('Value');
		expect(matchesName(' repeated ', 'repeated')).toBe(true);
		const pattern = /repeat/g;
		expect(matchesName('repeat', pattern)).toBe(true);
		expect(matchesName('repeat', pattern)).toBe(true);
		container.remove();
	});

	it('excludes hidden ancestors and returns only the smallest matching text nodes', () => {
		const container = document.createElement('div');
		container.innerHTML = `
			<section><div>Parent <span>Target</span></div></section>
			<div hidden><span>Target</span></div>
			<div aria-hidden="true"><span>Target</span></div>
			<div style="display: none"><span>Target</span></div>
			<div style="visibility: hidden"><span>Target</span></div>
		`;
		document.body.append(container);
		const spans = Array.from(container.querySelectorAll('span'));

		expect(isElementVisible(spans[0]!)).toBe(true);
		expect(spans.slice(1).every((element) => !isElementVisible(element))).toBe(true);
		expect(minimalTextMatches(Array.from(container.querySelectorAll('*')), 'Target')).toEqual([
			spans[0]
		]);
		container.remove();
	});

	it('creates realm-correct events and updates native form state', () => {
		const input = document.createElement('input');
		const checkbox = document.createElement('input');
		checkbox.type = 'checkbox';
		const select = document.createElement('select');
		const option = document.createElement('option');
		option.value = 'selected';
		select.append(option);

		setNativeValue(input, 42);
		setNativeValue(checkbox, true);
		setNativeValue(select, 'selected');

		expect(input.value).toBe('42');
		expect(checkbox.checked).toBe(true);
		expect(select.value).toBe('selected');
		expect(createEvent(input, 'click', { bubbles: true })).toBeInstanceOf(MouseEvent);
		expect(createEvent(input, 'input', {})).toBeInstanceOf(InputEvent);
		expect(createEvent(input, 'focus', {})).toBeInstanceOf(FocusEvent);
		expect(createEvent(input, 'custom', {})).toBeInstanceOf(Event);
		expect(windowFor(input)).toBe(window);
		expect(() => setNativeValue(document.createElement('div'), 'value')).toThrow(
			'require a form control'
		);
	});
});
