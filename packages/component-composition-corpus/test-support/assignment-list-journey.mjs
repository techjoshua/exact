/** Checks authored keyed host identity and durable child ownership across assignment and disposal. */
export async function verifyAssignmentList(api, retained, server) {
	const check = (condition, message) => {
		if (!condition) throw new Error('Authored assignment list: ' + message);
	};
	const container = document.createElement('main');
	document.body.append(container);
	const reports = [];
	const lifecycle = api.lifecycle;
	lifecycle.mounted.length = 0;
	lifecycle.removed.length = 0;
	let started = false;
	let stop;
	try {
		let adopted;
		let draft;
		if (server) {
			container.innerHTML = server.html;
			adopted = container.querySelector('li');
			draft = container.querySelector('input');
			draft.value = 'before hydration';
			draft.focus();
			draft.setSelectionRange(2, 5);
		}
		started = true;
		await api.start(container, retained, server, (report) => reports.push(report));
		api.flushSync();
		const owner = api.owner();
		const row = container.querySelector('li');
		const input = container.querySelector('input');
		const child = lifecycle.mounted[0];
		check(row && child && lifecycle.mounted.length === 1, 'one mounted native child');
		if (server) {
			check(row === adopted && input === draft, 'strict SSR host and input adoption');
			check(input.value === 'before hydration', 'pre-hydration form edit');
			check(
				document.activeElement === input && input.selectionStart === 2 && input.selectionEnd === 5,
				'hydrated focus and selection'
			);
		}
		const oldRows = owner.state.rows;
		const old = oldRows[0];
		const seen = [];
		stop = api.watch(() => seen.push(owner.state.rows[0]?.label));
		input.value = 'local draft';
		input.focus();
		input.setSelectionRange(1, 4);
		const click = (selector) => {
			container.querySelector(selector).click();
			api.flushSync();
		};
		click('[data-interact]');
		check(child.state.clicks === 1, 'initial child interaction');
		click('[data-replace]');
		check(api.owner() === owner, 'durable parent');
		check(api.unwrap(owner.state.rows) !== api.unwrap(oldRows), 'new array storage');
		check(
			(api.unwrap(owner.state.rows[0]) === api.unwrap(old)) === retained,
			'exact retained versus fresh row storage'
		);
		check(old.label === 'A' && oldRows[0] === old, 'old aliases unchanged by replacement');
		const expected = retained ? 'A' : 'B';
		check(container.querySelector('[data-label]').textContent === expected, 'fresh item label');
		check(
			container.querySelector('[data-child-label]').textContent === expected,
			'fresh child prop'
		);
		check(container.querySelector('li') === row, 'same-key host node');
		check(
			container.querySelector('input') === input && input.value === 'local draft',
			'retained form node and edit'
		);
		check(
			document.activeElement === input && input.selectionStart === 1 && input.selectionEnd === 4,
			'retained focus and selection'
		);
		check(
			lifecycle.mounted.length === 1 && lifecycle.removed.length === 0 && child.state.clicks === 1,
			'child stays mounted with local state'
		);
		click('[data-edit]');
		check(
			container.querySelector('[data-label]').textContent === 'C' &&
				container.querySelector('[data-child-label]').textContent === 'C',
			'next nested edit and child prop'
		);
		check(old.label === (retained ? 'C' : 'A'), 'nested edit respects independent alias');
		if (!retained) {
			old.label = 'detached';
			api.flushSync();
			check(
				container.querySelector('[data-label]').textContent === 'C' && seen.length === 3,
				'subscription migrated away from old row'
			);
		}
		click('[data-interact]');
		check(
			child.state.clicks === 2 && container.querySelector('[data-interact]').textContent === '2',
			'next interaction uses original child'
		);
		check(
			container.querySelector('li') === row && lifecycle.mounted.length === 1,
			'nested edit retains host and child'
		);
		click('[data-remove]');
		check(
			!container.querySelector('li') &&
				lifecycle.removed.length === 1 &&
				lifecycle.removed[0] === child,
			'final removal unmounts original child once'
		);
		stop();
		stop = undefined;
		api.release(container);
		started = false;
		api.flushSync();
		check(
			container.childNodes.length === 0 && lifecycle.removed.length === 1,
			'root disposal releases DOM without a second child unmount'
		);
		owner.state.rows = [{ id: 'late', label: 'disposed' }];
		old.label = 'after disposal';
		child.state.clicks++;
		api.flushSync();
		check(
			container.childNodes.length === 0 &&
				lifecycle.mounted.length === 1 &&
				lifecycle.removed.length === 1,
			'disposed owners do not recreate rows or children'
		);
		check(reports.length === 0, 'unexpected framework reports');
		return {
			retained,
			hydrated: Boolean(server),
			mounts: lifecycle.mounted.length,
			unmounts: lifecycle.removed.length,
			reports: reports.length
		};
	} finally {
		stop?.();
		if (started) api.release(container);
		container.remove();
	}
}
