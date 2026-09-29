/** Verifies data transforms, shared snapshots, keyed identity, and subsequent task/event reads. */
export async function verifyCollectionProjection(container = document) {
	const host = container.querySelector('[data-collection-projection]');
	const check = (value, message) => {
		if (!value) throw new Error(message);
	};
	check(host, 'Missing collection projection fixture');
	const lists = [...host.querySelectorAll('ul')];
	const nodes = (list) => [...list.querySelectorAll('li')];
	const click = async (label) => {
		[...host.querySelectorAll('button')].find((button) => button.textContent === label).click();
		await new Promise((resolve) => setTimeout(resolve, 0));
	};
	const values = (expected) => {
		for (const list of lists)
			check(
				JSON.stringify(nodes(list).map((node) => node.textContent)) === JSON.stringify(expected),
				'Stale collection order or values: ' + list.outerHTML
			);
	};
	values(['a', 'b']);
	const retained = lists.map((list) => nodes(list)[1]);
	await click('Insert');
	values(['a', 'b', 'c']);
	lists.forEach((list, index) =>
		check(nodes(list)[1] === retained[index], 'Insertion replaced retained child')
	);
	await click('Replace');
	values(['B', 'C', 'D']);
	lists.forEach((list, index) =>
		check(nodes(list)[0] === retained[index], 'Replacement lost retained child')
	);
	const third = lists.map((list) => nodes(list)[1]);
	await click('Sort');
	values(['D', 'C', 'B']);
	lists.forEach((list, index) =>
		check(
			nodes(list)[2] === retained[index] && nodes(list)[1] === third[index],
			'Sort changed child identity'
		)
	);
	await click('Update');
	values(['D', 'C', 'BB']);
	check(host.querySelector('output').textContent === '3', 'Derived count is stale');
	await click('Event');
	check(host.querySelector('small').textContent === 'D,C,BB', 'Event read stale rows');
	await click('Remove');
	values(['D', 'C']);
	retained.forEach((node) => check(!node.isConnected, 'Removed row remains connected'));
	await click('Reinsert');
	values(['D', 'C', 'new']);
	lists.forEach((list, index) =>
		check(
			nodes(list)[2] !== retained[index] && nodes(list)[1] === third[index],
			'Reinsertion reused disposed child or replaced retained child'
		)
	);
	await click('Task');
	check(host.querySelector('small').textContent === 'D,C,new', 'Task read stale rows');
}

/** Checks grouped pattern capture, dependent defaults, and an explicit snapshot across updates. */
export async function verifyDerivedPattern(container = document) {
	const host = container.querySelector('[data-derived-pattern]');
	if (!host) throw new Error('Missing derived-pattern fixture');
	const expectText = (expected) => {
		if (host.querySelector('output').textContent !== expected)
			throw new Error('Stale destructured pattern: ' + host.textContent);
	};
	const click = async (index) => {
		host.querySelectorAll('button')[index].click();
		await new Promise((resolve) => setTimeout(resolve, 0));
	};
	expectText('a,b:2|a,b:|fallback:fallback|a,b|L');
	await click(0);
	expectText('c,d,e:3|c,d:e|next:next|a,b|R');
	await click(1);
	expectText('c,d,e:3|c,d:e|actual:actual|a,b|R');
}
