/** Supplies independent declarative inputs for metadata ownership controls. */
function manifest() {
	return {
		name: '@acme/plugin',
		exact: {
			plugin: {
				schemaVersion: 1,
				protocolVersion: '1.0.0',
				configKey: 'example',
				entries: { config: './config' }
			},
			pluginForwarding: {
				schemaVersion: 1,
				include: { '@acme/dependency': { required: true } },
				ignore: ['@other/']
			},
			pluginConfiguration: {
				'@acme/dependency': { version: '^1.0.0', subpath: './config', export: 'configure' }
			}
		}
	};
}

/** Checks ordinary metadata observations and independent normalized discovery policy arrays. */
export function verifyPluginMetadataValues({
	readExactPackageParticipation,
	resolveDiscoveryPolicy
}) {
	const check = (value, message) => {
		if (!value) throw new Error('Plugin metadata: ' + message);
	};
	const input = manifest();
	const result = readExactPackageParticipation(input);
	result.plugin.entries.config = './changed';
	result.forwarding.include['@acme/dependency'].required = false;
	result.forwarding.ignore.push('@added/');
	result.configuration['@acme/dependency'].version = '^2.0.0';
	result.plugin = { ...result.plugin, configKey: 'changed' };
	check(
		input.exact.plugin.entries.config === './config' &&
			input.exact.pluginForwarding.include['@acme/dependency'].required === true &&
			input.exact.pluginForwarding.ignore.length === 1 &&
			input.exact.pluginConfiguration['@acme/dependency'].version === '^1.0.0',
		'parsed observations do not alter input metadata'
	);
	const prefixes = ['@acme/'];
	const policy = resolveDiscoveryPolicy({
		mode: 'trusted',
		trustedPrefixes: prefixes,
		includeDefaultTrustedPrefixes: false
	});
	policy.trustedPrefixes.push('@other/');
	policy.mode = 'root';
	check(
		prefixes.length === 1 && policy.trustedPrefixes.length === 2 && policy.mode === 'root',
		'normalized policy is ordinary independent data'
	);
	const next = readExactPackageParticipation(input);
	check(
		next.plugin.entries.config === './config' && next.forwarding.ignore.length === 1,
		'subsequent metadata parses remain independent'
	);
	return true;
}

/** Checks that published forwarding choices and selectors are the values actually validated. */
export function verifyPluginMetadataCapture({
	readExactPackageParticipation,
	resolveDiscoveryPolicy
}) {
	const check = (value, message) => {
		if (!value) throw new Error('Plugin metadata capture: ' + message);
	};
	let requiredReads = 0;
	const input = manifest();
	input.exact.pluginForwarding.include['@acme/dependency'] = {
		get required() {
			return ++requiredReads <= 2 ? true : 'invalid';
		}
	};
	const result = readExactPackageParticipation(input);
	check(
		requiredReads === 1 && result.forwarding.include['@acme/dependency'].required === true,
		'forwarding boolean captured once'
	);
	const invalid = manifest();
	const selectors = ['@safe/'];
	selectors.map = () => ['../invalid'];
	invalid.exact.pluginForwarding.ignore = selectors;
	const normalized = readExactPackageParticipation(invalid);
	check(
		normalized.forwarding.ignore.length === 1 && normalized.forwarding.ignore[0] === '@safe/',
		'caller map method cannot bypass selector validation'
	);
	const sparse = manifest();
	sparse.exact.pluginForwarding.ignore = Array(1);
	let sparseRejected = false;
	try {
		readExactPackageParticipation(sparse);
	} catch {
		sparseRejected = true;
	}
	check(sparseRejected, 'every selector entry is validated, including sparse arrays');
	let prefixReads = 0;
	const policy = resolveDiscoveryPolicy({
		mode: 'trusted',
		includeDefaultTrustedPrefixes: false,
		get trustedPrefixes() {
			return ++prefixReads <= 2 ? ['@acme/'] : [''];
		}
	});
	check(
		prefixReads === 1 &&
			policy.trustedPrefixes.length === 1 &&
			policy.trustedPrefixes[0] === '@acme/',
		'published trust prefixes are captured before validation'
	);
	let rejected = false;
	try {
		resolveDiscoveryPolicy({ mode: 'trusted', trustedPrefixes: [''] });
	} catch {
		rejected = true;
	}
	check(rejected, 'invalid captured trust prefix remains rejected');
	return true;
}
