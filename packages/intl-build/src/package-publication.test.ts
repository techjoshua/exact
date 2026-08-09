import type { IntlRuntimeDescriptorV1 } from '@exactjs/intl';
import { createIntlMessageKey } from '@exactjs/intl-analyzer';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { IntlBuildCoordinator } from './coordinator.js';
import { loadIntlPackagePublication } from './package-publication.js';
import { discoverIntlPackagePublications } from './package-discovery.js';

const temporaryRoots: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
	);
});

describe('published intl package data', () => {
	it('derives development ownership and locale from the entry package by default', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'exact-intl-app-'));
		temporaryRoots.push(root);
		await writeJson(path.join(root, 'package.json'), {
			name: '@acme/application',
			exact: { internationalization: { sourceLocale: 'de-DE' } }
		});
		const coordinator = new IntlBuildCoordinator({
			applicationRoot: root,
			configuration: {}
		});
		await coordinator.beginBuild();
		const analysis = coordinator.analyzeConfiguredSource(
			'export function Greeting() { return () => <p intl:message>Hallo</p>; }',
			path.join(root, 'src', 'Greeting.tsx')
		);
		expect(analysis?.descriptors[0]).toMatchObject({
			owner: '@acme/application',
			sourceLocale: 'de-DE'
		});
		coordinator.dispose();
	});

	it('loads only selected locale exports without evaluating package code', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'exact-intl-package-'));
		temporaryRoots.push(root);
		await mkdir(path.join(root, 'dist', 'intl'), { recursive: true });
		const descriptor = publishedDescriptor('@acme/card');
		await writeJson(path.join(root, 'package.json'), {
			name: '@acme/card',
			exact: {
				internationalization: {
					protocol: 1,
					sourceLocale: 'en-US',
					messages: './intl/messages',
					catalogs: { fr: './intl/fr', de: './intl/de' }
				}
			},
			exports: {
				'./intl/messages': './dist/intl/messages.json',
				'./intl/fr': './dist/intl/fr.json',
				'./intl/de': './dist/intl/de.json'
			}
		});
		await writeJson(path.join(root, 'dist', 'intl', 'messages.json'), {
			protocol: 1,
			owner: '@acme/card',
			sourceLocale: 'en-US',
			descriptors: [descriptor]
		});
		await writeJson(
			path.join(root, 'dist', 'intl', 'fr.json'),
			catalog(descriptor, 'fr', 'Bonjour')
		);
		await writeJson(path.join(root, 'dist', 'intl', 'de.json'), catalog(descriptor, 'de', 'Hallo'));

		const publication = await loadIntlPackagePublication({
			packageJsonPath: path.join(root, 'package.json'),
			locales: ['fr-CA']
		});

		expect(publication?.catalogs.map((entry) => entry.locale)).toEqual(['fr']);
		expect(publication?.files).not.toContain(path.join(root, 'dist', 'intl', 'de.json'));
		const coordinator = new IntlBuildCoordinator({});
		await coordinator.beginBuild();
		coordinator.registerPackagePublication(publication!);
		expect(coordinator.catalogs).toHaveLength(1);
		expect(coordinator.descriptors.get('package:@acme/card')).toHaveLength(1);
	});

	it('rejects undeclared or escaping package data exports', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'exact-intl-package-'));
		temporaryRoots.push(root);
		await writeJson(path.join(root, 'package.json'), {
			name: '@acme/card',
			exact: {
				internationalization: {
					protocol: 1,
					sourceLocale: 'en-US',
					messages: './intl/messages'
				}
			},
			exports: {}
		});

		await expect(
			loadIntlPackagePublication({
				packageJsonPath: path.join(root, 'package.json'),
				locales: ['en-US']
			})
		).rejects.toThrow('does not publicly export');
	});

	it('discovers selected catalogs from installed application dependencies without executing them', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'exact-intl-app-'));
		temporaryRoots.push(root);
		const packageRoot = path.join(root, 'node_modules', '@acme', 'card');
		await mkdir(path.join(packageRoot, 'dist', 'intl'), { recursive: true });
		await writeJson(path.join(root, 'package.json'), {
			name: 'app',
			dependencies: { '@acme/card': '1.0.0' }
		});
		const descriptor = publishedDescriptor('@acme/card');
		const unusedDescriptor = {
			...publishedDescriptor('@acme/card'),
			occurrenceId: 'UnusedCard:0',
			key: createIntlMessageKey('unused card greeting')
		};
		await writeJson(path.join(packageRoot, 'package.json'), {
			name: '@acme/card',
			exact: {
				internationalization: {
					protocol: 1,
					sourceLocale: 'en-US',
					messages: './intl/messages',
					catalogs: { fr: './intl/fr', de: './intl/de' }
				}
			},
			exports: {
				'./intl/messages': './dist/intl/messages.json',
				'./intl/fr': './dist/intl/fr.json',
				'./intl/de': './dist/intl/de.json'
			}
		});
		await writeJson(path.join(packageRoot, 'dist', 'intl', 'messages.json'), {
			protocol: 1,
			owner: '@acme/card',
			sourceLocale: 'en-US',
			descriptors: [descriptor, unusedDescriptor]
		});
		await writeJson(path.join(packageRoot, 'dist', 'intl', 'fr.json'), {
			...catalog(descriptor, 'fr', 'Bonjour'),
			messages: {
				[descriptor.key]: [{ kind: 'text', value: 'Bonjour' }],
				[unusedDescriptor.key]: [{ kind: 'text', value: 'Inutilisé' }]
			}
		});
		await writeJson(path.join(packageRoot, 'dist', 'intl', 'de.json'), {
			...catalog(descriptor, 'de', 'Hallo'),
			messages: {
				[descriptor.key]: [{ kind: 'text', value: 'Hallo' }],
				[unusedDescriptor.key]: [{ kind: 'text', value: 'Unbenutzt' }]
			}
		});

		const publications = await discoverIntlPackagePublications({
			applicationRoot: root,
			locales: ['fr-CA']
		});

		expect(publications).toHaveLength(1);
		expect(publications[0]?.packageName).toBe('@acme/card');
		expect(publications[0]?.catalogs.map((entry) => entry.locale)).toEqual(['fr']);

		const coordinator = new IntlBuildCoordinator({
			applicationRoot: root,
			configuration: {
				owner: 'app',
				sourceLocale: 'en-US',
				locales: ['fr-CA']
			}
		});
		await coordinator.beginBuild();
		expect(coordinator.descriptors.has('package:@acme/card')).toBe(false);
		const reached = coordinator.analyzeConfiguredSource(
			`export const descriptorKey = ${JSON.stringify(descriptor.key)};`,
			path.join(packageRoot, 'dist', 'index.js')
		);
		expect(reached?.code).toContain('virtual:exact-intl/descriptor/');
		expect(coordinator.descriptors.get('package:@acme/card')).toHaveLength(2);
		const moduleRequest = /import "([^"]+)";/u.exec(reached?.code ?? '')?.[1];
		const reachedModule = moduleRequest ? coordinator.loadRequest(moduleRequest) : undefined;
		expect(reachedModule).toBeDefined();
		expect(reachedModule?.descriptors.map((entry) => entry.key)).toEqual([descriptor.key]);
		expect(reachedModule?.code).not.toContain(unusedDescriptor.key);
		coordinator.dispose();
	});
});

function publishedDescriptor(owner: string): IntlRuntimeDescriptorV1 {
	return {
		protocol: 1,
		owner,
		occurrenceId: 'Card:0',
		key: createIntlMessageKey('card greeting'),
		sourceLocale: 'en-US',
		target: { kind: 'content' },
		bindings: [],
		source: [{ kind: 'text', value: 'Hello' }],
		capabilities: []
	};
}

function catalog(descriptor: IntlRuntimeDescriptorV1, locale: string, value: string) {
	return {
		protocol: 1,
		locale,
		owner: descriptor.owner,
		messages: { [descriptor.key]: [{ kind: 'text', value }] }
	};
}

async function writeJson(filename: string, value: unknown): Promise<void> {
	await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`);
}
