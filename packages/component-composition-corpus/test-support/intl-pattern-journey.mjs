/** Exercises ordinary public message plans without sharing private execution data. */
export function verifyIntlPatternObservations({
	createIntlEnvironment,
	projectIntlTranslationContract,
	materializeIntlTranslation,
	validateIntlPackageMetadata
}) {
	const metadataInput = {
		protocol: 1,
		sourceLocale: 'en-us',
		messages: './messages',
		catalogs: { fr: './fr' },
		sourceUnits: { 'length/road': 'mile' }
	};
	const metadata = validateIntlPackageMetadata(metadataInput);
	metadata.sourceLocale = 'fr';
	metadata.catalogs.fr = './other';
	metadata.sourceUnits['length/road'] = 'meter';
	if (
		metadataInput.catalogs.fr !== './fr' ||
		metadataInput.sourceUnits['length/road'] !== 'mile' ||
		validateIntlPackageMetadata(metadataInput).sourceLocale !== 'en-US'
	)
		throw new Error('Intl ordinary independent package metadata');
	const bindings = [
		{ index: 0, kind: 'selector', type: 'boolean' },
		{ index: 1, kind: 'element', type: 'structure', exactlyOnce: true },
		{ index: 2, kind: 'value', type: 'number' },
		{ index: 3, kind: 'opaque', type: 'opaque-structure', name: 'widget', exactlyOnce: true }
	];
	const source = [
		{
			kind: 'element',
			binding: 1,
			value: [
				{
					kind: 'select',
					binding: 0,
					selection: 'boolean',
					cases: [
						{
							key: 'true',
							value: [
								{
									kind: 'format',
									bindings: [2],
									formatter: { kind: 'number', options: { maximumFractionDigits: 2 } }
								}
							]
						}
					],
					fallback: [
						{ kind: 'text', value: 'Fallback' },
						{ kind: 'value', binding: 2 }
					]
				}
			]
		},
		{ kind: 'opaque', binding: 3, name: 'widget' }
	];
	const descriptor = {
		protocol: 1,
		owner: 'pattern-observations',
		occurrenceId: 'Message:0',
		contract: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
		key: '47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU',
		sourceLocale: 'en-US',
		target: { kind: 'content' },
		bindings,
		source,
		capabilities: ['boolean', 'number', 'element', 'opaque']
	};
	const projection = projectIntlTranslationContract(bindings, source);
	const original = JSON.stringify(projection);
	projection.placeholders[0].name = 'observation';
	projection.source[0].value[0].cases[0].value.length = 0;
	if (JSON.stringify(projectIntlTranslationContract(bindings, source)) !== original)
		throw new Error('Intl projection retained input authority');
	const translation = projectIntlTranslationContract(bindings, source).source;
	const environment = createIntlEnvironment({
		locale: 'fr',
		descriptors: [descriptor],
		catalogs: [
			{
				protocol: 1,
				locale: 'fr',
				owner: descriptor.owner,
				messages: { [descriptor.key]: translation }
			}
		]
	});
	const expected = JSON.stringify(source);
	for (const result of [
		materializeIntlTranslation(translation, descriptor),
		environment.find(descriptor.owner, descriptor.key)
	]) {
		result[0].value[0].cases[0].value[0].formatter.options.maximumFractionDigits = 0;
		result[0].value[0].cases[0].value[0].bindings[0] = 99;
		result[0].value[0].fallback[0].value = 'Changed';
		result[0].value[0].fallback[1].binding = 99;
		result[1].name = 'Changed';
		result[0].value[0].fallback.push({ kind: 'text', value: 'Extra' });
	}
	if (
		JSON.stringify(source) !== expected ||
		JSON.stringify(environment.find(descriptor.owner, descriptor.key)) !== expected ||
		JSON.stringify(environment.forLocale('fr-FR').find(descriptor.owner, descriptor.key)) !==
			expected
	)
		throw new Error('Intl public message mutation changed retained execution data');
	const pseudo = createIntlEnvironment({
		locale: 'en-XA',
		descriptors: [descriptor],
		catalogs: []
	});
	const first = pseudo.find(descriptor.owner, descriptor.key);
	first[0].value[0].cases[0].value[0].formatter.options.maximumFractionDigits = 0;
	if (
		pseudo.find(descriptor.owner, descriptor.key)[0].value[0].cases[0].value[0].formatter.options
			.maximumFractionDigits !== 2
	)
		throw new Error('Intl pseudo-localization shares formatter authority');
	return true;
}
