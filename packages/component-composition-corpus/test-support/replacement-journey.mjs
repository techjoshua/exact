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
