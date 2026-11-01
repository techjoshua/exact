import { verifyIntlCatalogOwnership } from '../../component-composition-corpus/test-support/intl-measurement-journey.mjs';
import { captureReactiveMutations } from '@exactjs/reactive';
import { describe, expect, it } from 'vitest';
import { registerIntlArtifacts, snapshotIntlArtifacts } from './artifacts.js';
import type { IntlRuntimeDescriptorV1 } from './contracts.js';
import { createIntlEnvironment } from './environment.js';

const descriptor: IntlRuntimeDescriptorV1 = {
	protocol: 1,
	owner: 'catalog-history-controls',
	occurrenceId: 'Greeting:0',
	contract: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
	key: '47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU',
	sourceLocale: 'en-US',
	target: { kind: 'content' },
	bindings: [],
	source: [{ kind: 'text', value: 'Hello' }],
	capabilities: []
};
const catalog = (value: string) => ({
	protocol: 1,
	locale: 'fr',
	owner: descriptor.owner,
	messages: { [descriptor.key]: [{ kind: 'text' as const, value }] }
});
const text = (environment: ReturnType<typeof createIntlEnvironment>) =>
	environment.find(descriptor.owner, descriptor.key);

describe('owned catalog history', () => {
	it('keeps accepted input snapshots stable across unrelated generated revisions', () => {
		const environment = createIntlEnvironment({ locale: 'fr', descriptors: [descriptor] });
		const input = catalog('Bonjour');
		environment.addCatalog(input);
		input.messages[descriptor.key]![0]!.value = 'Changed';
		registerIntlArtifacts('history-owned-input', 1, [descriptor], []);
		expect(text(environment)).toEqual([{ kind: 'text', value: 'Bonjour' }]);
	});

	it('does not retain rejected catalog input in later replay history', () => {
		const environment = createIntlEnvironment({ locale: 'fr', descriptors: [descriptor] });
		environment.addCatalog(catalog('Bonjour'));
		expect(() => environment.addCatalog({})).toThrow(/protocol/);
		registerIntlArtifacts('history-rejected-input', 1, [descriptor], []);
		expect(text(environment)).toEqual([{ kind: 'text', value: 'Bonjour' }]);
	});

	it('rolls back manual catalogs and their replay history with reactive state', () => {
		const environment = createIntlEnvironment({ locale: 'fr', descriptors: [descriptor] });
		environment.addCatalog(catalog('Bonjour'));
		const journal = captureReactiveMutations(() => environment.addCatalog(catalog('Changed')));
		expect(text(environment)).toEqual([{ kind: 'text', value: 'Changed' }]);
		journal.rollback();
		expect(text(environment)).toEqual([{ kind: 'text', value: 'Bonjour' }]);
		registerIntlArtifacts('history-rollback-input', 1, [descriptor], []);
		expect(text(environment)).toEqual([{ kind: 'text', value: 'Bonjour' }]);
	});
});

it('keeps the last accepted registry when a generated replacement conflicts', () => {
	registerIntlArtifacts('history-conflict-first', 0, [], []);
	const stable = {
		...descriptor,
		owner: 'catalog-atomic-unique',
		contract: 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC'
	};
	registerIntlArtifacts(
		'history-stable-after',
		1,
		[stable],
		[{ ...catalog('Bonjour'), owner: stable.owner }]
	);
	const environment = createIntlEnvironment({ locale: 'fr' });
	const other = {
		...descriptor,
		owner: 'history-conflict-owner',
		contract: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'
	};
	registerIntlArtifacts(
		'history-conflict-first',
		1,
		[other, { ...other, source: [{ kind: 'text', value: 'Different' }] }],
		[]
	);
	try {
		expect(() => environment.find(stable.owner, stable.key)).toThrow(/conflicting definitions/);
		// A failed refresh must remain retryable even without another registration.
		expect(() => environment.find(stable.owner, stable.key)).toThrow(/conflicting definitions/);
		expect(() =>
			environment.addCatalog({ ...catalog('Accepted after rejection'), owner: stable.owner })
		).not.toThrow();
		registerIntlArtifacts('history-conflict-first', 2, [], []);
		expect(environment.find(stable.owner, stable.key)).toEqual([
			{ kind: 'text', value: 'Accepted after rejection' }
		]);
	} finally {
		registerIntlArtifacts('history-conflict-first', 2, [], []);
		registerIntlArtifacts('history-stable-after', 2, [], []);
	}
});

it('rolls back accepted catalog and history when a scope rejects propagation', () => {
	const environment = createIntlEnvironment({
		locale: 'fr',
		descriptors: [descriptor],
		catalogs: []
	});
	environment.addCatalog(catalog('Bonjour'));
	const child = environment.forLocale('fr-CA');
	const failure = { reason: 'catalog scope failed' };
	child.addCatalog = () => {
		throw failure;
	};
	try {
		environment.addCatalog(catalog('Changed'));
		throw new Error('Expected scope rejection');
	} catch (error) {
		expect(error).toBe(failure);
	}
	expect(text(environment)).toEqual([{ kind: 'text', value: 'Bonjour' }]);
});

it('keeps an inner catalog added while capturing an outer catalog getter', () => {
	const secondKey = 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
	const second = { ...descriptor, key: secondKey };
	const environment = createIntlEnvironment({
		locale: 'fr',
		descriptors: [descriptor, second],
		catalogs: []
	});
	let reads = 0;
	environment.addCatalog({
		protocol: 1,
		locale: 'fr',
		owner: descriptor.owner,
		messages: {
			get [descriptor.key]() {
				reads++;
				environment.addCatalog({
					...catalog('Inner'),
					messages: { [secondKey]: [{ kind: 'text', value: 'Inner' }] }
				});
				return [{ kind: 'text', value: 'Outer' }];
			}
		}
	});
	expect(reads).toBe(1);
	expect(environment.find(descriptor.owner, descriptor.key)).toEqual([
		{ kind: 'text', value: 'Outer' }
	]);
	expect(environment.find(descriptor.owner, secondKey)).toEqual([{ kind: 'text', value: 'Inner' }]);
});

it('matches the public cross-runtime catalog ownership journey', () => {
	expect(
		verifyIntlCatalogOwnership({
			createIntlEnvironment,
			registerIntlArtifacts,
			snapshotIntlArtifacts,
			captureReactiveMutations
		})
	).toBe(true);
});

it('retains current partial overlays when compacting repeated manual updates', () => {
	const secondKey = 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
	const environment = createIntlEnvironment({
		locale: 'fr',
		descriptors: [descriptor, { ...descriptor, key: secondKey }]
	});
	environment.addCatalog(catalog('First'));
	environment.addCatalog({
		...catalog('Second'),
		messages: { [secondKey]: [{ kind: 'text', value: 'Second' }] }
	});
	for (let update = 0; update < 100; update++) environment.addCatalog(catalog(`Update${update}`));
	registerIntlArtifacts('history-compacted-overlay', 1, [descriptor], []);
	expect(text(environment)).toEqual([{ kind: 'text', value: 'Update99' }]);
	expect(environment.find(descriptor.owner, secondKey)).toEqual([
		{ kind: 'text', value: 'Second' }
	]);
});
