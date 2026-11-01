/** Checks application focus and state effects across native event delivery paths. */
export function verifyEventResponsibility({ mount, unmount, flushSync }) {
	const check = (value, message) => {
		if (!value) throw new Error('Event responsibility: ' + message);
	};
	let scenarios = 0;
	for (const [path, type] of [
		['delegated', 'click'],
		['capture', 'click'],
		['direct', 'mouseenter'],
		['contribution', 'click']
	]) {
		for (const fail of [false, true]) {
			for (const action of ['selection', 'blur', 'focus', 'atomic']) {
				const container = document.createElement('div');
				document.body.append(container);
				const errors = [];
				const label = `${path}/${action}/fail=${fail}`;
				try {
					mount(container, action, fail, errors);
					const input = container.querySelector(`[data-path="${path}"]`);
					const target = container.querySelector('[data-focus-target]');
					input.value = 'abcdef';
					input.focus();
					input.setSelectionRange(1, 2);
					input.dispatchEvent(new MouseEvent(type, { bubbles: true }));
					flushSync();
					check(
						container.querySelector('output').textContent === (action === 'atomic' ? '0' : '1'),
						label + ' state publication'
					);
					check(
						errors.length === (fail || action === 'atomic' ? 1 : 0),
						label + ' error ownership'
					);
					if (errors.length)
						check(
							errors[0].error.message ===
								(action === 'atomic' ? 'explicit atomic failure' : 'authored event failure'),
							label + ' authored error'
						);
					if (action === 'selection')
						check(
							input.selectionStart === 3 && input.selectionEnd === 5,
							label + ' authored selection'
						);
					if (action === 'blur') check(document.activeElement !== input, label + ' authored blur');
					if (action === 'focus')
						check(document.activeElement === target, label + ' authored focus');
					// The next event progresses after either success or a handled failure.
					input.dispatchEvent(new MouseEvent(type, { bubbles: true }));
					flushSync();
					check(
						container.querySelector('output').textContent === (action === 'atomic' ? '0' : '2'),
						label + ' subsequent progress'
					);
					check(
						errors.length === (fail || action === 'atomic' ? 2 : 0),
						label + ' repeated error ownership'
					);
					unmount(container);
					input.dispatchEvent(new MouseEvent(type, { bubbles: true }));
					flushSync();
					check(
						errors.length === (fail || action === 'atomic' ? 2 : 0),
						label + ' listener cleanup'
					);
					scenarios++;
				} finally {
					unmount(container);
					container.remove();
				}
			}
		}
	}
	return { scenarios };
}
