/** Checks native file ownership and replacement control recovery through the shared hydration boundary. */
export function verifyHydrationFormRecovery(api) {
	const equal = (actual, expected, message) => {
		if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(message);
	};
	const previousFocus = document.activeElement;
	const previousSelection = window.getSelection();
	const previousRanges = Array.from({ length: previousSelection.rangeCount }, (_, index) =>
		previousSelection.getRangeAt(index).cloneRange()
	);
	const container = document.createElement('main');
	document.body.append(container);
	const capture = () => api.captureHydrationDom(container, api.createDomWorkBudget());
	const restore = (snapshot) =>
		api.restoreFormState(container, snapshot.formState, api.createDomWorkBudget());
	try {
		container.innerHTML = '<input id="file" type="file">';
		const file = container.querySelector('input');
		const transfer = new DataTransfer();
		transfer.items.add(new File(['owned fixture'], 'proof.txt'));
		file.files = transfer.files;
		restore(capture());
		equal(
			[...file.files].map((file) => file.name),
			['proof.txt'],
			'Retained file selection changed'
		);
		const selectedFile = capture();
		container.innerHTML = '<input id="file" type="file">';
		restore(selectedFile);
		equal(
			container.querySelector('input').files.length,
			0,
			'Replacement file input acquired a synthetic path'
		);
		for (const modal of [false, true]) {
			container.innerHTML = '<dialog id="dialog">Message</dialog>';
			const dialog = container.querySelector('dialog');
			if (modal) dialog.showModal();
			else dialog.show();
			const snapshot = capture();
			dialog.close();
			container.innerHTML = '<dialog id="dialog">Message</dialog>';
			restore(snapshot);
			const replacement = container.querySelector('dialog');
			equal(
				[replacement.open, replacement.matches(':modal')],
				[true, modal],
				'Dialog mode was lost'
			);
			replacement.close();
		}
		for (const editable of ['', 'true', 'TRUE', 'plaintext-only']) {
			container.innerHTML = `<div id="editor" contenteditable="${editable}" data-exact-ssr-text="server">typed</div>`;
			const snapshot = capture();
			container.querySelector('div').textContent = 'server';
			restore(snapshot);
			equal(container.textContent, 'typed', 'Editable text was lost');
		}
		container.innerHTML =
			'<div contenteditable="true" data-exact-ssr-text="server"><strong>typed</strong></div>';
		const strong = container.querySelector('strong');
		const range = document.createRange();
		range.setStart(strong.firstChild, 1);
		range.setEnd(strong.firstChild, 4);
		const selection = window.getSelection();
		selection.removeAllRanges();
		selection.addRange(range);
		restore(capture());
		equal(
			container.querySelector('strong') === strong,
			true,
			'Retained editable descendants were replaced'
		);
		equal(selection.toString(), 'ype', 'Retained editable selection was lost');
		selection.removeAllRanges();
		for (const multiple of [false, true]) {
			container.innerHTML = `<select id="choice" ${multiple ? 'multiple' : ''}><option value="a" selected>A</option><option value="b">B</option></select>`;
			container.querySelector('select').value = 'b';
			const snapshot = capture();
			container.innerHTML = `<select id="choice" ${multiple ? 'multiple' : ''}><option value="b">B</option><option value="a" selected>A</option></select>`;
			restore(snapshot);
			equal(
				[...container.querySelector('select').selectedOptions].map((option) => option.value),
				['b'],
				'Option reordering changed selection'
			);
		}
		for (const replacement of [
			'<input id="other" value="new">',
			'<input id="query" value="first"><input id="query" value="second">'
		]) {
			container.innerHTML = '<input id="query" value="server">';
			container.querySelector('input').value = 'private draft';
			const snapshot = capture();
			container.innerHTML = replacement;
			equal(
				restore(snapshot).length,
				0,
				'Missing or ambiguous identity borrowed positional authority'
			);
			equal(
				[...container.querySelectorAll('input')].some((input) => input.value === 'private draft'),
				false,
				'Unrelated control acquired another input draft'
			);
		}
		for (const type of ['checkbox', 'radio']) {
			container.innerHTML = `<input id="option" name="choice" type="${type}" value="old-option">`;
			container.querySelector('input').checked = true;
			const snapshot = capture();
			container.innerHTML = `<input id="option" name="choice" type="${type}" value="new-option">`;
			equal(restore(snapshot).length, 0, 'Changed option identity acquired old control state');
			equal(
				[container.querySelector('input').value, container.querySelector('input').checked],
				['new-option', false],
				'Authored option value was overwritten'
			);
		}
		container.innerHTML =
			'<input id="a" name="choice" type="radio" value="a" checked><input id="b" name="choice" type="radio" value="b">';
		container.querySelector('#b').checked = true;
		const radios = capture();
		container.innerHTML =
			'<input id="b" name="choice" type="radio" value="b"><input id="a" name="choice" type="radio" value="a" checked>';
		restore(radios);
		equal(
			[container.querySelector('#a').checked, container.querySelector('#b').checked],
			[false, true],
			'Stable radio option identities lost selection after reordering'
		);
		container.innerHTML =
			'<div id="editor" contenteditable="true" data-exact-ssr-text="server">typed</div>';
		const editor = capture();
		container.innerHTML = '<div id="editor" contenteditable="false">new content</div>';
		equal(restore(editor).length, 0, 'Noneditable replacement acquired an editable draft');
		equal(container.textContent, 'new content', 'Noneditable replacement was overwritten');
		const html = Array.from(
			{ length: 5 },
			() => '<section>label' + '<!--separator--><input value="server">'.repeat(20) + '</section>'
		).join('');
		container.innerHTML = html;
		const values = [...container.querySelectorAll('input')].map(
			(input, index) => (input.value = `draft ${index}`)
		);
		const wide = api.captureHydrationDom(container, api.createDomWorkBudget(500));
		container.innerHTML = html;
		api.restoreFormState(container, wide.formState, api.createDomWorkBudget(500));
		equal(
			[...container.querySelectorAll('input')].map((input) => input.value),
			values,
			'Wide form recovery changed positional ownership'
		);
	} finally {
		container.querySelector('dialog')?.close();
		window.getSelection().removeAllRanges();
		container.remove();
		for (const range of previousRanges) previousSelection.addRange(range);
		if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
			previousFocus.focus({ preventScroll: true });
	}
}
