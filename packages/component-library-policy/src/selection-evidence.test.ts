import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import type { ExactPublishedComponentBuildFacts } from '@exactjs/compiler';
import { requiresExactServerComponentSelection } from './selection-evidence.js';
import {
	createFixture,
	createSession,
	recordPackage,
	importerFacts
} from './test-support/authorization.js';

it.each(['inspected', 'missing evidence', 'denied'] as const)(
	'authorizes reached uncertain edges through the existing server gate: %s',
	async (mode) => {
		const fixture = createFixture();
		const file = path.join(fixture.library.root, 'dist/exact-component-build.json');
		const original = JSON.parse(readFileSync(file, 'utf8')) as ExactPublishedComponentBuildFacts;
		const facts = {
			...original,
			modules: original.modules.map((module) => ({
				...module,
				facts: {
					...module.facts,
					components: module.facts.components.map((component) => ({
						...component,
						placement: 'unknown',
						artifactTargets: []
					}))
				}
			})),
			exports: original.exports.map((record) => ({
				...record,
				...(mode === 'missing evidence' ? {} : { target: 'server' })
			}))
		};
		writeFileSync(file, JSON.stringify(facts));
		const session = createSession(
			fixture,
			mode === 'denied' ? { deny: ['@acme/cards'] } : undefined
		);
		try {
			recordPackage(session, fixture.library, fixture.marker);
			session.recordDependencyEdge({
				owner: 'application',
				candidate: fixture.library.key,
				specifier: '@acme/cards',
				kind: 'dependency'
			});
			const importer = importerFacts();
			const uncertain = {
				...importer,
				componentImports: importer.componentImports.map((edge) => ({
					...edge,
					artifactTargets: []
				}))
			};
			expect(requiresExactServerComponentSelection(uncertain.componentImports[0]!)).toBe(true);
			expect(
				requiresExactServerComponentSelection({
					...importer.componentImports[0]!,
					artifactTargets: ['client']
				})
			).toBe(false);
			session.recordImporterFacts(uncertain.filename, uncertain, 'v2');
			const selection = session.authorizeResolvedComponent(fixture.candidate);
			if (mode === 'inspected') {
				await expect(selection).resolves.toMatchObject({
					outcome: 'authorized',
					componentBuild: { components: [{ placement: 'unknown', artifactTargets: [] }] }
				});
				await expect(session.commitGeneration()).resolves.toHaveProperty('manifest');
			} else
				await expect(selection).rejects.toMatchObject({
					code: mode === 'denied' ? 'explicitly-denied' : 'build-facts-invalid'
				});
		} finally {
			session.dispose();
		}
	}
);
