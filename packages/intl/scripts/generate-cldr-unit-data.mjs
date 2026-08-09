import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = path.resolve(packageRoot, '../..');
const preferencePath = path.join(
	workspaceRoot,
	'node_modules/cldr-core/supplemental/unitPreferenceData.json'
);
const unitsPath = path.join(workspaceRoot, 'node_modules/cldr-core/supplemental/units.json');
const outputPath = path.join(packageRoot, 'src/cldr-unit-data.ts');
const check = process.argv.includes('--check');

const preferenceDocument = JSON.parse(await readFile(preferencePath, 'utf8'));
const unitsDocument = JSON.parse(await readFile(unitsPath, 'utf8'));
const preferences = preferenceDocument.supplemental.unitPreferenceData;
const conversions = unitsDocument.supplemental.convertUnits;
const prefixes = Object.keys(unitsDocument.supplemental.unitPrefixes).sort(
	(left, right) => right.length - left.length
);

const semanticSources = Object.freeze({
	'area/floor': ['area', 'floor'],
	'area/land': ['area', 'land'],
	'energy/electricity': ['energy', 'default'],
	'energy/food': ['energy', 'food'],
	'fuel-economy/road': ['consumption', 'vehicle-fuel'],
	'length/person-height': ['length', 'person-height'],
	'length/road': ['length', 'road'],
	'mass/person': ['mass', 'person'],
	'power/engine': ['power', 'engine'],
	'pressure/weather': ['pressure', 'baromtrc'],
	'speed/road': ['speed', 'default'],
	'temperature/weather': ['temperature', 'weather'],
	'volume/liquid': ['volume', 'fluid']
});

const selectedPreferences = {};
const selectedUnits = new Set();
for (const [semantic, [category, usage]] of Object.entries(semanticSources)) {
	const regional = preferences[category]?.[usage];
	if (!regional) throw new Error(`CLDR ${category}/${usage} unit preferences are unavailable`);
	selectedPreferences[semantic] = regional;
	for (const entries of Object.values(regional))
		for (const entry of entries) selectedUnits.add(entry.unit);
}

const selectedSystems = Object.fromEntries(
	[...selectedUnits]
		.sort()
		.map((unit) => [
			unit,
			['metric', 'ussystem', 'uksystem'].filter((system) => unitMatchesSystem(unit, system))
		])
);
for (const [unit, systems] of Object.entries(selectedSystems))
	if (systems.length === 0)
		throw new Error(`CLDR unit ${unit} has no supported measurement system`);

const compactPreferences = serializeRecord(selectedPreferences);
const compactSystems = serializeRecord(selectedSystems);
const raw = `// Generated from cldr-core ${preferenceDocument.supplemental.version._cldrVersion}; do not edit.

/** CLDR release carried by the generated unit-preference projection. */
export const intlCldrVersion = ${JSON.stringify(preferenceDocument.supplemental.version._cldrVersion)};

/** Runtime projection of CLDR preferences for eXact's supported semantic unit selectors. */
// prettier-ignore
export const cldrUnitPreferenceData = ${compactPreferences} as const;

/** Measurement-system compatibility derived from CLDR conversion metadata. */
// prettier-ignore
export const cldrUnitSystems = ${compactSystems} as const;
`;
const prettierConfig = (await resolveConfig(outputPath)) ?? {};
const generated = await format(raw, { ...prettierConfig, filepath: outputPath });

if (check) {
	const current = await readFile(outputPath, 'utf8').catch(() => '');
	if (current !== generated) {
		console.error('Generated CLDR unit preference data is stale. Run npm run generate:cldr.');
		process.exitCode = 1;
	}
} else await writeFile(outputPath, generated, 'utf8');

function serializeRecord(record) {
	const entries = Object.entries(record).map(
		([key, value]) => `\t${JSON.stringify(key)}: ${JSON.stringify(value)}`
	);
	return `{\n${entries.join(',\n')}\n}`;
}

function unitMatchesSystem(unit, requested) {
	const direct = conversions[unit]?._systems;
	if (direct)
		return requested === 'metric'
			? direct.includes('metric') || direct.includes('metric_adjacent')
			: direct.includes(requested);
	const mercuryColumn = /^(.*)-ofhg$/u.exec(unit)?.[1];
	if (mercuryColumn) return unitMatchesSystem(mercuryColumn, requested);
	const compound = unit.split(/-and-|-per-/u);
	if (compound.length > 1) return compound.every((part) => unitMatchesSystem(part, requested));
	for (
		let separator = unit.indexOf('-');
		separator >= 0;
		separator = unit.indexOf('-', separator + 1)
	) {
		if (
			unitMatchesSystem(unit.slice(0, separator), requested) &&
			unitMatchesSystem(unit.slice(separator + 1), requested)
		)
			return true;
	}
	const normalized = unit.replace(/^(?:square-|cubic-|[0-9]+-)/u, '');
	if (normalized !== unit) return unitMatchesSystem(normalized, requested);
	for (const prefix of prefixes) {
		if (!unit.startsWith(prefix) || unit.length === prefix.length) continue;
		if (unitMatchesSystem(unit.slice(prefix.length), requested)) return true;
	}
	return false;
}
