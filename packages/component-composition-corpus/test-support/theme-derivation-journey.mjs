/** Verifies TypeScript readonly does not freeze application-owned derivation values. */
export function verifyThemeDerivationValues({
	resolveTheme,
	createThemeDeriver,
	deriveTheme,
	deriveDataColors
}) {
	const theme = resolveTheme({
		source: { keyColor: '#2367d1' },
		environment: { appearance: 'light', contrast: 'standard', motion: 'full' }
	});
	const output = { nested: { value: 1 } };
	const deriver = createThemeDeriver({
		id: 'journey.alias',
		version: 1,
		derive(context) {
			const palette = context.tonalPalette('accent');
			palette.hue = 12;
			context.sourceFingerprint = 'observation';
			return output;
		}
	});
	const result = deriveTheme(theme, deriver, {});
	output.nested.value = 2;
	deriver.version = 2;
	if (
		result !== output ||
		result.nested.value !== 2 ||
		deriver.version !== 2 ||
		theme.fingerprint === 'observation'
	)
		throw new Error('Theme derivation alias ownership');
	const first = deriveDataColors(theme, { kind: 'categorical', count: 3 });
	const second = deriveDataColors(theme, { kind: 'categorical', count: 3 });
	first.colors[0] = '#abcdef';
	if (first.colors[0] !== '#abcdef' || second.colors[0] === '#abcdef')
		throw new Error('Theme derivation result independence');
	const cycle = {};
	cycle.self = cycle;
	let rejected = false;
	try {
		deriveTheme(
			theme,
			createThemeDeriver({ id: 'journey.cycle', version: 1, derive: () => cycle }),
			{}
		);
	} catch {
		rejected = true;
	}
	if (!rejected) throw new Error('Theme derivation cycle validation');
	return true;
}

/** Checks public palette and scope observations against independently retained cache data. */
export function verifyThemeCacheOwnership({
	resolveTheme,
	createThemeScopeDefinition,
	createThemeScopePresentation,
	resolveThemeScope,
	builtInTemperaments,
	exactThemeContract,
	serializeThemeOverrides
}) {
	const environment = { appearance: 'light', contrast: 'standard', motion: 'full' };
	const input = { source: { keyColor: '#2367d1' }, environment };
	const first = resolveTheme(input);
	const canvas = first.tokens.canvas;
	const lightness = first.key.oklch.l;
	first.tokens.canvas = 'hotpink';
	first.key.oklch.l = 0;
	const next = resolveTheme(input);
	if (
		next.tokens.canvas !== canvas ||
		next.key.oklch.l !== lightness ||
		Object.getPrototypeOf(next.tones) !== null
	)
		throw new Error('Theme private palette ownership');
	const definition = createThemeScopeDefinition(input.source);
	const before = resolveThemeScope(definition, environment);
	definition.source.keyColor = '#d97706';
	if (resolveThemeScope(definition, environment).key.css === before.key.css)
		throw new Error('Theme current definition resolution');
	const presentation = createThemeScopePresentation(definition);
	const css = presentation.css;
	presentation.css = 'authored';
	presentation.preferences.appearance = 'dark';
	const repeated = createThemeScopePresentation(definition);
	if (repeated.css !== css || repeated.preferences.appearance === 'dark')
		throw new Error('Theme presentation ownership');
	let reads = 0;
	const temperament = {
		...builtInTemperaments.balanced,
		get surfaceIntervals() {
			reads++;
			return reads === 1 ? [0.012, 0.014, 0.016] : [9, 9, 9];
		}
	};
	const captured = resolveTheme({ source: { temperament }, environment });
	if (reads !== 1 || captured.source.temperament.surfaceIntervals[0] !== 0.012)
		throw new Error('Theme captured temperament');
	const sparse = [0.012, 0.014, 0.016];
	delete sparse[1];
	let rejected = false;
	try {
		resolveTheme({
			source: { temperament: { ...builtInTemperaments.balanced, surfaceIntervals: sparse } },
			environment
		});
	} catch {
		rejected = true;
	}
	if (!rejected) throw new Error('Theme sparse interval rejection');
	const cyclic = createThemeScopeDefinition({});
	cyclic.parent = createThemeScopeDefinition({}, cyclic);
	for (const read of [
		() => resolveThemeScope(cyclic, environment),
		() => createThemeScopePresentation(cyclic)
	]) {
		let rejected = false;
		try {
			read();
		} catch (error) {
			rejected = /cyclic theme scope ancestry/i.test(error.message);
		}
		if (!rejected) throw new Error('Theme cyclic ancestry rejection');
	}
	let deep = createThemeScopeDefinition({ appearance: 'dark', contrast: 'more' });
	for (let depth = 0; depth < 512; depth++) deep = createThemeScopeDefinition({}, deep);
	if (resolveThemeScope(deep, environment).source.appearance !== 'dark')
		throw new Error('Theme deep ancestry resolution');
	let parentReads = 0;
	const child = createThemeScopeDefinition({});
	Object.defineProperty(child, 'parent', {
		get() {
			parentReads++;
			return deep;
		}
	});
	const inherited = createThemeScopePresentation(child);
	if (parentReads !== 1 || inherited.preferences.appearance !== 'dark')
		throw new Error('Theme captured ancestry');
	const descriptor = exactThemeContract.tokens['font-weight-regular'];
	const minimum = descriptor.minimum;
	try {
		descriptor.minimum = -1000;
		let rejected = false;
		try {
			serializeThemeOverrides({ 'font-weight-regular': -100 });
		} catch {
			rejected = true;
		}
		if (!rejected) throw new Error('Theme token descriptor authority');
	} finally {
		descriptor.minimum = minimum;
	}
	return true;
}

/** Captures structured color and custom source fields before validation and palette generation. */
export function verifyThemeSourceCapture({ resolveTheme, builtInTemperaments }) {
	const environment = { appearance: 'light', contrast: 'standard', motion: 'full' };
	const resolve = (source) => resolveTheme({ source, environment });
	const red = resolve({ keyColor: { colorSpace: 'srgb', components: [1, 0, 0] } }).key.css;
	const reads = { space: 0, components: 0, alpha: 0 };
	const keyColor = {
		get colorSpace() {
			reads.space++;
			return 'srgb';
		},
		get components() {
			reads.components++;
			return reads.components === 1 ? [1, 0, 0] : [0, 0, 1];
		},
		get alpha() {
			reads.alpha++;
			return 1;
		}
	};
	if (resolve({ keyColor }).key.css !== red || Object.values(reads).some((count) => count !== 1))
		throw new Error('Theme captured structured color');
	const invalidComponents = [NaN, 0, 0];
	invalidComponents.map = () => [1, 0, 0];
	for (const keyColor of [
		{ colorSpace: 'unsupported', components: [1, 0, 0] },
		{ colorSpace: 'srgb', components: [1, 0, 0], alpha: null },
		{ colorSpace: 'srgb', components: invalidComponents }
	]) {
		let rejected = false;
		try {
			resolve({ keyColor });
		} catch {
			rejected = true;
		}
		if (!rejected) throw new Error('Theme invalid structured color rejection');
	}
	for (const colorSpace of ['srgb', 'display-p3', 'oklab', 'oklch'])
		if (
			!Number.isFinite(
				resolve({ keyColor: { colorSpace, components: [0.4, 0.05, 0.1] } }).key.oklch.l
			)
		)
			throw new Error('Theme supported structured space');
	let bodyReads = 0;
	const typography = {
		get body() {
			bodyReads++;
			return bodyReads === 1 ? 'serif' : 'serif; color:red';
		}
	};
	if (resolve({ typography }).source.typography.body !== 'serif' || bodyReads !== 1)
		throw new Error('Theme captured typography');
	let trackingReads = 0;
	const prototype = {
		...builtInTemperaments.balanced,
		get trackingInterval() {
			trackingReads++;
			return trackingReads === 1 ? 0.025 : 9;
		}
	};
	if (
		resolve({ temperament: Object.create(prototype) }).source.temperament.trackingInterval !==
			0.025 ||
		trackingReads !== 1
	)
		throw new Error('Theme inherited temperament capture');
	const metadata = new Date(0);
	const observed = resolve({ temperament: { ...builtInTemperaments.balanced, metadata } }).source
		.temperament.metadata;
	if (observed !== metadata || observed.getTime() !== 0)
		throw new Error('Theme opaque metadata identity');
	return true;
}
