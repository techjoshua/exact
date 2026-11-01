/**
 * @vitest-environment jsdom
 */
import { createDomWorkBudget } from '@exactjs/dom';
import { describe, expect, it } from 'vitest';
import { captureHydrationDom, restoreFormState } from './form-state.js';

describe('hydration form-state restoration', () => {
	it('restores a retained dirty control without indexing the hydrated DOM', () => {
		const container = document.createElement('main');
		container.innerHTML = '<input id="query" value="server">';
		const input = container.querySelector('input')!;
		input.value = 'typed before hydration';
		const snapshot = captureHydrationDom(container, createDomWorkBudget(10));

		const restored = restoreFormState(container, snapshot.formState, createDomWorkBudget(1));

		expect(restored).toEqual([input]);
		expect(input.value).toBe('typed before hydration');
	});
});

it('captures dirty and focused controls together with nested hydration markers', () => {
	const container = document.createElement('main');
	container.innerHTML =
		'<input id="clean" value="unchanged"><section><input id="dirty" value="server"><textarea>server</textarea><select><option selected>a</option><option>b</option></select><!--exact:component--></section>';
	document.body.appendChild(container);
	try {
		const clean = container.querySelector<HTMLInputElement>('#clean')!;
		const dirty = container.querySelector<HTMLInputElement>('#dirty')!;
		const textarea = container.querySelector('textarea')!;
		const select = container.querySelector('select')!;
		dirty.value = 'typed';
		textarea.value = 'edited';
		select.value = 'b';
		const first = captureHydrationDom(container, createDomWorkBudget());
		expect(first.hasMarkers).toBe(true);
		expect(first.formState.map((state) => state.node)).toEqual([dirty, textarea, select]);
		clean.focus();
		const focused = captureHydrationDom(container, createDomWorkBudget());
		expect(focused.formState.map((state) => state.node)).toEqual([clean, dirty, textarea, select]);
		dirty.value = 'reset';
		textarea.value = 'reset';
		select.value = 'a';
		restoreFormState(container, focused.formState, createDomWorkBudget());
		expect([dirty.value, textarea.value, select.value]).toEqual(['typed', 'edited', 'b']);
		expect(document.activeElement).toBe(clean);
	} finally {
		container.remove();
	}
});

it('keeps selected file inputs browser-owned during restoration', () => {
	const container = document.createElement('main');
	container.innerHTML = '<input type="file" id="upload">';
	const input = container.querySelector('input')!;
	const assign = () => {
		throw new DOMException('Cannot assign a selected file path', 'InvalidStateError');
	};
	Object.defineProperty(input, 'value', { get: () => 'C:\\fakepath\\proof.txt', set: assign });
	const snapshot = captureHydrationDom(container, createDomWorkBudget());
	expect(() =>
		restoreFormState(container, snapshot.formState, createDomWorkBudget())
	).not.toThrow();
	expect(input.value).toBe('C:\\fakepath\\proof.txt');
});

it.each(['', 'true', 'TRUE', 'plaintext-only'])(
	'restores explicitly editable text for %j',
	(editable) => {
		const container = document.createElement('main');
		container.innerHTML = `<div id="editor" contenteditable="${editable}" data-exact-ssr-text="server">typed</div>`;
		const snapshot = captureHydrationDom(container, createDomWorkBudget());
		container.querySelector('div')!.textContent = 'server';
		restoreFormState(container, snapshot.formState, createDomWorkBudget());
		expect(container.textContent).toBe('typed');
	}
);

it('restores a replacement modeless dialog without requiring modal APIs', () => {
	const container = document.createElement('main');
	container.innerHTML = '<dialog id="message" open>message</dialog>';
	const snapshot = captureHydrationDom(container, createDomWorkBudget());
	container.innerHTML = '<dialog id="message">message</dialog>';
	restoreFormState(container, snapshot.formState, createDomWorkBudget());
	expect(container.querySelector('dialog')!.open).toBe(true);
});

it.each([false, true])(
	'preserves option values across replacement reordering (multiple=%s)',
	(multiple) => {
		const container = document.createElement('main');
		container.innerHTML = `<select id="choice" ${multiple ? 'multiple' : ''}><option value="a" selected>A</option><option value="b">B</option></select>`;
		container.querySelector('select')!.value = 'b';
		const snapshot = captureHydrationDom(container, createDomWorkBudget());
		container.innerHTML = `<select id="choice" ${multiple ? 'multiple' : ''}><option value="b">B</option><option value="a" selected>A</option></select>`;
		restoreFormState(container, snapshot.formState, createDomWorkBudget());
		expect(
			Array.from(container.querySelector('select')!.selectedOptions, (option) => option.value)
		).toEqual(['b']);
	}
);

it.each(['false', 'inherit', 'unsupported'])('leaves noneditable text alone for %j', (editable) => {
	const container = document.createElement('main');
	container.innerHTML = `<div contenteditable="${editable}">server</div>`;
	expect(captureHydrationDom(container, createDomWorkBudget()).formState).toEqual([]);
});

it.each([false, true])(
	'does not substitute a fallback when the selected option disappears (multiple=%s)',
	(multiple) => {
		const container = document.createElement('main');
		container.innerHTML = `<select id="choice" ${multiple ? 'multiple' : ''}><option value="a" selected>A</option><option value="b">B</option></select>`;
		container.querySelector('select')!.value = 'b';
		const snapshot = captureHydrationDom(container, createDomWorkBudget());
		container.innerHTML = `<select id="choice" ${multiple ? 'multiple' : ''}><option value="a" selected>A</option></select>`;
		restoreFormState(container, snapshot.formState, createDomWorkBudget());
		expect(container.querySelector('select')!.selectedIndex).toBe(-1);
	}
);

it('preserves the selected occurrence among duplicate option values', () => {
	const container = document.createElement('main');
	container.innerHTML =
		'<select id="choice"><option value="a" selected>A</option><option value="b">First B</option><option value="b">Second B</option></select>';
	container.querySelector('select')!.selectedIndex = 2;
	const snapshot = captureHydrationDom(container, createDomWorkBudget());
	container.innerHTML =
		'<select id="choice"><option value="b">First B</option><option value="a" selected>A</option><option value="b">Second B</option></select>';
	restoreFormState(container, snapshot.formState, createDomWorkBudget());
	expect(container.querySelector('select')!.selectedOptions[0].textContent).toBe('Second B');
});

it.each([
	'<input id="unrelated" value="new">',
	'<input id="query" value="first"><input id="query" value="second">'
])(
	'does not transfer dirty input to a missing or ambiguous replacement identity',
	(replacement) => {
		const container = document.createElement('main');
		container.innerHTML = '<input id="query" value="server">';
		container.querySelector('input')!.value = 'private draft';
		const snapshot = captureHydrationDom(container, createDomWorkBudget());
		container.innerHTML = replacement;
		expect(restoreFormState(container, snapshot.formState, createDomWorkBudget())).toEqual([]);
		expect(Array.from(container.querySelectorAll('input'), (input) => input.value)).not.toContain(
			'private draft'
		);
	}
);

it('restores an unidentified replacement control through compatible positional fallback', () => {
	const container = document.createElement('main');
	container.innerHTML = '<input value="server">';
	container.querySelector('input')!.value = 'typed';
	const snapshot = captureHydrationDom(container, createDomWorkBudget());
	container.innerHTML = '<input value="new">';
	restoreFormState(container, snapshot.formState, createDomWorkBudget(1));
	expect(container.querySelector('input')!.value).toBe('typed');
});

it('restores wide nested controls around text and comment siblings within the capture budget', () => {
	const container = document.createElement('main');
	const html = Array.from(
		{ length: 5 },
		() => '<section>label' + '<!--separator--><input value="server">'.repeat(20) + '</section>'
	).join('');
	container.innerHTML = html;
	const values = Array.from(container.querySelectorAll('input'), (input, index) => {
		input.value = `draft ${index}`;
		return input.value;
	});
	const snapshot = captureHydrationDom(container, createDomWorkBudget(500));
	container.innerHTML = html;
	restoreFormState(container, snapshot.formState, createDomWorkBudget(500));
	expect(Array.from(container.querySelectorAll('input'), (input) => input.value)).toEqual(values);
});

it('retains unchanged editable descendants and their native selection', () => {
	const container = document.createElement('main');
	container.innerHTML =
		'<div contenteditable="true" data-exact-ssr-text="server"><strong>typed</strong></div>';
	document.body.append(container);
	try {
		const strong = container.querySelector('strong')!;
		const text = strong.firstChild!;
		const range = document.createRange();
		range.setStart(text, 1);
		range.setEnd(text, 4);
		const selection = window.getSelection()!;
		selection.removeAllRanges();
		selection.addRange(range);
		const snapshot = captureHydrationDom(container, createDomWorkBudget());
		restoreFormState(container, snapshot.formState, createDomWorkBudget());
		expect(container.querySelector('strong')).toBe(strong);
		expect(selection.toString()).toBe('ype');
	} finally {
		window.getSelection()!.removeAllRanges();
		container.remove();
	}
});

it.each(['checkbox', 'radio'])(
	'does not restore another authored option identity for %s',
	(type) => {
		const container = document.createElement('main');
		container.innerHTML = `<input id="option" name="choice" type="${type}" value="old-option">`;
		container.querySelector('input')!.checked = true;
		const snapshot = captureHydrationDom(container, createDomWorkBudget());
		container.innerHTML = `<input id="option" name="choice" type="${type}" value="new-option">`;
		expect(restoreFormState(container, snapshot.formState, createDomWorkBudget())).toEqual([]);
		expect(container.querySelector('input')!.value).toBe('new-option');
		expect(container.querySelector('input')!.checked).toBe(false);
	}
);

it('restores reordered same-name radio controls by their stable IDs', () => {
	const container = document.createElement('main');
	container.innerHTML =
		'<input id="a" name="choice" type="radio" value="a" checked><input id="b" name="choice" type="radio" value="b">';
	container.querySelector<HTMLInputElement>('#b')!.checked = true;
	const snapshot = captureHydrationDom(container, createDomWorkBudget());
	container.innerHTML =
		'<input id="b" name="choice" type="radio" value="b"><input id="a" name="choice" type="radio" value="a" checked>';
	restoreFormState(container, snapshot.formState, createDomWorkBudget());
	expect(container.querySelector<HTMLInputElement>('#b')!.checked).toBe(true);
	expect(container.querySelector<HTMLInputElement>('#a')!.checked).toBe(false);
});

it('does not transfer editable drafts into a replacement that is no longer editable', () => {
	const container = document.createElement('main');
	container.innerHTML =
		'<div id="editor" contenteditable="true" data-exact-ssr-text="server">typed</div>';
	const snapshot = captureHydrationDom(container, createDomWorkBudget());
	container.innerHTML = '<div id="editor" contenteditable="false">new content</div>';
	expect(restoreFormState(container, snapshot.formState, createDomWorkBudget())).toEqual([]);
	expect(container.textContent).toBe('new content');
});

it('keeps delimited form names and option values distinct when checking replacement compatibility', () => {
	const container = document.createElement('main');
	container.innerHTML = '<input id="option" name="x|y" type="checkbox" value="z">';
	container.querySelector('input')!.checked = true;
	const snapshot = captureHydrationDom(container, createDomWorkBudget());
	container.innerHTML = '<input id="option" name="x" type="checkbox" value="y|z">';
	expect(restoreFormState(container, snapshot.formState, createDomWorkBudget())).toEqual([]);
	expect(container.querySelector('input')!.value).toBe('y|z');
	expect(container.querySelector('input')!.checked).toBe(false);
});

it.each(['details', 'dialog'])(
	'restores a %s closed before hydration from its server baseline',
	(tag) => {
		const container = document.createElement('main');
		container.innerHTML = `<${tag} id="control" open data-exact-ssr-open="true">Content</${tag}>`;
		const control = container.firstElementChild as HTMLDetailsElement | HTMLDialogElement;
		control.open = false;
		const snapshot = captureHydrationDom(container, createDomWorkBudget());
		container.innerHTML = `<${tag} id="control" open data-exact-ssr-open="true">Content</${tag}>`;
		restoreFormState(container, snapshot.formState, createDomWorkBudget());
		expect((container.firstElementChild as HTMLDetailsElement | HTMLDialogElement).open).toBe(
			false
		);
	}
);

it('stops restoring controls after focus supersedes the receiving attempt', () => {
	const host = document.createElement('div');
	host.innerHTML = '<input value="first"><input value="second">';
	document.body.append(host);
	const [first, second] = [...host.querySelectorAll('input')];
	let current = true;
	try {
		first!.value = 'dirty';
		second!.value = 'other dirty';
		first!.focus();
		first!.setSelectionRange(3, 3);
		const snapshot = captureHydrationDom(host, createDomWorkBudget());
		first!.blur();
		first!.value = 'rendered';
		second!.value = 'rendered';
		first!.addEventListener('focus', () => {
			current = false;
			first!.value = 'newer';
			first!.setSelectionRange(0, 0);
		});
		restoreFormState(host, snapshot.formState, createDomWorkBudget(), () => current);
		expect(first!.value).toBe('newer');
		expect(first!.selectionStart).toBe(0);
		expect(second!.value).toBe('rendered');
	} finally {
		host.remove();
	}
});

it.each([
	['<select><option>a</option><option>b</option></select>', 0],
	[
		'<select><option disabled>a</option><optgroup disabled><option>b</option></optgroup><option>c</option></select>',
		2
	],
	['<select><option selected>a</option><option selected>b</option></select>', 1],
	['<select size="2"><option>a</option><option>b</option></select>', -1],
	['<select multiple><option>a</option><option>b</option></select>', -1]
] as const)(
	'distinguishes native default selection from a real pre-hydration edit: %s',
	(html, initial) => {
		const container = document.createElement('main');
		container.innerHTML = html;
		const select = container.querySelector('select')!;
		expect(select.selectedIndex).toBe(initial);
		expect(captureHydrationDom(container, createDomWorkBudget()).formState).toEqual([]);
		select.selectedIndex = initial === 1 ? 0 : 1;
		const snapshot = captureHydrationDom(container, createDomWorkBudget());
		expect(snapshot.formState.map((state) => state.node)).toEqual([select]);
		const edited = select.selectedIndex;
		select.selectedIndex = initial;
		restoreFormState(container, snapshot.formState, createDomWorkBudget());
		expect(select.selectedIndex).toBe(edited);
	}
);
