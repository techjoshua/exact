/** Verifies shared portal listeners, retargeting, root ownership and repeated native dispatch. */
export function verifyPortalEventOwnership({
	Portal,
	Parent,
	operation,
	render,
	unmount,
	flushSync
}) {
	const check = (value, message) => {
		if (!value) throw new Error('Portal event ownership: ' + message);
	};
	const containers = [];
	const create = () => {
		const container = document.createElement('div');
		document.body.append(container);
		containers.push(container);
		return container;
	};
	const first = create();
	const second = create();
	const target = create();
	const replacement = create();
	const removals = [];
	const remove = target.removeEventListener;
	target.removeEventListener = function (type, listener, options) {
		removals.push(type);
		return remove.call(this, type, listener, options);
	};
	const show = (container, destination, label, visible = true) => {
		const failures = [];
		render(operation(Portal, { target: destination, label, visible }), container, {
			onErrorReport: ({ error }) => failures.push(error)
		});
		flushSync();
		if (failures.length) throw failures[0];
		if (visible && !destination.querySelector(`[data-portal="${label}"]`))
			throw new Error('Portal did not mount: ' + container.textContent);
	};
	const button = (container, label) => container.querySelector(`[data-portal="${label}"]`);
	try {
		show(first, target, 'first');
		show(second, target, 'second');
		button(target, 'first').click();
		button(target, 'second').click();
		flushSync();
		check(button(target, 'first').textContent === '1', 'first shared-target callback runs once');
		check(button(target, 'second').textContent === '1', 'second shared-target callback runs once');
		show(first, replacement, 'first');
		check(
			removals.filter((type) => type === 'click').length === 1,
			'retarget releases old root listener'
		);
		button(target, 'second').click();
		button(replacement, 'first').click();
		flushSync();
		check(button(target, 'second').textContent === '2', 'remaining shared-target owner survives');
		check(button(replacement, 'first').textContent === '2', 'retarget preserves component state');
		show(second, target, 'second', false);
		check(
			removals.filter((type) => type === 'click').length === 2,
			'last foreign owner releases listener'
		);
		show(second, target, 'second');
		button(target, 'second').click();
		flushSync();
		check(button(target, 'second').textContent === '3', 'reacquired target resumes retained state');

		const parent = create();
		render(operation(Parent, {}), parent);
		const nested = parent.querySelector('[data-nested-root]');
		containers.push(nested);
		show(nested, nested, 'nested');
		const event = new MouseEvent('click', { bubbles: true });
		button(nested, 'nested').dispatchEvent(event);
		button(nested, 'nested').dispatchEvent(event);
		flushSync();
		check(
			button(nested, 'nested').textContent === '2',
			'nested-root callback runs once per dispatch'
		);
		check(
			parent.querySelector('output').textContent === '2',
			'native bubbling reaches parent once per dispatch'
		);
		unmount(nested);
	} finally {
		target.removeEventListener = remove;
		for (const container of containers.reverse()) {
			unmount(container);
			container.remove();
		}
	}
}
