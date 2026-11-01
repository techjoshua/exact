/** Checks captured protocol values and validation of every generated array entry. */
export function verifyIntlProtocolValues({
	validateIntlRuntimeDescriptor,
	validateIntlCatalog,
	prepareIntlActivation,
	registerIntlArtifacts,
	canonicalizeIntlValue
}) {
	const descriptor = protocolDescriptor();
	const { key } = descriptor;
	let reads = 0;
	const binding = {
		index: 0,
		type: 'number',
		get kind() {
			return ++reads === 1 ? 'value' : 'unsupported';
		}
	};
	const captured = validateIntlRuntimeDescriptor({ ...descriptor, bindings: [binding] });
	if (reads !== 1 || captured.bindings[0].kind !== 'value')
		throw new Error('Intl must publish the binding kind it validated');
	const reject = (run) => {
		let rejected = false;
		try {
			run();
		} catch {
			rejected = true;
		}
		if (!rejected) throw new Error('Intl accepted invalid protocol data');
	};
	reject(() =>
		validateIntlRuntimeDescriptor({
			...descriptor,
			bindings: [{ index: 0, type: 'number', kind: { toString: () => 'value' } }]
		})
	);
	reject(() => validateIntlRuntimeDescriptor({ ...descriptor, source: Array(1) }));
	reject(() =>
		validateIntlCatalog(
			{ protocol: 1, locale: 'fr', owner: descriptor.owner, messages: { [key]: Array(1) } },
			[descriptor]
		)
	);
	const invalid = [{ protocol: 'invalid' }];
	Object.defineProperty(invalid, 'map', { value: () => [] });
	reject(() => registerIntlArtifacts('capture-invalid-journey', 1, invalid, []));
	const values = ['actual'];
	Object.defineProperty(values, 'map', { value: () => ['invalid JSON'] });
	if (canonicalizeIntlValue(values) !== '["actual"]')
		throw new Error('Intl serialized caller-owned map output');
	reject(() => canonicalizeIntlValue(Array(1)));
	const structural = {
		...descriptor,
		bindings: [{ index: 0, kind: 'element', type: 'structure', exactlyOnce: true }],
		source: [{ kind: 'element', binding: 0, value: [] }],
		capabilities: ['element']
	};
	let iterations = 0;
	const factory = () => undefined;
	const structures = [factory];
	Object.defineProperty(structures, Symbol.iterator, {
		value: function* () {
			yield ++iterations === 1 ? factory : 42;
		}
	});
	if (
		prepareIntlActivation(structural, [], structures).structures[0] !== factory ||
		iterations !== 0
	)
		throw new Error('Intl must publish the structure entries it validated');
	return true;
}

/** Creates fresh compiler-style protocol data shared by capture and budget controls. */
function protocolDescriptor(overrides = {}) {
	const key = '47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU';
	return {
		protocol: 1,
		owner: 'capture-journey',
		occurrenceId: 'capture:0',
		contract: key,
		key,
		sourceLocale: 'en-US',
		target: { kind: 'content' },
		bindings: [{ index: 0, kind: 'value', type: 'number' }],
		source: [{ kind: 'value', binding: 0 }],
		capabilities: [],
		...overrides
	};
}

/** Checks stable finite budgets and normalized publication bounds at both artifact entry points. */
export function verifyIntlValidationLimits({ validateIntlRuntimeDescriptor, validateIntlCatalog }) {
	const descriptor = protocolDescriptor({ bindings: [], source: [{ kind: 'text', value: 'x' }] });
	const validated = validateIntlRuntimeDescriptor(descriptor);
	const catalog = {
		protocol: 1,
		locale: 'fr',
		owner: descriptor.owner,
		messages: { [descriptor.key]: [{ kind: 'text', value: 'x' }] }
	};
	const reject = (run, Constructor = RangeError) => {
		let rejected = false;
		try {
			run();
		} catch (error) {
			if (!(error instanceof Constructor)) throw error;
			rejected = true;
		}
		if (!rejected) throw new Error('Intl validation did not enforce its configured bound');
	};
	for (const field of ['maxDepth', 'maxNodes', 'maxTextLength']) {
		for (const value of [
			NaN,
			Infinity,
			-Infinity,
			-1,
			1.5,
			Number.MAX_SAFE_INTEGER + 1,
			null,
			'1',
			true
		]) {
			reject(() => validateIntlRuntimeDescriptor(descriptor, { [field]: value }));
			reject(() => validateIntlCatalog(catalog, [validated], { [field]: value }));
		}
		validateIntlRuntimeDescriptor(descriptor, { [field]: undefined });
		validateIntlCatalog(catalog, [validated], { [field]: undefined });
	}
	for (const field of ['maxDepth', 'maxNodes', 'maxTextLength']) {
		reject(() =>
			validateIntlRuntimeDescriptor(protocolDescriptor({ bindings: [], source: [] }), {
				[field]: NaN
			})
		);
		reject(() => validateIntlCatalog({ ...catalog, messages: {} }, [], { [field]: NaN }));
	}
	const zero = { maxDepth: 0, maxNodes: 0, maxTextLength: 0 };
	validateIntlRuntimeDescriptor(protocolDescriptor({ bindings: [], source: [] }), zero);
	validateIntlCatalog({ ...catalog, messages: {} }, [], zero);
	for (const field of ['maxNodes', 'maxTextLength']) {
		reject(() => validateIntlRuntimeDescriptor(descriptor, { [field]: 0 }), TypeError);
		reject(() => validateIntlCatalog(catalog, [validated], { [field]: 0 }), TypeError);
	}
	validateIntlRuntimeDescriptor(descriptor, { maxDepth: 0, maxNodes: 1, maxTextLength: 1 });
	const expanded = { ...descriptor, source: [{ kind: 'text', value: '\u0344' }] };
	reject(() => validateIntlRuntimeDescriptor(expanded, { maxTextLength: 1 }), TypeError);
	if (validateIntlRuntimeDescriptor(expanded, { maxTextLength: 2 }).source[0].value.length !== 2)
		throw new Error('Intl normalized length control');
	const changed = { maxNodes: 1 };
	reject(
		() =>
			validateIntlRuntimeDescriptor(
				{
					...descriptor,
					get source() {
						changed.maxNodes = NaN;
						return [
							{ kind: 'text', value: 'a' },
							{ kind: 'text', value: 'b' }
						];
					}
				},
				changed
			),
		TypeError
	);
	if (!Number.isNaN(changed.maxNodes))
		throw new Error('Intl validation changed caller mutation semantics');
	const sibling = validateIntlRuntimeDescriptor({
		...descriptor,
		key: 'A'.repeat(43),
		occurrenceId: 'capture:1'
	});
	const reads = { maxDepth: 0, maxNodes: 0, maxTextLength: 0 };
	const limits = Object.fromEntries(Object.keys(reads).map((key) => [key, 10]));
	for (const key of Object.keys(reads))
		Object.defineProperty(limits, key, {
			get() {
				reads[key]++;
				return 10;
			}
		});
	validateIntlCatalog(
		{
			...catalog,
			messages: { ...catalog.messages, [sibling.key]: [{ kind: 'text', value: 'y' }] }
		},
		[validated, sibling],
		limits
	);
	if (Object.values(reads).some((count) => count !== 1))
		throw new Error('Intl reread caller limits across catalog validation phases');
	return true;
}

/** Checks ordinary registry observations without changing accepted generation membership. */
export function verifyIntlArtifactObservations({ registerIntlArtifacts, snapshotIntlArtifacts }) {
	const moduleId = 'virtual:corpus/intl-observation';
	const generation = snapshotIntlArtifacts().revision + 1;
	const descriptor = protocolDescriptor({
		owner: 'artifact-observation',
		bindings: [],
		source: [{ kind: 'text', value: 'Hello' }]
	});
	registerIntlArtifacts(moduleId, generation, [descriptor], []);
	try {
		const snapshot = snapshotIntlArtifacts();
		const revision = snapshot.revision;
		const count = snapshot.descriptors.length;
		snapshot.revision = -1;
		snapshot.descriptors.length = 0;
		if (snapshot.revision !== -1 || snapshot.descriptors.length !== 0)
			throw new Error('Intl artifact observations must remain ordinary values');
		const next = snapshotIntlArtifacts();
		if (next.revision !== revision || next.descriptors.length !== count)
			throw new Error('An observation changed private generation membership');
		registerIntlArtifacts(moduleId, generation - 1, [], []);
		if (snapshotIntlArtifacts().revision !== revision)
			throw new Error('A stale artifact generation was published');
		let rejected = false;
		try {
			registerIntlArtifacts(moduleId, generation, [], []);
		} catch {
			rejected = true;
		}
		if (!rejected || snapshotIntlArtifacts().revision !== revision)
			throw new Error('Same-generation disagreement changed accepted artifacts');
	} finally {
		registerIntlArtifacts(moduleId, generation + 1, [], []);
	}
}

/** Checks generated data aliases while preserving the module's original observations for later runs. */
export function verifyIntlGeneratedObservations(module) {
	for (const name of ['descriptors', 'catalogs', 'clientRequirements']) {
		const values = module[name];
		const length = values.length;
		try {
			values.length = length + 1;
			if (values.length !== length + 1)
				throw new Error('Generated Intl ' + name + ' rejects ordinary array aliases');
		} finally {
			values.length = length;
		}
	}
	const descriptor = module.descriptors[0];
	if (descriptor) {
		const owner = descriptor.owner;
		try {
			descriptor.owner = 'observed alias';
			if (descriptor.owner !== 'observed alias')
				throw new Error('Generated Intl descriptor rejects ordinary aliases');
		} finally {
			descriptor.owner = owner;
		}
	}
}
