import { verifyIntlScopedSources } from '../../component-composition-corpus/test-support/intl-measurement-journey.mjs';
import { registerIntlArtifacts, snapshotIntlArtifacts } from './artifacts.js';
import { describe, expect, it, vi } from 'vitest';
import { computed } from '@exactjs/reactive';
import { createEffectScope, withEffectScope } from '@exactjs/reactive/framework/runtime';
import type { IntlRuntimeDescriptorV1 } from './contracts.js';
import { createIntlEnvironment, defineIntlLocale } from './environment.js';

const descriptor: IntlRuntimeDescriptorV1 = {
	protocol: 1,
	owner: 'fallback-cache-test',
	occurrenceId: 'Greeting:0',
	contract: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
	key: '47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU',
	sourceLocale: 'en-US',
	target: { kind: 'content' },
	bindings: [],
	source: [{ kind: 'text', value: 'Hello' }],
	capabilities: []
};

function catalog(locale: string, value: string) {
	return {
		protocol: 1,
		locale,
		owner: descriptor.owner,
		messages: { [descriptor.key]: [{ kind: 'text', value }] }
	};
}

describe('environment locale fallback reuse', () => {
	it('keeps warmed readers reactive across locale changes and catalog replacement', ({
		onTestFinished
	}) => {
		const scope = createEffectScope();
		onTestFinished(() => scope.stop());
		const environment = createIntlEnvironment({
			locale: 'fr-CA',
			descriptors: [descriptor],
			catalogs: [catalog('fr', 'Bonjour'), catalog('de', 'Hallo')]
		});
		const first = withEffectScope(scope, () =>
			computed(() => environment.find(descriptor.owner, descriptor.key))
		);
		const second = withEffectScope(scope, () =>
			computed(() => environment.find(descriptor.owner, descriptor.key))
		);
		const expectReaders = (value: string) => {
			for (const reader of [first, second]) expect(reader.get()).toEqual([{ kind: 'text', value }]);
		};
		expectReaders('Bonjour');
		environment.setLocale('de-DE');
		expectReaders('Hallo');
		environment.addCatalog(catalog('de-DE', 'Guten Tag'));
		expectReaders('Guten Tag');
		environment.addCatalog(catalog('de-DE', 'Servus'));
		expectReaders('Servus');
		// Observable public state remains valid even when mutation bypasses setLocale.
		environment.state.locale = 'fr-CA';
		expectReaders('Bonjour');
	});

	it('preserves extension, region, script, and language precedence after warming a miss', () => {
		const locale = defineIntlLocale('zh-Hant-TW-u-nu-latn');
		const environment = createIntlEnvironment({ locale, descriptors: [descriptor], catalogs: [] });
		const find = () => environment.find(descriptor.owner, descriptor.key);
		expect(find()).toBeUndefined();
		for (const candidate of ['zh', 'zh-Hant', 'zh-Hant-TW', locale]) {
			environment.addCatalog(catalog(candidate, candidate));
			expect(find()).toEqual([{ kind: 'text', value: candidate }]);
		}
		const scoped = environment.forLocale(defineIntlLocale('zh-Hans-CN'));
		expect(scoped.find(descriptor.owner, descriptor.key)).toEqual([{ kind: 'text', value: 'zh' }]);
		expect(find()).toEqual([{ kind: 'text', value: locale }]);
	});

	it('does not repeat native normalization for successive messages in one locale', () => {
		const environment = createIntlEnvironment({
			locale: defineIntlLocale('fr-CA-x-once'),
			descriptors: [descriptor],
			catalogs: []
		});
		const canonicalize = vi.spyOn(Intl, 'getCanonicalLocales');
		try {
			environment.find(descriptor.owner, descriptor.key);
			const initialCalls = canonicalize.mock.calls.length;
			expect(initialCalls).toBeGreaterThan(0);
			for (let index = 0; index < 10; index++) environment.find(descriptor.owner, descriptor.key);
			expect(canonicalize).toHaveBeenCalledTimes(initialCalls);
		} finally {
			canonicalize.mockRestore();
		}
	});

	it('reuses fallback work across fresh environments without sharing their catalogs or callbacks', () => {
		const locale = defineIntlLocale('fr-CA-x-shared');
		const missingA = vi.fn();
		const missingB = vi.fn();
		const first = createIntlEnvironment({
			locale,
			descriptors: [descriptor],
			catalogs: [],
			onMissingMessage: missingA
		});
		const second = createIntlEnvironment({
			locale,
			descriptors: [descriptor],
			catalogs: [],
			onMissingMessage: missingB
		});
		expect(first.find(descriptor.owner, descriptor.key)).toBeUndefined();
		const canonicalize = vi.spyOn(Intl, 'getCanonicalLocales');
		try {
			expect(second.find(descriptor.owner, descriptor.key)).toBeUndefined();
			expect(canonicalize).not.toHaveBeenCalled();
		} finally {
			canonicalize.mockRestore();
		}
		expect(missingA).toHaveBeenCalledTimes(1);
		expect(missingB).toHaveBeenCalledTimes(1);
		first.addCatalog(catalog('fr', 'First tenant'));
		second.addCatalog(catalog('fr', 'Second tenant'));
		expect(first.find(descriptor.owner, descriptor.key)).toEqual([
			{ kind: 'text', value: 'First tenant' }
		]);
		expect(second.find(descriptor.owner, descriptor.key)).toEqual([
			{ kind: 'text', value: 'Second tenant' }
		]);
		first.setLocale('de-DE');
		expect(second.state.locale).toBe(locale);
	});
});

describe('generated sources in existing locale scopes', () => {
	it('adopts lazy catalogs and later generations without recreating a scope', () => {
		const environment = createIntlEnvironment({ locale: 'en-US' });
		const french = environment.forLocale('fr-FR');
		const canadian = french.forLocale('fr-CA');
		registerIntlArtifacts('scope-lazy-owned', 1, [descriptor], [catalog('fr', 'Bonjour')]);
		try {
			expect(french.find(descriptor.owner, descriptor.key)).toEqual([
				{ kind: 'text', value: 'Bonjour' }
			]);
			expect(canadian.find(descriptor.owner, descriptor.key)).toEqual([
				{ kind: 'text', value: 'Bonjour' }
			]);
			registerIntlArtifacts('scope-lazy-owned', 2, [descriptor], [catalog('fr', 'Salut')]);
			expect(french.find(descriptor.owner, descriptor.key)).toEqual([
				{ kind: 'text', value: 'Salut' }
			]);
			expect(environment.forLocale('fr-FR')).toBe(french);
		} finally {
			registerIntlArtifacts('scope-lazy-owned', 3, [], []);
		}
	});

	it('preserves scoped manual overlays while generated sources refresh', () => {
		registerIntlArtifacts('scope-manual-owned', 1, [descriptor], [catalog('fr', 'Generated')]);
		try {
			const environment = createIntlEnvironment({ locale: 'en-US' });
			const french = environment.forLocale('fr-FR');
			french.addCatalog(catalog('fr', 'Scoped'));
			const canadian = french.forLocale('fr-CA');
			registerIntlArtifacts(
				'scope-manual-owned',
				2,
				[descriptor],
				[catalog('fr', 'New generated')]
			);
			expect(french.find(descriptor.owner, descriptor.key)).toEqual([
				{ kind: 'text', value: 'Scoped' }
			]);
			expect(canadian.find(descriptor.owner, descriptor.key)).toEqual([
				{ kind: 'text', value: 'Scoped' }
			]);
			environment.addCatalog(catalog('fr', 'Parent update'));
			expect(canadian.find(descriptor.owner, descriptor.key)).toEqual([
				{ kind: 'text', value: 'Parent update' }
			]);
		} finally {
			registerIntlArtifacts('scope-manual-owned', 3, [], []);
		}
	});

	it('retains explicitly configured source isolation', () => {
		const environment = createIntlEnvironment({
			locale: 'en-US',
			descriptors: [descriptor],
			catalogs: [catalog('fr', 'Configured')]
		});
		const french = environment.forLocale('fr-FR');
		registerIntlArtifacts(
			'scope-configured-control',
			1,
			[descriptor],
			[catalog('fr', 'Generated')]
		);
		try {
			expect(french.find(descriptor.owner, descriptor.key)).toEqual([
				{ kind: 'text', value: 'Configured' }
			]);
		} finally {
			registerIntlArtifacts('scope-configured-control', 2, [], []);
		}
	});
});

it('matches the public cross-runtime scoped source journey', () => {
	expect(
		verifyIntlScopedSources({ createIntlEnvironment, registerIntlArtifacts, snapshotIntlArtifacts })
	).toBe(true);
});
