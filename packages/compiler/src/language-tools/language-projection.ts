import type {
	ExactEnhancementActivationV1,
	ExactJsxAttributeV1,
	ExactJsxLanguageFactV1,
	ExactLanguageProjectionV1,
	ExactLanguageRange
} from '@exactjs/language-extension-api';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import type { NativeCompilerResponse } from '../native/process-contracts.js';

/** Builds protocol-1 language facts from the same native response used for editor inspection. */
export function createExactLanguageProjection(
	filename: string,
	source: string,
	generation: number,
	response: NativeCompilerResponse,
	project?: Readonly<{ kind: 'configured' | 'inferred'; root: string }>,
	version = generation
): ExactLanguageProjectionV1 {
	const components = response.analysis.components.map((component) =>
		Object.freeze({
			id: component.id,
			name: component.name,
			range: sourceRange(component.start, component.length),
			nameRange: findNameRange(source, component.name, component.start, component.length),
			placement: normalizePlacement(component.placement),
			artifactTargets: Object.freeze([...component.artifactTargets]),
			renderEdges: Object.freeze(component.renderEdges.map((edge) => edge.id))
		})
	);
	const jsx = response.analysis.jsx.map((element, index) =>
		jsxFact(source, element, index, components)
	);
	const enhancements: ExactEnhancementActivationV1[] = (
		response.analysis.enhancementActivations ?? []
	).flatMap((activation, index) => {
		const elementIndex = response.analysis.jsx.findIndex(
			(element) => element.start === activation.targetStart
		);
		const element = jsx[elementIndex];
		if (!element) return [];
		const attribute = element.attributes.find(
			(candidate) => candidate.range.start === activation.start
		);
		const range = sourceRange(activation.start, activation.length);
		return [
			Object.freeze({
				id: `${element.id}:enhancement:${activation.start}:${index}`,
				namespace: activation.namespace,
				activator: activation.activator,
				range,
				nameRange: attribute?.nameRange ?? range,
				...(attribute?.valueRange ? { valueRange: attribute.valueRange } : {}),
				identity: activation.identity,
				module: activation.moduleSpecifier,
				exportName: activation.exportName,
				...(packageFact(activation.moduleSpecifier)
					? { package: packageFact(activation.moduleSpecifier) }
					: {}),
				targetJsxId: element.id,
				...(element.ownerComponentId ? { ownerComponentId: element.ownerComponentId } : {}),
				...(attribute?.expressionId ? { payloadExpressionId: attribute.expressionId } : {}),
				application: activation.application
			})
		];
	});
	const expressions = jsx.flatMap((element) =>
		element.attributes.flatMap((attribute) => {
			if (!attribute.expressionId) return [];
			const dependencies = response.analysis.stateReads
				.filter(
					(read) =>
						attribute.range.start <= read.start && read.start + read.length <= attribute.range.end
				)
				.map((read) => `state.${read.path.join('.')}`);
			return [
				Object.freeze({
					id: attribute.expressionId,
					range: attribute.valueRange ?? attribute.range,
					syntaxKind: 'jsx-attribute-expression',
					referencedSymbols: Object.freeze([]),
					reactiveDependencies: Object.freeze([...new Set(dependencies)]),
					effect: dependencies.length ? ('reads-state' as const) : ('unknown' as const)
				})
			];
		})
	);
	return Object.freeze({
		protocol: 1,
		generation,
		project: Object.freeze({
			root: project?.root ?? filename,
			kind: project?.kind ?? 'inferred'
		}),
		document: Object.freeze({
			uri: pathToFileURL(filename).href,
			path: filename,
			version,
			textHash: createHash('sha256').update(source).digest('base64url'),
			text: source
		}),
		imports: Object.freeze(
			response.analysis.imports.map((value) =>
				Object.freeze({
					specifier: value.moduleSpecifier,
					range: sourceRange(value.start, value.length),
					kind: value.typeOnly ? ('type' as const) : ('runtime' as const),
					...(value.enhancement ? { enhancement: true as const } : {}),
					...(packageFact(value.moduleSpecifier)
						? { package: packageFact(value.moduleSpecifier) }
						: {})
				})
			)
		),
		components: Object.freeze(components),
		enhancements: Object.freeze(enhancements),
		jsx: Object.freeze(jsx),
		expressions: Object.freeze(expressions),
		types: Object.freeze(
			expressions.map((expression) =>
				Object.freeze({ expressionId: expression.id, types: Object.freeze(['unknown' as const]) })
			)
		)
	});
}

function jsxFact(
	source: string,
	element: NativeCompilerResponse['analysis']['jsx'][number],
	index: number,
	components: readonly Readonly<{ id: string; range: ExactLanguageRange }>[]
): ExactJsxLanguageFactV1 {
	const range = sourceRange(element.start, element.length);
	const tagOffset = source.indexOf(element.tag, range.start);
	const tagRange = Object.freeze({
		start: tagOffset >= range.start && tagOffset < range.end ? tagOffset : range.start,
		end:
			tagOffset >= range.start && tagOffset < range.end
				? tagOffset + element.tag.length
				: range.start
	});
	const owner = [...components]
		.filter((component) => component.range.start <= range.start && range.end <= component.range.end)
		.sort(
			(left, right) => left.range.end - left.range.start - (right.range.end - right.range.start)
		)[0];
	return Object.freeze({
		id: `jsx:${element.start}:${index}`,
		range,
		openingRange: range,
		tagRange,
		kind:
			element.tag === '_' ? 'enhancement-target' : element.intrinsic ? 'intrinsic' : 'component',
		tag: element.tag,
		...(owner ? { ownerComponentId: owner.id } : {}),
		attributes: Object.freeze(
			element.attributes.map((attribute, attributeIndex) =>
				attributeFact(source, attribute, attributeIndex)
			)
		)
	});
}

function attributeFact(
	source: string,
	attribute: NativeCompilerResponse['analysis']['jsx'][number]['attributes'][number],
	index: number
): ExactJsxAttributeV1 {
	const range = sourceRange(attribute.start, attribute.length);
	const authored = source.slice(range.start, range.end);
	const authoredName = attribute.namespace
		? `${attribute.namespace}:${attribute.name ?? ''}`
		: (attribute.name ?? `...${index}`);
	const nameOffset = source.indexOf(authoredName, range.start);
	const nameRange = Object.freeze({
		start: nameOffset >= range.start && nameOffset < range.end ? nameOffset : range.start,
		end:
			nameOffset >= range.start && nameOffset < range.end
				? nameOffset + authoredName.length
				: range.start
	});
	const equals = authored.indexOf('=');
	const valueRange =
		equals < 0 ? undefined : Object.freeze({ start: range.start + equals + 1, end: range.end });
	const constant =
		attribute.valueKind === 'string'
			? stringAttributeValue(authored.slice(equals + 1))
			: attribute.valueKind === 'expression'
				? literalExpressionValue(authored.slice(equals + 1))
				: undefined;
	return Object.freeze({
		name: authoredName,
		...(attribute.namespace ? { namespace: attribute.namespace } : {}),
		localName: attribute.name ?? '',
		range,
		nameRange,
		...(valueRange ? { valueRange } : {}),
		valueKind: attribute.valueKind,
		...(constant === undefined ? {} : { constant }),
		...(attribute.valueKind === 'expression'
			? { expressionId: `expression:${attribute.start}:${index}` }
			: {})
	});
}

function literalExpressionValue(authored: string): string | number | boolean | null | undefined {
	const match = /^\{\s*(.*?)\s*\}$/su.exec(authored.trim());
	if (!match) return undefined;
	const expression = match[1]!;
	if (expression === 'true') return true;
	if (expression === 'false') return false;
	if (expression === 'null') return null;
	if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/u.test(expression)) {
		const value = Number(expression);
		return Number.isFinite(value) ? value : undefined;
	}
	if (/^"(?:[^"\\]|\\.)*"$/su.test(expression)) {
		try {
			return JSON.parse(expression) as string;
		} catch {
			return undefined;
		}
	}
	return undefined;
}

function packageFact(specifier: string): Readonly<{ name: string; subpath?: string }> | undefined {
	if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:'))
		return undefined;
	const parts = specifier.split('/');
	const name = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!;
	const subpathParts = parts.slice(name.startsWith('@') ? 2 : 1);
	return Object.freeze({
		name,
		...(subpathParts.length ? { subpath: `./${subpathParts.join('/')}` } : {})
	});
}

function sourceRange(start: number, length: number): ExactLanguageRange {
	return Object.freeze({ start, end: start + length });
}

function findNameRange(
	source: string,
	name: string,
	start: number,
	length: number
): ExactLanguageRange {
	const offset = source.indexOf(name, start);
	return offset >= start && offset < start + length
		? Object.freeze({ start: offset, end: offset + name.length })
		: sourceRange(start, 0);
}

function normalizePlacement(
	placement: 'client' | 'server' | 'isomorphic' | 'unknown'
): 'client' | 'server' | 'shared' | undefined {
	return placement === 'isomorphic' ? 'shared' : placement === 'unknown' ? undefined : placement;
}

function stringAttributeValue(value: string): string | undefined {
	const trimmed = value.trim();
	if (trimmed.length < 2) return undefined;
	const quote = trimmed[0];
	return quote === trimmed.at(-1) && (quote === '"' || quote === "'")
		? trimmed.slice(1, -1)
		: undefined;
}
