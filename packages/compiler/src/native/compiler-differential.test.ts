import { describe, expect, it } from 'vitest';
import { transformSource } from '../compilation/transformation.js';
import { createCompilerSession } from '../expression/session.js';
import type { ExactCompilerManifest } from '../types.js';

const filename = 'ProjectPage.tsx';
const source = `
	import type { Component } from "@exactjs/core";
	import { readFile } from "node:fs/promises";
	export function ProjectPage(
		this: Component<{ project?: string; width?: number }>,
		props: { label: string }
	) {
		const suffix = "!";
		const title = props.label + suffix;
		this.task.server(async ({ signal }) => {
			this.state.project = await readFile("project.txt", "utf8");
		});
		this.task.client(({ signal }) => {
			this.state.width = window.innerWidth;
		});
		return () => (
			<button title={title} onClick={() => this.state.width++}>
				{this.state.project}
			</button>
		);
	}
`;

describe('compiler semantic backends', () => {
	it('preserves the stable compiler manifest across native and legacy hosts', () => {
		const native = transformSource(source, { filename });
		const legacy = transformSource(source, { filename, compiler: 'legacy' });

		expect(stableManifest(native.manifest)).toEqual(stableManifest(legacy.manifest));
		expect(native.manifest.resumptions[0]?.client.statePaths).toEqual(['project', 'width']);
		expect(native.manifest.continuations[0]?.activation).toEqual(
			expect.objectContaining({
				stateReads: [],
				dependencies: []
			})
		);
	});

	it('preserves the stable contract after an incremental semantic edit', () => {
		const nativeSession = createCompilerSession();
		const legacySession = createCompilerSession({ compiler: 'legacy' });
		const initial = source.replace(
			'props: { label: string }',
			'props: { label: string; step: number }'
		);
		const updated = initial.replace('this.state.width++', 'this.state.width += props.step');
		try {
			transformSource(initial, { filename, session: nativeSession });
			transformSource(initial, { filename, session: legacySession });
			const native = transformSource(updated, { filename, session: nativeSession });
			const legacy = transformSource(updated, { filename, session: legacySession });

			expect(stableManifest(native.manifest)).toEqual(stableManifest(legacy.manifest));
			expect(native.manifest.resumptions[0]?.client.statePaths).toEqual(['project', 'width']);
			expect(
				native.manifest.callables.some((callable) =>
					callable.stateReads.some((read) => read.path === 'width')
				)
			).toBe(true);
		} finally {
			nativeSession.dispose();
			legacySession.dispose();
		}
	});
});

function stableManifest(manifest: ExactCompilerManifest) {
	return {
		components: manifest.components
			.map((component) => ({
				name: component.name,
				exported: component.exported,
				placement: component.placement,
				artifactTargets: [...(component.artifactTargets ?? [])].sort(),
				clientIslandCount: component.clientIslandCount,
				splitBoundaries: [...component.splitBoundaries].sort(),
				diagnostics: [...component.diagnostics].sort(),
				tasks: component.tasks
					.map((task) => ({
						id: task.id,
						placement: task.placement,
						priority: task.priority,
						readiness: task.readiness,
						async: task.async,
						dependencies: task.dependencies,
						reads: task.reads,
						writes: task.writes,
						contexts: task.contexts,
						diagnostics: [...task.diagnostics].sort()
					}))
					.sort(byJson)
			}))
			.sort(byJson),
		exports: manifest.exports,
		symbols: manifest.symbols
			.map(({ id: _id, componentId: _componentId, ...symbol }) => symbol)
			.sort(byJson),
		boundaries: manifest.boundaries
			.map(
				({ id: _id, componentId: _componentId, ownerComponentId: _owner, ...boundary }) => boundary
			)
			.sort(byJson),
		callables: manifest.callables
			.filter((callable) => callable.kind !== 'component')
			.map((callable) => ({
				kind: callable.kind,
				artifactTargets: [...callable.artifactTargets].sort(),
				exportNames: [...callable.exportNames].sort(),
				stateReads: [...callable.stateReads].sort(byJson),
				stateWrites: [...callable.stateWrites].sort(byJson),
				contexts: [...callable.contexts].sort(byJson),
				reevaluationSafe: callable.reevaluationSafe
			}))
			.sort(byJson),
		continuations: manifest.continuations
			.map((continuation) => ({
				id: continuation.id,
				taskId: continuation.taskId,
				placement: continuation.placement,
				readiness: continuation.readiness,
				async: continuation.async,
				activation: continuation.activation,
				effects: {
					...continuation.effects,
					boundaries: continuation.effects.boundaries.length
				},
				lifetime: continuation.ownership.lifetime,
				cancellation: continuation.cancellation
			}))
			.sort(byJson),
		resumptions: manifest.resumptions
			.map((resumption) => ({
				serverRender: resumption.serverRender,
				client: {
					statePaths: [...resumption.client.statePaths].sort(),
					contexts: [...resumption.client.contexts].sort(),
					boundaries: resumption.client.boundaries.length
				}
			}))
			.sort(byJson),
		policy: stablePolicy(manifest),
		requiredCapabilities: manifest.requiredCapabilities,
		assets: manifest.assets,
		serverActions: Object.values(manifest.serverActions)
			.map(({ componentId: _componentId, ...action }) => action)
			.sort(byJson),
		diagnostics: [...manifest.diagnostics].sort()
	};
}

function stablePolicy(manifest: ExactCompilerManifest) {
	const subjectsById = new Map(manifest.policy.subjects.map((subject) => [subject.id, subject]));
	return {
		subjects: manifest.policy.subjects
			.map(({ id: _id, componentId: _componentId, ...subject }) => subject)
			.sort(byJson),
		flows: manifest.policy.flows
			.map((flow) => ({
				kind: flow.kind,
				boundary: flow.boundary,
				authorized: flow.authorized,
				policy: flow.policy,
				path: flowSubjectPath(flow.from, flow.to, subjectsById)
			}))
			.sort(byJson),
		secretConsumers: [...manifest.policy.secretConsumers].sort(byJson)
	};
}

function flowSubjectPath(
	from: readonly string[],
	to: string,
	subjects: ReadonlyMap<string, ExactCompilerManifest['policy']['subjects'][number]>
) {
	for (const id of [to, ...from]) {
		const path = subjects.get(id)?.path;
		if (path) return path;
	}
	return undefined;
}

function byJson(left: unknown, right: unknown): number {
	return JSON.stringify(left).localeCompare(JSON.stringify(right));
}
