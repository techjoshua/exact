import { assignmentIdentityCases } from './assignment-identity-journey.mjs';

/** Equal and changed RHS values selected by the shared assignment case table. */
export const authoredAssignmentValues = [
	...new Set(assignmentIdentityCases.map(({ equal }) => (equal ? 1 : 2)))
];

/** Runs the same authored replacement journey against mounted or hydrated compiler output. */
export function verifyAuthoredAssignment(api, value, html) {
	const check = (condition, message) => {
		if (!condition) throw new Error('Authored assignment: ' + message);
	};
	const replacement = { value };
	const rows = [replacement];
	const host = document.createElement('div');
	const container = document.createElement('main');
	host.append(container);
	const reports = [];
	let owner;
	let stop;
	let mounted;
	const root = api.assignmentIdentityRoot(replacement, rows);
	try {
		container.innerHTML = html ?? '';
		// The server bootstrap belongs beside the application root, outside its owned DOM.
		const bootstrap = container.querySelector('script#__exact_hydration');
		if (bootstrap) host.append(bootstrap);
		const retained = container.querySelector('section');
		mounted = api.mount(root, container, (report) => reports.push(report));
		owner = api.owner();
		check(owner, 'mounted owner');
		if (html !== undefined)
			check(container.querySelector('section') === retained, 'SSR host adoption');
		const old = [owner.state.item, owner.state.branch.item];
		const oldRows = [owner.state.rows, owner.state.branch.rows];
		const seen = [];
		stop = api.watch(() => {
			seen.push([
				owner.state.item.value,
				owner.state.branch.item.value,
				owner.state.rows[0].value,
				owner.state.branch.rows[0].value
			]);
		});
		container.querySelector('button').click();
		api.flushSync();
		check(api.unwrap(owner.state.item) === replacement, 'indexed object RHS storage');
		check(api.unwrap(owner.state.branch.item) === replacement, 'general object RHS storage');
		check(api.unwrap(owner.state.rows) === rows, 'indexed array RHS storage');
		check(api.unwrap(owner.state.branch.rows) === rows, 'general array RHS storage');
		check(
			api.unwrap(owner.state.rows) === api.unwrap(owner.state.branch.rows),
			'shared array RHS storage'
		);
		check(api.unwrap(owner.state.rows) !== api.unwrap(oldRows[0]), 'distinct array replacement');
		check(api.unwrap(owner.state.rows[0]) === replacement, 'normalized shared nested RHS');
		check(
			old.every((item) => item.value === 1),
			'old object aliases'
		);
		check(
			oldRows.every((rows) => rows[0].value === 1),
			'old array aliases'
		);
		check(
			seen.length === 2 && seen[1].every((item) => item === value),
			'replacement observer delivery'
		);
		owner.state.item.value = 3;
		api.flushSync();
		check(
			[...container.querySelectorAll('output')].every((node) => node.textContent === '3:3'),
			'next nested update'
		);
		for (const item of old) item.value = 4;
		for (const rows of oldRows) rows[0].value = 5;
		api.flushSync();
		check(seen.length === 3 && seen[2].every((item) => item === 3), 'observer migration');
		check(api.owner() === owner, 'owner survives replacement');
		stop();
		stop = undefined;
		api.release(container, mounted);
		mounted = undefined;
		check(container.childNodes.length === 0, 'DOM cleanup');
		owner.state.item.value = 6;
		api.flushSync();
		check(seen.length === 3 && container.childNodes.length === 0, 'disposed subscriptions');
		check(reports.length === 0, 'unexpected framework reports');
	} finally {
		stop?.();
		if (mounted) api.release(container, mounted);
		host.remove();
	}
}
