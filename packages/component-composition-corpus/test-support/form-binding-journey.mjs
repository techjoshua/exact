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
	const temporal = [
		['date', '2026-01-02', '2026-01-03', Date.UTC(2026, 0, 3)],
		['datetime', '2026-01-02T03:04', '2026-01-03T03:05', Date.UTC(2026, 0, 3, 3, 5)],
		['time', '03:04', '03:05', (3 * 60 + 5) * 60_000],
		['month', '2026-01', '2026-02', 673],
		['week', '2026-W01', '2026-W02', Date.UTC(2026, 0, 5)]
	];
	const initialTemporal = '1767312000000|1767323040000|11040000|672|1766966400000';
	const temporalOutput = input('form-temporal-result');
	equal(temporalOutput.textContent, initialTemporal);
	for (const [name, initial] of temporal) equal(input('form-temporal-' + name).value, initial);
	equal(input('form-temporal-explicit').value, '2026-01-02');
	equal(input('form-temporal-dynamic').value, '2026-01-02');
	equal(input('form-native-date').value, '');
	equal(input('form-native-date-result').textContent, 'empty');
	equal(input('form-native-date-preview').value, '10000-01-02');
	const output = input('form-binding-result');
	const inputs = [...root.querySelectorAll('#form-binding-probe input')];
	equal(input('form-radio-two').checked, true);
	equal(input('form-label-two').checked, true);
	equal(input('form-group-label').checked, true);
	equal(input('form-label-select').options[0].selected, true);
	equal(output.textContent, '2|2|2|[2]|["2"]|false');
	const readDate = async (expected) => {
		input('form-native-date-read').click();
		for (let turn = 0; turn < 50; turn++) {
			await settle();
			if (input('form-native-date-read-result').textContent === expected) return;
		}
		equal(input('form-native-date-read-result').textContent, expected);
	};
	const change = async (id, checked) => {
		const element = input(id);
		element.checked = checked;
		element.dispatchEvent(new EventType('change', { bubbles: true }));
		await settle();
	};
	for (let round = 0; round < 2; round++) {
		const nativeDate = input('form-native-date');
		nativeDate.value = '';
		nativeDate.dispatchEvent(new EventType('change', { bubbles: true }));
		await settle();
		equal(input('form-native-date-result').textContent, 'empty');
		await readDate('empty|1');
		nativeDate.value = '10000-01-02';
		nativeDate.dispatchEvent(new EventType('change', { bubbles: true }));
		await settle();
		equal(nativeDate.value, '10000-01-02');
		equal(input('form-native-date-result').textContent, '+010000-01-02T00:00:00.000Z');
		await readDate(String(Date.UTC(10000, 0, 2)) + '|2');
		for (const [name, , next] of temporal) {
			const control = input('form-temporal-' + name);
			control.value = '';
			control.dispatchEvent(new EventType('change', { bubbles: true }));
			await settle();
			equal(control.value, '');
			control.value = next;
			control.dispatchEvent(new EventType('change', { bubbles: true }));
			await settle();
			equal(control.value, next);
		}
		equal(temporalOutput.textContent, temporal.map(([, , , number]) => number).join('|'));
		equal(input('form-temporal-explicit').value, '2026-01-03');
		equal(input('form-temporal-dynamic').value, '2026-01-03');
		input('form-temporal-type').click();
		await settle();
		equal(input('form-temporal-dynamic').value, String(Date.UTC(2026, 0, 3)));
		input('form-temporal-type').click();
		await settle();
		equal(input('form-temporal-dynamic').value, '2026-01-03');
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
		equal(temporalOutput.textContent, initialTemporal);
		equal(input('form-native-date').value, '');
		equal(input('form-native-date-result').textContent, 'empty');
		for (const [name, initial] of temporal) equal(input('form-temporal-' + name).value, initial);
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
