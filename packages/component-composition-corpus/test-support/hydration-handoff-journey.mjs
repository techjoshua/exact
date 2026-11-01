/** Checks packaged adoption, permitted recovery and authority with raw observations before assertions. */
export async function verifyHydrationHandoff(
	mountPage,
	html,
	record,
	modes = ['adopt', 'recover', 'valid-recover', 'stale-recover', 'unreferenced-recover']
) {
	for (const mode of modes) {
		const root = document.createElement('div');
		root.innerHTML = html;
		document.body.append(root);
		let instance;
		const originalList = root.querySelector('.handoff-items'),
			originalButton = root.querySelector('button'),
			slot = root.querySelector('[data-exact-server-slot]'),
			boundary = root.querySelector('[data-exact-client-boundary]');
		if (!boundary)
			throw new Error('Fixture must expose an independent package resumption boundary');
		if (mode === 'valid-recover' || mode === 'stale-recover') {
			const id = slot.getAttribute('data-exact-server-slot');
			for (const [name, value] of Object.entries({
				version: '1',
				build: 'build-1',
				root: 'page',
				edge: id,
				owner: 'fixture',
				discriminator: 'single',
				generation: '1'
			}))
				slot.setAttribute('data-exact-partition-' + name, value);
			const payload = JSON.parse(boundary.getAttribute('data-exact-client-props'));
			payload.props.children = {
				__exactServerSlot: id,
				planVersion: 1,
				buildKey: mode === 'stale-recover' ? 'stale' : 'build-1',
				executionRoot: 'page',
				planEdgeId: id,
				ownerComponentId: 'fixture',
				discriminator: { kind: 'single' },
				generation: 1
			};
			boundary.setAttribute('data-exact-client-props', JSON.stringify(payload));
		}
		if (mode !== 'adopt') {
			const old = root.querySelector('.handoff-fold'),
				replacement = document.createElement('article');
			for (const a of old.attributes) replacement.setAttribute(a.name, a.value);
			replacement.append(...old.childNodes);
			old.replaceWith(replacement);
		}
		if (mode === 'unreferenced-recover') {
			const orphan = document.createElement('span');
			orphan.setAttribute('data-exact-server-slot', 'unreferenced');
			orphan.textContent = 'Unreferenced content';
			boundary.append(orphan);
		}
		const originalShell = root.querySelector('.handoff-fold'),
			originalBody = root.querySelector('.handoff-body');
		const replaceChildren = boundary.replaceChildren;
		let recoveryCalls = 0;
		boundary.replaceChildren = function (...nodes) {
			recoveryCalls++;
			return replaceChildren.apply(this, nodes);
		};
		const before = root.innerHTML,
			events = [],
			errors = [];
		await record(mode + '-before', { html: before });
		try {
			instance = mountPage(root, {
				onHydration: (event) => events.push(event),
				onErrorReport: (report) => errors.push(String(report))
			});
			await instance.whenSettled();
			const hydrated = root.innerHTML,
				button = root.querySelector('button');
			button.click();
			await instance.whenSettled();
			const opened = root.innerHTML;
			button.click();
			button.click();
			await instance.whenSettled();
			const result = {
				before,
				hydrated,
				opened,
				reopened: root.innerHTML,
				events,
				errors,
				count: root.querySelectorAll('.handoff-items>li').length,
				sameList: root.querySelector('.handoff-items') === originalList,
				sameButton: button === originalButton,
				sameShell: root.querySelector('.handoff-fold') === originalShell,
				sameBody: root.querySelector('.handoff-body') === originalBody,
				sameSlot: root.querySelector('[data-exact-server-slot]') === slot,
				recoveryCalls,
				expanded: button.getAttribute('aria-expanded')
			};
			await record(mode, result);
			if (
				errors.length ||
				events[0]?.outcome !== (mode === 'adopt' ? 'adopted' : 'mounted') ||
				result.count !== (mode === 'stale-recover' ? 0 : 3) ||
				result.expanded !== 'true'
			)
				throw new Error('Hydration handoff failed: ' + mode + ' ' + JSON.stringify(result));
			if (
				mode === 'adopt' &&
				(!result.sameList ||
					!result.sameButton ||
					!result.sameShell ||
					!result.sameBody ||
					!result.sameSlot ||
					result.recoveryCalls !== 0)
			)
				throw new Error('Strict adoption replaced the target or supplied list');
			if (mode !== 'adopt' && result.recoveryCalls !== 1)
				throw new Error('Expected the existing mismatch recovery once');
			if (root.querySelector('[data-exact-server-slot="unreferenced"]'))
				throw new Error('Unreferenced server range survived recovery');
			instance.dispose();
			instance = undefined;
			const accepted = button.getAttribute('aria-expanded');
			button.click();
			if (button.getAttribute('aria-expanded') !== accepted)
				throw new Error('Disposed fold received another interaction');
		} finally {
			instance?.dispose();
			delete boundary.replaceChildren;
			root.remove();
		}
	}
}
