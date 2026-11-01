import { validateIntlPackageMetadata } from './package-metadata.js';
import { verifyIntlPatternObservations } from '../../component-composition-corpus/test-support/intl-pattern-journey.mjs';
import { expect, it } from 'vitest';
import { createIntlEnvironment } from './environment.js';
import {
	materializeIntlTranslation,
	projectIntlTranslationContract
} from './translation-contract.js';
import { measurementDescriptor } from './test-support/measurement-descriptor.js';

it('returns writable translation projections independent of execution descriptors', () => {
	const descriptor = measurementDescriptor('length', 'road', 'meter', {});
	const projection = projectIntlTranslationContract(descriptor.bindings, descriptor.source);
	if (false) {
		// @ts-expect-error Projections retain their TypeScript readonly declarations.
		projection.source = [];
	}
	const writable = projection.source[0] as { kind: string; id: string };
	writable.id = 'observation';
	(projection.placeholders as unknown[]).length = 0;
	expect(
		projectIntlTranslationContract(descriptor.bindings, descriptor.source).placeholders
	).toHaveLength(1);
});

it('returns independent ordinary formatter plans from materialization', () => {
	const descriptor = measurementDescriptor('length', 'road', 'meter', {});
	const projection = projectIntlTranslationContract(descriptor.bindings, descriptor.source);
	const pattern = materializeIntlTranslation(projection.source, descriptor);
	const node = pattern[0];
	if (node?.kind !== 'format' || node.formatter.kind !== 'unit')
		throw new Error('formatter control');
	const formatter = node.formatter as { sourceUnit: string; options: Record<string, unknown> };
	formatter.sourceUnit = 'kilometer';
	formatter.options.maximumFractionDigits = 1;
	(node.bindings as number[])[0] = 123;
	const next = materializeIntlTranslation(projection.source, descriptor)[0];
	expect(next).toEqual(descriptor.source[0]);
});

it('keeps pattern observations writable without changing cached or scoped execution plans', () => {
	const descriptor = measurementDescriptor('length', 'road', 'meter', {});
	const projection = projectIntlTranslationContract(descriptor.bindings, descriptor.source);
	const environment = createIntlEnvironment({
		locale: 'fr',
		descriptors: [descriptor],
		catalogs: [
			{
				protocol: 1,
				locale: 'fr',
				owner: descriptor.owner,
				messages: { [descriptor.key]: projection.source }
			}
		]
	});
	const first = environment.find(descriptor.owner, descriptor.key)!;
	const node = first[0];
	if (node?.kind !== 'format' || node.formatter.kind !== 'unit')
		throw new Error('formatter control');
	(node.formatter as { sourceUnit: string }).sourceUnit = 'kilometer';
	(first as unknown[]).length = 0;
	expect(environment.find(descriptor.owner, descriptor.key)).toEqual(descriptor.source);
	expect(environment.forLocale('fr-FR').find(descriptor.owner, descriptor.key)).toEqual(
		descriptor.source
	);
});

it('preserves nested selector, element, scalar, opaque and pseudo-localized ownership', () => {
	expect(
		verifyIntlPatternObservations({
			validateIntlPackageMetadata,
			createIntlEnvironment,
			projectIntlTranslationContract,
			materializeIntlTranslation
		})
	).toBe(true);
});
