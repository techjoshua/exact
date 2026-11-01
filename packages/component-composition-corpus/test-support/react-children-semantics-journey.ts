type ChildrenSemanticsApi = Pick<
	typeof import('@exactjs/react-compat'),
	'Children' | 'createElement'
>;

/** Checks public child utilities retain absent-root, empty-slot, callback, output and key-scope contracts. */
export function verifyReactChildrenSemantics(api: ChildrenSemanticsApi): void {
	const check = (value: boolean, message: string) => {
		if (!value) throw new Error('React Children semantics: ' + message);
	};
	check(
		api.Children.count(null) === 0 &&
			api.Children.count(undefined) === 0 &&
			api.Children.count([null, undefined, false]) === 3,
		'absent roots differ from present empty slots'
	);
	for (const callback of [undefined, null, false]) {
		let failed = false;
		try {
			Reflect.apply(api.Children.forEach, api.Children, ['value', callback]);
		} catch {
			failed = true;
		}
		check(failed, 'invalid callback remains rejected for present children');
	}

	const visited: unknown[] = [];
	const receiver = { label: 'receiver' };
	api.Children.forEach(
		[null, false, undefined, 'value'],
		function (this: typeof receiver, value, index) {
			visited.push([value, index, this.label]);
		},
		receiver
	);
	check(
		JSON.stringify(visited) ===
			JSON.stringify([
				[null, 0, 'receiver'],
				[null, 1, 'receiver'],
				[null, 2, 'receiver'],
				['value', 3, 'receiver']
			]),
		'empty callback slots and receiver'
	);
	const mapped = api.Children.map(
		[null, false, undefined, 'value'],
		function (this: typeof receiver, value, index) {
			return this.label + ':' + index + ':' + String(value);
		},
		receiver
	);
	check(
		mapped?.join(',') === 'receiver:0:null,receiver:1:null,receiver:2:null,receiver:3:value',
		'mapping callback order and receiver'
	);
	let called = 0;
	api.Children.forEach(null, () => called++);
	check(
		called === 0 && api.Children.map(null, () => called++) === null,
		'absent root does not invoke callbacks'
	);
	const first = api.createElement('i', { key: 'same' }),
		second = api.createElement('b', { key: 'same' });
	const flattened = api.Children.toArray([[first], [second]]);
	check(
		(flattened[0] as { key: string }).key === '.0:$same' &&
			(flattened[1] as { key: string }).key === '.1:$same',
		'flattened keys retain group scopes'
	);
	check(
		first.key === 'same' &&
			second.key === 'same' &&
			(flattened[0] as { props: unknown }).props === first.props,
		'input elements and props stay owned by caller'
	);
	const escaped = api.Children.toArray([api.createElement('i', { key: 'a:b=c' })]);
	check((escaped[0] as { key: string }).key === '.$a=2b=0c', 'key separators remain unambiguous');
	const output = api.Children.map(['a', 'b'], (value) =>
		value === 'a' ? ['first', ['second']] : null
	);
	check(output?.join(',') === 'first,second', 'mapped arrays flatten and omit null results');
	const bool = api.Children.map(['value'], () => false);
	check(bool?.[0] === false, 'direct false callback results retained');
	const plain = { field: 'data' };
	check(
		api.Children.map(['value'], () => plain)?.[0] === plain,
		'direct mapped values retain identity'
	);
	const replacements = api.Children.map([first], () => api.createElement('b', { key: 'new' }));
	check(replacements?.[0]?.key === 'new/.$same', 'replacement keys include original scope');
	const expanded = api.Children.map([first], () => [api.createElement('b', { key: 'new' })]);
	check(
		(expanded?.[0] as { key: string }).key === '.$same/.$new',
		'mapped array scope includes its input slot'
	);
	const dropped = api.Children.map(['value'], () => [null, false, undefined, '']);
	check(
		dropped?.length === 1 && dropped[0] === '',
		'mapped array empty slots omitted but empty strings retained'
	);
	let failure: unknown;
	const primary = new Error('mapping callback');
	try {
		api.Children.map(['first', 'second'], () => {
			throw primary;
		});
	} catch (error) {
		failure = error;
	}
	check(failure === primary, 'callback failure identity retained');
	const invalid = Object.create(null);
	let rejected = false;
	try {
		api.Children.count([invalid]);
	} catch (error) {
		rejected = error instanceof TypeError;
	}
	check(rejected, 'invalid source objects rejected');
}
