const cases = [
	{ name: 'plain allowed', selected: 'allowed', state: { allowed: 'published' }, status: 200 },
	{ name: 'plain rejected', selected: 'allowed', state: { forbidden: 'blocked' }, status: 500 },
	{
		name: 'plain nested',
		selected: 'branch.child',
		state: { branch: { child: 'published' } },
		status: 200
	},
	{ name: 'plain wildcard', selected: '*', state: { wildcard: 'published' }, status: 200 },
	{
		name: 'includes cannot grant authority',
		method: 'includes',
		answer: true,
		selected: 'allowed',
		state: { forbidden: 'blocked' },
		status: 500
	},
	{
		name: 'includes cannot remove wildcard authority',
		method: 'includes',
		answer: false,
		selected: '*',
		state: { wildcard: 'published' },
		status: 200
	},
	{
		name: 'some cannot grant ancestor authority',
		method: 'some',
		answer: true,
		selected: 'branch.child',
		state: { other: {} },
		status: 500
	},
	{
		name: 'some cannot remove ancestor authority',
		method: 'some',
		answer: false,
		selected: 'branch.child',
		state: { branch: { child: 'published' } },
		status: 200
	},
	{
		name: 'ignored methods preserve valid data',
		method: 'includes',
		answer: true,
		selected: 'allowed',
		state: { allowed: 'published' },
		status: 200
	}
];
/** Paired valid and unauthorized selections, including ignored non-JSON array metadata. */
export const stateAuthorityCases = cases.map((entry) => entry.name);

/** Checks server publication and hydration selection against the same declared value authority. */
export async function verifyStateAuthority(
	{ handleExactRequest, defineExactOperationContract, mergeStateForContract },
	selectedCase
) {
	for (const scenario of cases.filter(
		(entry) => selectedCase === undefined || entry.name === selectedCase
	)) {
		let calls = 0;
		const paths = [scenario.selected];
		if (scenario.method)
			Object.defineProperty(paths, scenario.method, {
				value() {
					calls++;
					return scenario.answer;
				}
			});
		const writes = [{ path: scenario.selected, kind: 'write', confidence: 'exact' }];
		const contract = {
			version: 1,
			executors: {},
			boundaries: {},
			invocations: {
				save: defineExactOperationContract('save', { writes })
			}
		};
		const response = await handleExactRequest(
			{ method: 'POST', body: { type: 'invoke', id: 'save' } },
			{
				contract,
				invocations: { save: () => ({ state: scenario.state, statePaths: paths }) },
				logger: { isEnabled: () => false, log() {} }
			}
		);
		if (response.status !== scenario.status || calls !== 0)
			throw new Error(
				'State authority: ' + scenario.name + ' consulted metadata or changed authorization'
			);
		const baseline = { retained: 'client' };
		const merged = mergeStateForContract(baseline, scenario.state, { writes }, [], paths);
		if (merged.ok !== (scenario.status === 200) || calls !== 0 || baseline.retained !== 'client')
			throw new Error('State authority: hydration disagreed or changed its source state');
		if (response.status === 200) {
			const body = JSON.parse(response.body);
			if (
				JSON.stringify(body.statePaths) !== JSON.stringify([scenario.selected]) ||
				JSON.stringify(body.state) !== JSON.stringify(scenario.state)
			)
				throw new Error('State authority: published different selected data');
		}
	}
}

/** Checks indexed selection, native array keys, reserved names, and depth-first getter order. */
export function verifyStateAuthorityLookup({ stateNodeMatchesWrites }, count = 2_000) {
	const check = (condition, message) => {
		if (!condition) throw new Error('State lookup: ' + message);
	};
	for (const nested of [false, true]) {
		const state = Object.fromEntries(
			Array.from({ length: count }, (_, index) => [
				'field' + index,
				nested ? { value: index } : index
			])
		);
		const paths = Object.keys(state).map((key) => key + (nested ? '.value' : ''));
		Object.defineProperty(paths, 'includes', {
			value() {
				throw new Error('Authored includes executed');
			}
		});
		Object.defineProperty(paths, 'some', {
			value() {
				throw new Error('Authored some executed');
			}
		});
		Object.defineProperty(paths, Symbol.iterator, {
			value() {
				throw new Error('Authored iterator executed');
			}
		});
		check(stateNodeMatchesWrites(state, '', paths), 'valid selection rejected');
	}
	const reads = [];
	const state = {
		get branch() {
			reads.push('branch');
			return {
				get child() {
					reads.push('child');
					return { leaf: 1 };
				}
			};
		},
		get last() {
			reads.push('last');
			return { leaf: 2 };
		}
	};
	check(
		stateNodeMatchesWrites(state, '', ['branch.child.leaf', 'last.leaf']),
		'nested selection rejected'
	);
	check(reads.join(',') === 'branch,child,last', 'getter evaluation order changed');
	let rejectedReads = 0;
	const rejected = {
		get forbidden() {
			rejectedReads++;
			return {};
		}
	};
	check(
		!stateNodeMatchesWrites(rejected, '', ['allowed']) && rejectedReads === 0,
		'unselected getter executed'
	);
	check(!stateNodeMatchesWrites({ constructor: 1 }, '', ['constructor']), 'reserved name accepted');
	check(
		stateNodeMatchesWrites({ rows: [{ value: 1 }] }, '', ['rows.0.value']),
		'native array selection rejected'
	);
	check(
		!stateNodeMatchesWrites({ rows: Object.assign([1], { extra: 2 }) }, '', ['rows.0']),
		'named array property accepted'
	);
	check(
		!stateNodeMatchesWrites({ 'a.': {} }, '', ['a.b']),
		'literal dotted key acquired ancestor authority'
	);
}

/** Keeps value output and deletion selections under exact, enclosing, or explicit whole-state authority. */
export function verifyStatePathSelections(
	{ stateOutputPathsMatchWrites, stateDeletionPathsMatchWrites },
	count = 2_000
) {
	const check = (condition, message) => {
		if (!condition) throw new Error('State path selection: ' + message);
	};
	const write = (path, fields = {}) => ({ path, kind: 'write', confidence: 'exact', ...fields });
	for (const authorize of [stateOutputPathsMatchWrites, stateDeletionPathsMatchWrites]) {
		check(authorize([], []), 'empty selection rejected');
		check(authorize(['parent.child'], [write('parent')]), 'enclosing write rejected');
		check(
			!authorize(['parent'], [write('parent.child')]),
			'child write authorized enclosing replacement'
		);
		check(!authorize(['parent.other'], [write('parent.child')]), 'sibling write authorized');
		check(!authorize(['parent.childish'], [write('parent.child')]), 'partial segment authorized');
		for (const fields of [
			{ kind: 'read' },
			{ confidence: 'broad' },
			{ confidence: 'unknown' },
			{ operation: 'map' },
			{ operation: 'set' }
		])
			check(
				!authorize(['parent.child'], [write('parent', fields)]),
				'non-value authority accepted'
			);
		check(authorize(['parent.child'], [write('*')]), 'explicit whole-state authority rejected');
		const paths = Array.from({ length: count }, (_, index) => 'field' + index + '.value');
		const writes = paths.map((path) => write(path));
		check(authorize([...paths].reverse(), writes), 'wide independent writes rejected');
		check(
			!authorize([...paths, 'forbidden'], writes),
			'wide selection granted additional authority'
		);
	}
	check(stateOutputPathsMatchWrites(['*'], [write('*')]), 'whole-state output rejected');
	check(!stateDeletionPathsMatchWrites(['*'], [write('*')]), 'whole-state deletion accepted');
}
