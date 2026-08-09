import {
	canonicalizeIntlValue,
	type AnalyzedMessageDescriptorV1,
	type IntlRuntimeDescriptorV1
} from '@exactjs/intl';
import type {
	AnalyzeIntlSourceOptions,
	IntlDescriptorCompanion,
	IntlSourceAnalysis
} from './analysis-contracts.js';
import { createIntlMessageKey } from './message-key.js';
import type {
	NativeIntlAnalysis,
	NativeIntlDescriptor,
	NativeIntlRegion,
	NativeIntlSpan
} from './native-analysis.js';

type SourceEdit = Readonly<{ start: number; length: number; replacement: string }>;

/** Finalizes native semantic facts and instruments their source spans without a TypeScript runtime. */
export function instrumentNativeIntlAnalysis(
	source: string,
	options: AnalyzeIntlSourceOptions,
	native: NativeIntlAnalysis
): IntlSourceAnalysis {
	const descriptors = native.descriptors.map(finalizeDescriptor);
	if (descriptors.length === 0)
		return Object.freeze({
			code: source,
			descriptors: Object.freeze(descriptors),
			descriptorOwnerOrdinals: Object.freeze([...native.descriptorOwnerOrdinals]),
			diagnostics: Object.freeze([...native.diagnostics]),
			clientRequirements: Object.freeze([...native.clientRequirements])
		});

	const runtimeDescriptors = descriptors.map(runtimeDescriptor);
	const edits: SourceEdit[] = [];
	for (const region of native.regions) {
		const descriptor = descriptors[region.descriptorIndex];
		if (!descriptor)
			throw new Error(`Native intl region references missing descriptor ${region.descriptorIndex}`);
		const activation = sliceSpan(source, region.attribute);
		const activationName = region.activationName || /^intl:([\w-]+)/u.exec(activation)?.[1];
		if (!activationName)
			throw new Error(`Native intl region has an invalid activation: ${activation}`);
		const values = region.values.map((span) => sliceSpan(source, span).trim());
		const structures = region.structures.map((structure) => structureFactory(source, structure));
		const target =
			descriptor.target.kind === 'content' && !region.explicit
				? targetFactory(source, region, activationName)
				: undefined;
		const argumentsList = [
			`__exactIntlDescriptor${region.descriptorIndex}`,
			`[${values.join(', ')}]`,
			`[${structures.join(', ')}]`,
			...(target ? [target] : [])
		];
		const preparedName = region.explicit ? activationName : `__exactIntl:${activationName}`;
		edits.push({
			...region.attribute,
			replacement: `${region.attribute.length === 0 ? ' ' : ''}${preparedName}={__exactPrepareIntl(${argumentsList.join(', ')})}`
		});
		for (const span of auxiliaryAttributeSpans(source, region, activationName))
			edits.push({ ...span, replacement: '' });
		for (const structure of region.structures)
			if (structure.attribute?.length) edits.push({ ...structure.attribute, replacement: '' });
	}

	const declaration =
		'import { prepareIntlActivation as __exactPrepareIntl } from "@exactjs/intl/internal";';
	const enhancement = native.regions.some((region) => !region.explicit)
		? 'import * as __exactIntl from "@exactjs/intl/enhancements" with { type: "exact-enhancement" };\n'
		: '';
	const descriptorPrelude = options.descriptorModuleId
		? descriptorGroups(native.descriptorOwnerOrdinals)
				.map(
					([ordinal, indexes]) =>
						`import { ${indexes.map((index) => `__exactIntlDescriptor${index}`).join(', ')} } from ${JSON.stringify(componentDescriptorModuleId(options.descriptorModuleId!, ordinal))};`
				)
				.join('\n')
		: runtimeDescriptors
				.map(
					(descriptor, index) =>
						`const __exactIntlDescriptor${index} = Object.freeze(${JSON.stringify(descriptor)});`
				)
				.join('\n');
	const code = `${enhancement}${declaration}\n${descriptorPrelude}\n${applySourceEdits(source, edits)}`;
	return Object.freeze({
		code,
		descriptors: Object.freeze(descriptors),
		descriptorOwnerOrdinals: Object.freeze([...native.descriptorOwnerOrdinals]),
		diagnostics: Object.freeze([...native.diagnostics]),
		clientRequirements: Object.freeze([...native.clientRequirements]),
		...(options.descriptorModuleId
			? {
					companions: Object.freeze(
						descriptorGroups(native.descriptorOwnerOrdinals).map(([ordinal, indexes]) =>
							createCompanion(
								componentDescriptorModuleId(options.descriptorModuleId!, ordinal),
								indexes,
								runtimeDescriptors,
								options.generation ?? 0
							)
						)
					)
				}
			: {})
	});
}

function finalizeDescriptor(native: NativeIntlDescriptor): AnalyzedMessageDescriptorV1 {
	const canonicalSource = canonicalizeIntlValue({
		protocol: 1,
		sourceLocale: native.sourceLocale,
		target: native.target,
		...(native.context ? { context: native.context } : {}),
		bindings: native.bindings.map(({ kind, type, name, exactlyOnce }) => ({
			kind,
			type,
			...(name ? { name } : {}),
			...(exactlyOnce ? { exactlyOnce } : {})
		})),
		source: native.source
	});
	return Object.freeze({
		...native,
		key: createIntlMessageKey(canonicalSource),
		canonicalSource
	});
}

function runtimeDescriptor(descriptor: AnalyzedMessageDescriptorV1): IntlRuntimeDescriptorV1 {
	const {
		ownerComponentId: _ownerComponentId,
		canonicalSource: _canonicalSource,
		context: _context,
		sourceRange: _sourceRange,
		...runtime
	} = descriptor;
	return runtime;
}

function sliceSpan(source: string, span: NativeIntlSpan): string {
	return source.slice(span.start, span.start + span.length);
}

function structureFactory(
	source: string,
	structure: NativeIntlRegion['structures'][number]
): string {
	const element = removeFragmentMetadata(sliceSpan(source, structure.element));
	if (structure.opaque) return `() => ${element}`;
	const relativeStart = structure.content.start - structure.element.start;
	const relativeEnd = relativeStart + structure.content.length;
	const original = sliceSpan(source, structure.element);
	const opening = removeFragmentMetadata(original.slice(0, relativeStart));
	return `__intlChildren => ${opening}{__intlChildren}${original.slice(relativeEnd)}`;
}

function removeFragmentMetadata(source: string): string {
	return source.replace(/\s+intl:fragment(?:\s*=\s*(?:"[^"]*"|'[^']*'|\{[^{}]*\}))?/gu, '');
}

function targetFactory(source: string, region: NativeIntlRegion, activationName: string): string {
	const element = sliceSpan(source, region.element);
	const relativeStart = region.content.start - region.element.start;
	const relativeEnd = relativeStart + region.content.length;
	const shell = removeIntlMetadata(
		`${element.slice(0, relativeStart)}{__intlContent}${element.slice(relativeEnd)}`,
		activationName
	);
	return `__intlContent => ${shell}`;
}

function auxiliaryAttributeSpans(
	source: string,
	region: NativeIntlRegion,
	activationName: string
): readonly NativeIntlSpan[] {
	const names =
		activationName === 'currency'
			? ['display']
			: activationName === 'unit'
				? ['source-unit', 'convert-to']
				: [];
	if (names.length === 0) return [];
	const openingLength = Math.max(0, region.content.start - region.element.start);
	const opening = source.slice(region.element.start, region.element.start + openingLength);
	const pattern = new RegExp(
		`\\s+intl:(?:${names.join('|')})(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|\\{[^{}]*\\}))?`,
		'gu'
	);
	return [...opening.matchAll(pattern)].map((match) => ({
		start: region.element.start + (match.index ?? 0),
		length: match[0].length
	}));
}

function removeIntlMetadata(element: string, activationName: string): string {
	const names =
		activationName === 'currency'
			? ['currency', 'display']
			: activationName === 'unit'
				? ['unit', 'source-unit', 'convert-to']
				: [activationName];
	return element.replace(
		new RegExp(
			`\\s+intl:(?:${names.join('|')})(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|\\{[^{}]*\\}))?`,
			'gu'
		),
		''
	);
}

function applySourceEdits(source: string, edits: readonly SourceEdit[]): string {
	const ordered = [...edits].sort(
		(left, right) => right.start - left.start || right.length - left.length
	);
	let previousStart = source.length;
	let output = source;
	for (const edit of ordered) {
		if (edit.start + edit.length > previousStart)
			throw new Error('Native intl instrumentation produced overlapping source edits');
		output = `${output.slice(0, edit.start)}${edit.replacement}${output.slice(edit.start + edit.length)}`;
		previousStart = edit.start;
	}
	return output;
}

function descriptorGroups(
	ownerOrdinals: readonly number[]
): readonly (readonly [number, readonly number[]])[] {
	const groups = new Map<number, number[]>();
	for (let index = 0; index < ownerOrdinals.length; index++) {
		const ordinal = ownerOrdinals[index]!;
		const indexes = groups.get(ordinal) ?? [];
		indexes.push(index);
		groups.set(ordinal, indexes);
	}
	return [...groups].map(([ordinal, indexes]) => [ordinal, Object.freeze(indexes)] as const);
}

function componentDescriptorModuleId(moduleId: string, ownerOrdinal: number): string {
	return `${moduleId}/component/${ownerOrdinal}`;
}

function createCompanion(
	id: string,
	indexes: readonly number[],
	descriptors: readonly IntlRuntimeDescriptorV1[],
	generation: number
): IntlDescriptorCompanion {
	const declarations = indexes
		.map(
			(index) =>
				`export const __exactIntlDescriptor${index} = Object.freeze(${JSON.stringify(descriptors[index])});`
		)
		.join('\n');
	return Object.freeze({
		id,
		code: `${declarations}\nexport const descriptors = Object.freeze([${indexes.map((index) => `__exactIntlDescriptor${index}`).join(',')}]);\nexport const generation = ${generation};\n`,
		generation,
		descriptorIndexes: Object.freeze([...indexes])
	});
}
