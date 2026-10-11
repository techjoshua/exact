/** Checks eager descendants, shared ancestor loading, retained ranges, notification delivery and disposal. */
export async function verifyDormantIslandActivation(api) {
	const equal = (actual, expected, message) => {
		if (actual !== expected) throw new Error(message);
	};
	for (const [count, removePending] of [
		[1, false],
		[2, false],
		[2, true]
	]) {
		const container = document.createElement('main');
		const children = Array.from(
			{ length: count },
			(_, index) =>
				`<div data-exact-client-boundary="hover-${index}" data-exact-client-name="Hover${index}" data-exact-client-hydration="eager"><button data-exact-id="hover-button">Hover</button></div>`
		).join('');
		const html = `<div data-exact-client-boundary="shell" data-exact-client-name="Shell" data-exact-client-hydration="interaction" data-exact-client-props='{"props":{"children":{"__exactServerSlot":"shell:children"}}}'><section><span data-exact-server-slot="shell:children" style="display: contents;">${children}</span></section></div>`;
		container.innerHTML = html;
		document.body.append(container);
		let buttons = [...container.querySelectorAll('button')];
		let section = container.querySelector('section');
		let slot = container.querySelector('[data-exact-server-slot]');
		const loaded = [];
		const reports = [];
		let release;
		const parent = new Promise((resolve) => {
			release = resolve;
		});
		api.reset();
		const islands = {
			Shell: api.lazyClientIsland(
				async () => {
					loaded.push('parent');
					await parent;
					return api.Shell;
				},
				{
					mode: 'interaction',
					reasons: [],
					targets: [{ id: 'shell-select', events: [{ type: 'change', replay: 'latest-value' }] }]
				}
			)
		};
		for (let index = 0; index < count; index++)
			islands[`Hover${index}`] = api.lazyClientIsland(async () => {
				loaded.push(`child-${index}`);
				return api.Hover;
			});
		let client;
		try {
			client = api.createExactClient(container, {
				islands,
				onErrorReport: (report) => reports.push(report),
				onDiagnostic: (report) => reports.push(report)
			});
			let settled = false;
			const ready = client.whenSettled().then(() => {
				settled = true;
			});
			await Promise.resolve();
			equal(loaded.join(','), 'parent', 'Eager siblings must share one pending ancestor load');
			equal(settled, false, 'Settlement must wait for ancestor and child adoption');
			buttons[0].click();
			equal(api.read(), 0, 'Unrelated events must not deliver hover notifications');
			if (removePending) container.replaceChildren();
			release();
			await ready;
			if (removePending) {
				equal(loaded.join(','), 'parent', 'Removed ancestor must fence pending descendant loads');
				for (const button of buttons) button.dispatchEvent(new MouseEvent('mouseenter'));
				equal(api.read(), 0, 'Removed pending ancestor activated a detached child');
				container.innerHTML = html;
				buttons = [...container.querySelectorAll('button')];
				section = container.querySelector('section');
				slot = container.querySelector('[data-exact-server-slot]');
				client.registerComponents({ islands });
				await client.whenSettled();
			}

			equal(
				loaded.join(','),
				['parent', ...Array.from({ length: count }, (_, index) => `child-${index}`)].join(','),
				'Eager descendants must load after the ancestor'
			);
			equal(
				container.querySelector('section'),
				section,
				'Ancestor adoption replaced its server DOM'
			);
			equal(
				container.querySelector('[data-exact-server-slot]'),
				slot,
				'Ancestor adoption replaced its server slot'
			);
			for (let index = 0; index < count; index++)
				equal(
					container.querySelectorAll('button')[index],
					buttons[index],
					'Child adoption replaced its server button'
				);
			for (const expected of [count, count * 2]) {
				for (const button of buttons) button.dispatchEvent(new MouseEvent('mouseenter'));
				await client.whenSettled();
				equal(api.read(), expected, 'Hover notification was lost or delivered twice');
			}
			equal(reports.length, 0, 'Dormant island adoption reported a framework failure');
			client.dispose();
			for (const button of buttons) button.dispatchEvent(new MouseEvent('mouseenter'));
			equal(api.read(), count * 2, 'Disposed hover owner retained its event handler');
		} finally {
			release();
			client?.dispose();
			container.remove();
		}
	}
}
