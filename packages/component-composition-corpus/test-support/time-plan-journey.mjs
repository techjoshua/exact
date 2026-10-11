/** Verifies finite-plan publication, changed coordinates, retained DOM, and range retirement. */
export async function verifyTimePlanOwnership(container = document) {
	const check = (condition, message) => {
		if (!condition) throw new Error(message);
	};
	const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
	const clockProbe = container.querySelector('[data-time-window-probe]');
	check(clockProbe, 'Missing finite time plan probe');
	const accuracyProbe = clockProbe.querySelector('[data-time-accuracy-probe]');
	const explicitClock = accuracyProbe?.querySelector('[data-explicit-clock]');
	const taskResult = accuracyProbe?.querySelector('[data-task-result]');
	// Shared task invocation publishes through its settlement edge.
	await tick();
	check(taskResult?.textContent === '2', 'Setup task result lost initial publication');
	for (const expected of ['3', '4']) {
		accuracyProbe.querySelector('[data-task-result-next]').click();
		await tick();
		check(taskResult.textContent === expected, 'Setup task result lost reactive publication');
		check(
			accuracyProbe.querySelector('[data-task-result]') === taskResult,
			'Task result replaced retained DOM'
		);
	}
	check(
		explicitClock?.textContent === '2750',
		'Explicit accuracy lost its initial provider sample'
	);
	accuracyProbe.querySelector('[data-accuracy-advance]').click();
	await tick();
	check(explicitClock.textContent === '4000', 'Reactive explicit accuracy did not advance');
	check(
		accuracyProbe.querySelector('[data-explicit-clock]') === explicitClock,
		'Explicit accuracy replaced retained DOM'
	);
	accuracyProbe.querySelector('[data-accuracy-toggle]').click();
	await tick();
	accuracyProbe.querySelector('[data-accuracy-inspect]').click();
	await tick();
	check(
		accuracyProbe.querySelector('[data-accuracy-timers]').textContent === '0',
		'Disabled explicit accuracy retained a timer'
	);
	accuracyProbe.querySelector('[data-accuracy-advance]').click();
	await tick();
	check(
		explicitClock.textContent === '4000',
		'Disabled explicit accuracy sampled a new clock value'
	);
	accuracyProbe.querySelector('[data-accuracy-toggle]').click();
	await tick();
	check(explicitClock.textContent === '5250', 'Reenabled explicit accuracy did not catch up');
	accuracyProbe.querySelector('[data-accuracy-toggle]').click();
	await tick();
	accuracyProbe.querySelector('[data-accuracy-inspect]').click();
	await tick();
	check(
		accuracyProbe.querySelector('[data-accuracy-timers]').textContent === '0',
		'Explicit accuracy failed final timer release'
	);
	check(
		clockProbe.querySelector('[data-computed-clock-format]').textContent ===
			new Intl.DateTimeFormat('en-US', { second: 'numeric', timeZone: 'UTC' }).format(2750),
		'Computed formatter option key lost native meaning'
	);
	const clockWindow = clockProbe.querySelector('[data-clock-window]');
	check(clockWindow?.textContent === 'inside', 'Provider initial sample was lost');
	const timers = async (expected) => {
		clockProbe.querySelector('[data-clock-inspect]').click();
		await tick();
		check(
			clockProbe.querySelector('[data-clock-timers]').textContent === String(expected),
			'Clock timer ownership failed'
		);
	};
	await timers(1);
	for (const [action, expected] of [
		['late', 'outside'],
		['anchor', 'inside'],
		['boundary', 'outside']
	]) {
		clockProbe.querySelector('[data-clock-' + action + ']').click();
		await tick();
		check(
			clockProbe.querySelector('[data-clock-window]') === clockWindow,
			'Time transition replaced retained DOM'
		);
		check(clockWindow.textContent === expected, 'Finite time transition failed: ' + action);
	}
	clockProbe.querySelector('[data-clock-remove]').click();
	await tick();
	check(!clockProbe.querySelector('[data-clock-window]'), 'Time range survived removal');
	await timers(0);
	clockProbe.querySelector('[data-clock-restore]').click();
	await tick();
	const restored = clockProbe.querySelector('[data-clock-window]');
	check(restored && restored !== clockWindow, 'Removed range identity was reused');
	clockProbe.querySelector('[data-clock-anchor]').click();
	await tick();
	check(restored.textContent === 'inside', 'Restored range did not accept new coordinates');
	await timers(1);
	clockProbe.querySelector('[data-clock-remove]').click();
	await tick();
	check(
		!restored.isConnected && !clockProbe.querySelector('[data-clock-window]'),
		'Restored range survived removal'
	);
	await timers(0);
}
