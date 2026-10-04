/** Verifies finite-plan publication, changed coordinates, retained DOM, and range retirement. */
export async function verifyTimePlanOwnership(container = document) {
	const check = (condition, message) => {
		if (!condition) throw new Error(message);
	};
	const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
	const clockProbe = container.querySelector('[data-time-window-probe]');
	check(clockProbe, 'Missing finite time plan probe');
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
