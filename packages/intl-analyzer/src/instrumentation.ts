import {
	canonicalizeIntlValue,
	projectIntlTranslationContract,
	type AnalyzedMessageDescriptorV1,
	type IntlRuntimeDescriptorV1
} from '@exactjs/intl';
import type {
	AnalyzeIntlSourceOptions,
	IntlDescriptorCompanion,
	IntlSourceAnalysis
} from './analysis-contracts.js';
import { createIntlExecutionContractHash, createIntlMessageKey } from './message-key.js';
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
	const descriptors = native.descriptors.map(finalizeNativeIntlDescriptor);
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
				? targetFactory(source, region)
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
		for (const span of uniqueSpans(region.attributes))
			if (!spansOverlap(span, region.attribute) && span.length > 0)
				edits.push({ ...span, replacement: '' });
		for (const span of uniqueSpans(region.transferred ?? []))
			if (span.length > 0) edits.push({ ...span, replacement: '' });
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

/** Finalizes one native descriptor with independent translation and execution identities. */
export function finalizeNativeIntlDescriptor(
	native: NativeIntlDescriptor
): AnalyzedMessageDescriptorV1 {
	const { name, ...descriptor } = native;
	const translation = projectIntlTranslationContract(native.bindings, native.source);
	const canonicalTranslation = canonicalizeIntlValue({
		sourceLocale: native.sourceLocale,
		target: native.target,
		...(name ? { name } : {}),
		source: translation.source,
		placeholders: translation.placeholders.map((placeholder) => ({ ...placeholder }))
	});
	const canonicalContract = canonicalizeIntlValue({
		bindings: native.bindings.map(({ index: _index, ...binding }) => binding),
		source: native.source,
		capabilities: [...native.capabilities].sort()
	});
	return Object.freeze({
		...descriptor,
		...(name ? { name } : {}),
		contract: createIntlExecutionContractHash(canonicalContract),
		key: createIntlMessageKey(canonicalTranslation, name),
		canonicalTranslation
	});
}

function runtimeDescriptor(descriptor: AnalyzedMessageDescriptorV1): IntlRuntimeDescriptorV1 {
	const {
		ownerComponentId: _ownerComponentId,
		canonicalTranslation: _canonicalTranslation,
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
	const element = removeOwnedAttributes(
		sliceSpan(source, structure.element),
		structure.element.start,
		structure.attributes ?? []
	);
	if (structure.opaque) return `() => ${element}`;
	const relativeStart = structure.content.start - structure.element.start;
	const sanitizedContentStart =
		relativeStart -
		removedLengthBefore(
			structure.attributes ?? [],
			structure.element.start,
			structure.content.start
		);
	const sanitizedContentEnd =
		sanitizedContentStart +
		structure.content.length -
		removedLengthBetween(
			structure.attributes ?? [],
			structure.content.start,
			structure.content.start + structure.content.length
		);
	return `__intlChildren => ${element.slice(0, sanitizedContentStart)}{__intlChildren}${element.slice(sanitizedContentEnd)}`;
}

function targetFactory(source: string, region: NativeIntlRegion): string {
	const element = removeOwnedAttributes(
		sliceSpan(source, region.element),
		region.element.start,
		region.attributes
	);
	const relativeStart = region.content.start - region.element.start;
	const sanitizedContentStart =
		relativeStart -
		removedLengthBefore(region.attributes, region.element.start, region.content.start);
	const sanitizedContentEnd =
		sanitizedContentStart +
		region.content.length -
		removedLengthBetween(
			region.attributes,
			region.content.start,
			region.content.start + region.content.length
		);
	return `__intlContent => ${element.slice(0, sanitizedContentStart)}{__intlContent}${element.slice(sanitizedContentEnd)}`;
}

/** Removes compiler-consumed attributes from one retained source slice. */
function removeOwnedAttributes(
	source: string,
	base: number,
	attributes: readonly NativeIntlSpan[]
): string {
	let result = source;
	for (const attribute of [...uniqueSpans(attributes)].sort(
		(left, right) => right.start - left.start
	)) {
		const start = attribute.start - base;
		if (start < 0 || start + attribute.length > result.length) continue;
		result = `${result.slice(0, start)}${result.slice(start + attribute.length)}`;
	}
	return result;
}

function removedLengthBefore(
	attributes: readonly NativeIntlSpan[],
	base: number,
	position: number
): number {
	return uniqueSpans(attributes).reduce(
		(total, attribute) =>
			attribute.start >= base && attribute.start < position ? total + attribute.length : total,
		0
	);
}

function removedLengthBetween(
	attributes: readonly NativeIntlSpan[],
	start: number,
	end: number
): number {
	return uniqueSpans(attributes).reduce(
		(total, attribute) =>
			attribute.start >= start && attribute.start < end ? total + attribute.length : total,
		0
	);
}

function spansOverlap(left: NativeIntlSpan, right: NativeIntlSpan): boolean {
	return left.start < right.start + right.length && right.start < left.start + left.length;
}

function uniqueSpans(spans: readonly NativeIntlSpan[]): readonly NativeIntlSpan[] {
	const seen = new Set<string>();
	return spans.filter((span) => {
		const key = `${span.start}:${span.length}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function applySourceEdits(source: string, edits: readonly SourceEdit[]): string {
	const ordered = [...edits].sort(
		(left, right) => right.start - left.start || right.length - left.length
	);
	let previousStart = source.length;
	let output = source;
	for (const edit of ordered) {
		if (edit.start + edit.length > previousStart)
			throw new Error(
				`Native intl instrumentation edit ${edit.start}:${edit.length} overlaps the edit beginning at ${previousStart}`
			);
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
