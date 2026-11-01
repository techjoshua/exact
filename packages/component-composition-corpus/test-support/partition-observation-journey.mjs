/** Checks ordinary partition snapshots while live marker validation retains its authority. */
export function verifyPartitionObservations({ inspect }) {
	const container = document.createElement('main');
	const marker = (edge, generation = 1, build = 'build-1', children = '') =>
		`<span data-exact-partition-version="1" data-exact-partition-build="${build}" data-exact-partition-root="page" data-exact-partition-edge="${edge}" data-exact-partition-owner="owner" data-exact-partition-discriminator="single" data-exact-partition-generation="${generation}">${children}</span>`;
	container.innerHTML =
		marker('outer', 1, 'build-1', marker('inner')) +
		marker('wrong-build', 1, 'other-build') +
		marker('zero-generation', 0);
	const options = { executionRoot: 'page', buildKey: 'build-1' };
	const check = (value, message) => {
		if (!value) throw new Error('Partition observation: ' + message);
	};
	const first = inspect(container, options);
	check(
		first.length === 1 && first[0].plan === 'outer' && first[0].children[0].plan === 'inner',
		'valid nested markers and invalid controls'
	);
	first[0].plan = 'changed snapshot';
	first[0].discriminator.kind = 'changed snapshot';
	first[0].children.length = 0;
	first.length = 0;
	const next = inspect(container, options);
	check(
		next.length === 1 &&
			next[0].plan === 'outer' &&
			next[0].discriminator.kind === 'single' &&
			next[0].children[0].plan === 'inner',
		'alias mutations do not change live markers or later snapshots'
	);
	container.firstElementChild.setAttribute('data-exact-partition-generation', '0');
	const current = inspect(container, options);
	check(
		current.length === 1 && current[0].plan === 'inner',
		'later inspection revalidates marker generation'
	);
	return true;
}
