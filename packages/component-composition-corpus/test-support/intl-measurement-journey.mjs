/** Preserves writable measurement observations while rejecting retired and reentrant environment revisions. */
export function verifyIntlMeasurementOwnership({
	createIntlEnvironment,
	resolveIntlMeasurementPresentation,
	convertIntlMeasurementValue,
	formatIntlMeasurementValue,
	captureReactiveMutations,
	intlLocaleMetadata
}) {
	const request = {
		quantity: 'temperature',
		usage: 'weather',
		sourceUnit: 'celsius',
		convertTo: 'fahrenheit',
		values: [20],
		options: { maximumFractionDigits: 1 }
	};
	const environment = createIntlEnvironment({ locale: 'en-US' });
	const first = resolveIntlMeasurementPresentation(environment, request);
	first.options.maximumFractionDigits = 2;
	first.destinationUnits = ['celsius'];
	if (
		request.options.maximumFractionDigits !== 1 ||
		convertIntlMeasurementValue(first, 20) !== 20 ||
		!formatIntlMeasurementValue(first, 20).includes('20')
	)
		throw new Error('Intl ordinary presentation observations');
	const retired = resolveIntlMeasurementPresentation(environment, request);
	const generation = environment.state.generation;
	environment.setLocale('de-DE');
	environment.state.generation = generation;
	let rejected = false;
	try {
		formatIntlMeasurementValue(retired, 20);
	} catch {
		rejected = true;
	}
	if (!rejected) throw new Error('Intl restored counter revision fence');
	const direct = resolveIntlMeasurementPresentation(environment, request);
	environment.state.locale = 'fr-FR';
	environment.state.locale = 'de-DE';
	rejected = false;
	try {
		formatIntlMeasurementValue(direct, 20);
	} catch {
		rejected = true;
	}
	if (!rejected) throw new Error('Intl direct locale revision fence');
	const next = resolveIntlMeasurementPresentation(environment, request);
	if (!formatIntlMeasurementValue(next, 20)) throw new Error('Intl revised presentation recovery');
	rejected = false;
	try {
		resolveIntlMeasurementPresentation(environment, {
			...request,
			options: {
				get maximumFractionDigits() {
					environment.setLocale('en-US');
					return 1;
				}
			}
		});
	} catch {
		rejected = true;
	}
	if (!rejected) throw new Error('Intl reentrant publication fence');
	const rollbackPresentation = resolveIntlMeasurementPresentation(environment, request);
	const journal = captureReactiveMutations(() => environment.setLocale('fr-FR'));
	journal.rollback();
	rejected = false;
	try {
		formatIntlMeasurementValue(rollbackPresentation, 20);
	} catch {
		rejected = true;
	}
	if (!rejected) throw new Error('Intl rollback revision fence');
	for (const name of ['not-a-unit', 'constructor', 'toString', '__proto__']) {
		let rejected = false;
		try {
			resolveIntlMeasurementPresentation(environment, {
				...request,
				sourceUnit: name,
				convertTo: name
			});
		} catch {
			rejected = true;
		}
		if (!rejected) throw new Error('Intl finite unit presentation authority');
		rejected = false;
		try {
			convertIntlMeasurementValue({ ...next, sourceUnit: name, destinationUnits: [name] }, 20);
		} catch {
			rejected = true;
		}
		if (!rejected) throw new Error('Intl finite identity conversion authority');
	}
	const metadata = intlLocaleMetadata('en-US');
	metadata.lang = 'observation';
	metadata.dir = 'rtl';
	if (intlLocaleMetadata('en-US').lang !== 'en-US')
		throw new Error('Intl independent locale metadata');
	let calls = 0;
	const facade = createIntlEnvironment({ locale: 'en-US' });
	facade.setLocale = (locale) => {
		calls++;
		facade.state.locale = locale;
	};
	facade.setLocale('fr-FR');
	if (calls !== 1 || facade.state.locale !== 'fr-FR')
		throw new Error('Intl ordinary environment method dispatch');
	return true;
}

/** Exercises copied policy observations, inherited scopes, reentrancy, and transactional preference ownership. */
export function verifyIntlPolicyOwnership({
	createIntlEnvironment,
	captureReactiveMutations,
	watch,
	flushSync
}) {
	const units = ['foot', 'inch'];
	const input = { 'length/person-height': units };
	const first = createIntlEnvironment({ locale: 'en-US', unitPreferences: input });
	const second = createIntlEnvironment({ locale: 'en-US', unitPreferences: input });
	units[0] = 'meter';
	if (
		first.unitPreferences['length/person-height'][0] !== 'foot' ||
		second.unitPreferences['length/person-height'][0] !== 'foot'
	)
		throw new Error('Intl caller policy array isolation');
	const observation = first.unitPreferences;
	observation['length/person-height'][0] = 'meter';
	observation['length/road'] = 'mile';
	if (
		first.unitPreferences['length/person-height'][0] !== 'foot' ||
		first.unitPreferences['length/road'] !== undefined
	)
		throw new Error('Intl independent policy observations');
	const french = first.forLocale('fr-FR');
	const german = first.forLocale('de-DE');
	let reads = 0;
	first.setUnitPreferences({
		get 'length/road'() {
			reads++;
			return reads === 1 ? 'meter' : 'foot';
		}
	});
	if (
		reads !== 1 ||
		[first, french, german].some((scope) => scope.unitPreferences['length/road'] !== 'meter')
	)
		throw new Error('Intl captured scoped policy');
	const seen = [];
	const stop = watch(() =>
		seen.push(`${first.unitPreferences['length/road']}/${german.unitPreferences['length/road']}`)
	);
	try {
		first.setUnitPreferences({ 'length/road': 'mile' });
		flushSync();
		if (seen.join(',') !== 'meter/meter,mile/mile')
			throw new Error('Intl coherent policy publication');
	} finally {
		stop();
	}
	const journal = captureReactiveMutations(() =>
		first.setUnitPreferences({ 'length/road': 'kilometer' })
	);
	journal.rollback();
	if ([first, french, german].some((scope) => scope.unitPreferences['length/road'] !== 'mile'))
		throw new Error('Intl owned policy rollback');
	let changed = false;
	french.setUnitPreferences = () => {
		if (!changed) {
			changed = true;
			first.setUnitPreferences({ 'length/road': 'foot' });
		}
	};
	first.setUnitPreferences({ 'length/road': 'meter' });
	if (
		first.unitPreferences['length/road'] !== 'foot' ||
		german.unitPreferences['length/road'] !== 'foot'
	)
		throw new Error('Intl superseded policy propagation');
	german.setUnitPreferences({ 'length/road': 'mile' });
	first.setUnitPreferences({ 'length/road': 'foot' });
	if (german.unitPreferences['length/road'] !== 'foot')
		throw new Error('Intl unchanged parent policy propagation');
	const failure = { reason: 'policy scope' };
	german.setUnitPreferences = () => {
		throw failure;
	};
	let rejected = false;
	try {
		first.setUnitPreferences({ 'length/road': 'kilometer' });
	} catch (error) {
		rejected = error === failure;
	}
	if (!rejected || first.unitPreferences['length/road'] !== 'foot')
		throw new Error('Intl failed policy update rollback');
	return true;
}

/** Keeps accepted catalog snapshots, replay history, and scoped updates transactional. */
export function verifyIntlCatalogOwnership({
	createIntlEnvironment,
	registerIntlArtifacts,
	snapshotIntlArtifacts,
	captureReactiveMutations
}) {
	const descriptor = {
		protocol: 1,
		owner: 'runtime-catalog-ownership',
		occurrenceId: 'Greeting:0',
		contract: 'runtime-catalog-contract'.padEnd(43, 'x'),
		key: '47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU',
		sourceLocale: 'en-US',
		target: { kind: 'content' },
		bindings: [],
		source: [{ kind: 'text', value: 'Hello' }],
		capabilities: []
	};
	const catalog = (value) => ({
		protocol: 1,
		locale: 'fr',
		owner: descriptor.owner,
		messages: { [descriptor.key]: [{ kind: 'text', value }] }
	});
	const read = (environment) => environment.find(descriptor.owner, descriptor.key)?.[0]?.value;
	const generation = snapshotIntlArtifacts().revision * 4 + 1;
	const moduleId = 'runtime-catalog-ownership';
	const environment = createIntlEnvironment({ locale: 'fr', descriptors: [descriptor] });
	try {
		const input = catalog('Bonjour');
		environment.addCatalog(input);
		input.messages[descriptor.key][0].value = 'Changed';
		registerIntlArtifacts(moduleId, generation, [descriptor], []);
		if (read(environment) !== 'Bonjour') throw new Error('Intl owned catalog input history');
		let rejected = false;
		try {
			environment.addCatalog({});
		} catch {
			rejected = true;
		}
		if (!rejected) throw new Error('Intl invalid catalog rejection');
		registerIntlArtifacts(moduleId, generation + 1, [descriptor], []);
		if (read(environment) !== 'Bonjour') throw new Error('Intl rejected catalog replay poison');
		const journal = captureReactiveMutations(() => environment.addCatalog(catalog('Temporary')));
		journal.rollback();
		if (read(environment) !== 'Bonjour') throw new Error('Intl catalog rollback');
		registerIntlArtifacts(moduleId, generation + 2, [descriptor], []);
		if (read(environment) !== 'Bonjour') throw new Error('Intl catalog replay rollback');
		const child = environment.forLocale('fr-CA');
		const failure = { reason: 'catalog scope' };
		child.addCatalog = () => {
			throw failure;
		};
		rejected = false;
		try {
			environment.addCatalog(catalog('Failed'));
		} catch (error) {
			rejected = error === failure;
		}
		if (!rejected || read(environment) !== 'Bonjour')
			throw new Error('Intl failed scoped catalog publication');
	} finally {
		registerIntlArtifacts(moduleId, generation + 3, [], []);
	}
	return true;
}

/** Preserves lazy generated sources and explicit/manual source priorities in retained locale scopes. */
export function verifyIntlScopedSources({
	createIntlEnvironment,
	registerIntlArtifacts,
	snapshotIntlArtifacts
}) {
	const descriptor = {
		protocol: 1,
		owner: 'runtime-scoped-sources',
		occurrenceId: 'Greeting:0',
		contract: 'runtime-scoped-contract'.padEnd(43, 'x'),
		key: '47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU',
		sourceLocale: 'en-US',
		target: { kind: 'content' },
		bindings: [],
		source: [{ kind: 'text', value: 'Hello' }],
		capabilities: []
	};
	const catalog = (value) => ({
		protocol: 1,
		locale: 'fr',
		owner: descriptor.owner,
		messages: { [descriptor.key]: [{ kind: 'text', value }] }
	});
	const read = (environment) => environment.find(descriptor.owner, descriptor.key)?.[0]?.value;
	const generation = snapshotIntlArtifacts().revision * 4 + 1,
		moduleId = 'runtime-scoped-sources';
	const root = createIntlEnvironment({ locale: 'en-US' }),
		french = root.forLocale('fr-FR'),
		canadian = french.forLocale('fr-CA');
	const explicit = createIntlEnvironment({
		locale: 'en-US',
		descriptors: [descriptor],
		catalogs: [catalog('Configured')]
	}).forLocale('fr-FR');
	try {
		registerIntlArtifacts(moduleId, generation, [descriptor], [catalog('Bonjour')]);
		if (read(french) !== 'Bonjour' || read(canadian) !== 'Bonjour')
			throw new Error('Intl retained scope lazy sources');
		registerIntlArtifacts(moduleId, generation + 1, [descriptor], [catalog('Salut')]);
		if (read(french) !== 'Salut' || root.forLocale('fr-FR') !== french)
			throw new Error('Intl retained scope generated refresh');
		french.addCatalog(catalog('Scoped'));
		registerIntlArtifacts(moduleId, generation + 2, [descriptor], [catalog('Generated')]);
		if (read(french) !== 'Scoped' || read(explicit) !== 'Configured')
			throw new Error('Intl scoped source priority');
	} finally {
		registerIntlArtifacts(moduleId, generation + 3, [], []);
	}
	return true;
}
