import { access } from 'node:fs/promises';
import path from 'node:path';
import {
	artifactGraphEntryFromCompileResult,
	createExactArtifactGraph,
	diffExactArtifactPlans
} from '../artifacts.js';
import { invalidateExpressionModule } from '../expression/session.js';
import type {
	ExactArtifactDevState,
	ExactArtifactDevStateOptions,
	ExactArtifactDevStateUpdate
} from '../types.js';
import { affectedArtifactInputs } from './dev-state-planning.js';

import { compileArtifactPlanEntries } from './artifact-compilation.js';
import { createExactArtifactPlan } from './artifact-plan.js';

/** Compiles an artifact graph state useful for watch-mode bundler integrations. */
export async function createExactArtifactDevState(
	inputs: readonly string[],
	options: ExactArtifactDevStateOptions
): Promise<ExactArtifactDevState> {
	const plan = await createExactArtifactPlan(inputs, options);
	const compiled = await compileArtifactPlanEntries(plan.entries, {
		filename: (entry) => options.filename ?? entry.inputFile,
		serverComponents: options.serverComponents,
		session: options.session,
		pluginRegistry: options.pluginRegistry
	});
	const entries = compiled.map(artifactGraphEntryFromCompileResult);
	return {
		plan,
		entries,
		graph: createExactArtifactGraph(entries, options)
	};
}

/** Updates a watch-mode artifact graph by recompiling added and changed inputs only. */
export async function updateExactArtifactDevState(
	state: ExactArtifactDevState,
	inputs: readonly string[],
	changedInputs: readonly string[],
	options: ExactArtifactDevStateOptions
): Promise<ExactArtifactDevStateUpdate> {
	for (const changed of changedInputs) {
		let removed = false;
		try {
			await access(changed);
		} catch {
			removed = true;
		}
		if (options.session) options.session.invalidate(changed, removed);
		else invalidateExpressionModule(changed, removed);
	}
	const nextPlan = await createExactArtifactPlan(inputs, options);
	const diff = diffExactArtifactPlans(state.plan, nextPlan, {
		changedInputs: affectedArtifactInputs(state.entries, changedInputs)
	});
	const retainedInputs = new Set(diff.retained.map((entry) => path.resolve(entry.inputFile)));
	const retainedEntries = state.entries.filter((entry) =>
		retainedInputs.has(path.resolve(entry.inputFile))
	);
	const compiled = await compileArtifactPlanEntries([...diff.added, ...diff.changed], {
		filename: (entry) => options.filename ?? entry.inputFile,
		serverComponents: options.serverComponents,
		session: options.session,
		pluginRegistry: options.pluginRegistry
	});
	const entries = [...retainedEntries, ...compiled.map(artifactGraphEntryFromCompileResult)].sort(
		(left, right) => left.inputFile.localeCompare(right.inputFile)
	);
	return {
		plan: nextPlan,
		entries,
		graph: createExactArtifactGraph(entries, options),
		diff,
		compiled
	};
}
