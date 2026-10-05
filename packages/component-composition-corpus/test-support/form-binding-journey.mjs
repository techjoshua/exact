/**
 * Verifies compiled control conversion, retained identity and the next interaction.
 * The caller owns mounting, hydration, platform availability, reporting and disposal.
 * @param {ParentNode} root
 * @param {() => void | Promise<void>} settle
 */
export async function verifyFormBindingControls(root, settle) {
	const input = (id) => root.querySelector('#' + id);
	const EventType = input('form-number-text').ownerDocument.defaultView.Event;
	const equal = (actual, expected) => {
		if (actual !== expected)
			throw new Error(`Form binding expected ${String(expected)}, received ${String(actual)}`);
	};
	const output = input('form-binding-result');
	const inputs = [...root.querySelectorAll('#form-binding-probe input')];
	equal(input('form-radio-two').checked, true);
	equal(input('form-label-two').checked, true);
	equal(input('form-group-label').checked, true);
	equal(input('form-label-select').options[0].selected, true);
	equal(output.textContent, '2|2|2|[2]|["2"]|false');
	const change = async (id, checked) => {
		const element = input(id);
		element.checked = checked;
		element.dispatchEvent(new EventType('change', { bubbles: true }));
		await settle();
	};
	for (let round = 0; round < 2; round++) {
		const text = input('form-number-text');
		text.value = '7';
		text.dispatchEvent(new EventType('input', { bubbles: true }));
		await settle();
		equal(input('form-number-native').value, '7');
		await change('form-radio-three', true);
		await change('form-label-three', true);
		await change('form-group-number', false);
		await change('form-group-label', false);
		equal(output.textContent, '7|3|3|null|undefined|false');
		await change('form-group-number', true);
		await change('form-group-number', true);
		await change('form-group-label', true);
		await change('form-group-label', true);
		equal(output.textContent, '7|3|3|[2]|["2"]|false');
		const select = input('form-label-select');
		select.options[0].selected = false;
		select.options[1].selected = true;
		select.dispatchEvent(new EventType('change', { bubbles: true }));
		await settle();
		equal(input('form-group-label').checked, false);
		const details = input('form-disclosure');
		details.open = true;
		details.dispatchEvent(new EventType('toggle'));
		await settle();
		equal(output.textContent, '7|3|3|[2]|["3"]|true');
		input('form-binding-reset').click();
		await settle();
		equal(output.textContent, '2|2|2|[2]|["2"]|false');
		const retained = [...root.querySelectorAll('#form-binding-probe input')];
		equal(retained.length, inputs.length);
		for (let i = 0; i < inputs.length; i++) equal(retained[i], inputs[i]);
		equal(input('form-binding-result'), output);
	}
	const dialog = input('form-modal');
	if (dialog) {
		equal(dialog.open, false);
		input('form-modal-toggle').click();
		await settle();
		equal(dialog.matches(':modal'), true);
		dialog.close();
		await settle();
		equal(dialog.matches(':modal'), false);
		input('form-modal-toggle').click();
		await settle();
		equal(dialog.matches(':modal'), true);
		input('form-modal-toggle').click();
		await settle();
		equal(dialog.matches(':modal'), false);
	}
}
