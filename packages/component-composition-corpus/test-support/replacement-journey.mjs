/** Runs the same replacement and cancelled-catch contract in adapter realms and native browsers. */
export async function verifyReplacementOwnership(container = document) {
	const check = (condition, message) => {
		if (!condition) throw new Error(message);
	};
	const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
	const click = async (host, name) => {
		const button = [...host.querySelectorAll('button')].find(
			(button) => button.textContent === name
		);
		check(button, 'Missing button ' + name);
		button.click();
		await tick();
	};
	const namespaceProbe = container.querySelector('[data-namespace-probe]');
	check(namespaceProbe, 'Missing contextual namespace probe');
	const targets = [...namespaceProbe.querySelectorAll('[data-namespace-target]')];
	check(targets[0].namespaceURI === 'http://www.w3.org/2000/svg', 'SVG component lost namespace');
	check(targets.length === 4, 'Namespace integration targets missing');
	for (const target of targets.slice(1))
		check(
			target.namespaceURI === 'http://www.w3.org/1999/xhtml',
			'HTML integration lost namespace'
		);
	for (let count = 1; count <= 2; count++) {
		targets[count - 1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await tick();
		for (const [index, target] of targets.entries()) {
			check(
				namespaceProbe.querySelectorAll('[data-namespace-target]')[index] === target,
				'Namespace update replaced retained DOM'
			);
			check(
				target.getAttribute('data-count') === String(count),
				'Namespace claim lost property update'
			);
		}
	}
	for (const [action, namespace] of [
		['Show MathML child', 'http://www.w3.org/1998/Math/MathML'],
		['Show HTML child', 'http://www.w3.org/1999/xhtml']
	]) {
		await click(namespaceProbe, action);
		check(
			namespaceProbe.querySelector('[data-namespace-range]')?.namespaceURI === namespace,
			'Range used stale annotation encoding'
		);
		const required = namespaceProbe.querySelector('[data-foreign-required]');
		check(required?.namespaceURI === namespace, 'Required input lost its attachment namespace');
		check(required?.getAttribute('required') === '', 'Required input lost its boolean attribute');
		check(
			required?.getAttribute('title') === 'line\nbreak',
			'Required input lost literal attribute whitespace'
		);
		const native = document.createElementNS(namespace, 'input');
		native.setAttribute('maxLength', '4');
		check(
			required?.getAttribute('maxLength') === native.getAttribute('maxLength'),
			'Numeric attribute differs from native construction'
		);
		if (namespace === 'http://www.w3.org/1999/xhtml')
			check(required.maxLength === 4, 'Required input lost native property reflection');
		for (const [index, target] of targets.entries())
			check(
				namespaceProbe.querySelectorAll('[data-namespace-target]')[index] === target,
				'Namespace prerequisite replaced unrelated child'
			);
		await click(namespaceProbe, 'Hide namespace child');
		check(
			!namespaceProbe.querySelector('[data-namespace-range]'),
			'Namespace range removal failed'
		);
	}

	for (const host of container.querySelectorAll('[data-keyed-spreads]')) {
		const rows = [...host.querySelectorAll('li')];
		if (rows.length === 0) continue;
		const input = rows[0].querySelector('input');
		input.value = 'unsaved';
		for (const action of ['Change ignored key', 'Start', 'Finish', 'Retry']) {
			await click(host, action);
			check(host.querySelector('li') === rows[0], 'Spread key lost retained row identity');
		}
		await click(host, 'Reverse');
		check(host.querySelector('li') === rows[1], 'Spread key did not reorder retained rows');
		check(input.isConnected && input.value === 'unsaved', 'Spread key lost edited input');
		await click(host, 'Clear');
		check(host.querySelectorAll('li').length === 0, 'Spread key removal retained rows');
	}
	const rows = container.querySelector('[data-prop-replacement]');
	check(rows, 'Missing projected rows');
	const retained = rows.querySelectorAll('li')[1];
	await click(rows, 'Replace');
	await click(rows, 'Hover');
	check(rows.querySelector('li[data-lit="true"]') === retained, 'Retained row lost its live prop');
	await click(rows, 'Next hover');
	check(
		rows.querySelector('li[data-lit="true"]')?.textContent === '3',
		'New row lost its live prop'
	);
	await click(rows, 'Clear');
	check(!retained.isConnected, 'Removed row remains connected');
	await click(rows, 'Hover');
	await click(rows, 'Replace');
	check(
		rows.querySelector('li[data-lit="true"]')?.textContent === '2',
		'Reinserted row did not update'
	);
	const projection = container.querySelector('[data-map-projection]');
	check(projection, 'Missing Map projection');
	await click(projection, 'Add row');
	check(projection.querySelector('output').textContent === '2', 'Shared Map count did not update');
	check(projection.querySelector('ul').textContent === 'OneTwo', 'Shared Map rows did not update');
	await click(projection, 'Remove row');
	check(
		projection.querySelector('output').textContent === '1',
		'Shared Map removal did not update'
	);
	check(projection.querySelector('ul').textContent === 'Two', 'Shared Map retained row is stale');
	const tasks = [...container.querySelectorAll('[data-cancelled-catch]')];
	check(tasks.length === 2, 'Missing await or promise-callback task');
	const navigator = globalThis.navigator;
	const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
	try {
		for (const task of tasks)
			for (const reject of [false, true]) {
				const first = Promise.withResolvers();
				const second = Promise.withResolvers();
				let calls = 0;
				Object.defineProperty(navigator, 'clipboard', {
					configurable: true,
					value: { writeText: () => (++calls === 1 ? first.promise : second.promise) }
				});
				await click(task, 'First');
				check(task.querySelector('output').textContent === 'first', 'First optimism missing');
				await click(task, 'Second');
				second.resolve();
				await tick();
				if (reject) first.reject(new Error('Older clipboard failed'));
				else first.resolve();
				await tick();
				check(
					task.querySelector('output').textContent === 'second',
					'Cancelled catch overwrote the current task'
				);
			}
	} finally {
		if (original) Object.defineProperty(navigator, 'clipboard', original);
		else delete navigator.clipboard;
	}
}

/** Keeps the same mounted array output through cancellation and the next successful task. */
export async function verifyArrayRollbackOwnership(container = document) {
	const host = container.querySelector('[data-array-rollback]');
	if (!host) throw new Error('Missing array rollback task');
	const output = host.querySelector('output');
	const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
	const pending = [Promise.withResolvers(), Promise.withResolvers()];
	let calls = 0;
	const check = (condition, message) => {
		if (!condition) throw new Error(message);
	};
	const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
	try {
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: { writeText: () => pending[calls++]?.promise ?? Promise.resolve() }
		});
		check(output.textContent === 'A|B|C', 'Fresh array task state');
		host.querySelector('button').click();
		await tick();
		check(output.textContent === '', 'Optimistic full clear missing');
		host.querySelectorAll('button')[1].click();
		await tick();
		check(
			output.textContent === 'A|B|C|saved',
			'Pending cancellation did not restore original cells before clipboard settlement'
		);
		pending[1].resolve();
		pending[0].resolve();
		await tick();
		check(output.textContent === 'A|B|C|saved', 'Cancelled clear did not restore original cells');
		check(host.querySelector('output') === output, 'Array observer host replaced');
		host.querySelectorAll('button')[1].click();
		await tick();
		check(output.textContent === 'A|B|C|saved|saved', 'Following array task blocked');
		check(calls === 3, 'Array task acquisition count');
	} finally {
		for (const operation of pending) operation.resolve();
		if (original) Object.defineProperty(navigator, 'clipboard', original);
		else delete navigator.clipboard;
	}
}
