import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
	createExactBuildInspectionCatalog,
	createExactInspectionBuildKey,
	createExactInspectionRedactions
} from '../language-tools/build-catalog.js';
import type { ExactSourceInspection } from '../language-tools/contracts.js';
import { commonRoot } from '../paths.js';
import type { CompileArtifactsOptions, CompileArtifactsResult } from '../types.js';
import { artifactAnalysis, retainArtifactAnalysis } from './analysis-results.js';

/** Finalizes the shared inspection catalog after every project artifact has compiled. */
export async function finalizeArtifactInspection(
	results: readonly CompileArtifactsResult[],
	options: CompileArtifactsOptions,
	sources: ReadonlyMap<string, string>
): Promise<CompileArtifactsResult[]> {
	const inspected = results.filter(
		(
			result
		): result is CompileArtifactsResult & { inspection: { inspection: ExactSourceInspection } } =>
			result.inspection !== undefined
	);
	if (!inspected.length) return [...results];
	const rootComponentId =
		options.inspection?.rootComponentId ??
		inspected.flatMap((result) => result.inspection.inspection.components)[0]?.id;
	if (!rootComponentId) return [...results];
	const projectRoot = path.resolve(
		options.inspection?.projectRoot ??
			options.rootDir ??
			commonRoot(results.map((result) => result.inputFile))
	);
	const sourceRecord: Record<string, string> = {};
	for (const [filename, source] of sources) sourceRecord[filename] = source;
	const inspections = inspected.map((result) => result.inspection.inspection);
	const buildKey =
		options.buildKey ??
		options.inspection?.buildKey ??
		createExactInspectionBuildKey(
			projectRoot,
			inspections.map((inspection) => ({
				filename: inspection.filename,
				source:
					sourceRecord[inspection.filename] ?? sourceRecord[path.resolve(inspection.filename)]!
			}))
		);
	const executionRoot = options.inspection?.executionRoot ?? rootComponentId;
	const catalog = createExactBuildInspectionCatalog({
		buildKey,
		root: projectRoot,
		...(options.inspection?.producer ? { producer: options.inspection.producer } : {}),
		roots: [
			{
				executionRoot,
				rootComponentId,
				inspections,
				sources: sourceRecord,
				redactions: createExactInspectionRedactions(
					results.map(artifactAnalysis),
					options.inspection?.redactions
				)
			}
		]
	});
	const inspectionFile = path.resolve(
		options.inspection?.outputFile ??
			path.join(options.outDir, '.exact-inspection', `${buildKey}.json`)
	);
	if (!isWithinDirectory(path.resolve(options.outDir), inspectionFile))
		throw new Error(`Inspection output ${inspectionFile} must remain inside artifact output`);
	await mkdir(path.dirname(inspectionFile), { recursive: true });
	await writeFile(inspectionFile, `${JSON.stringify(catalog, null, 2)}\n`);
	return results.map((result) => {
		if (!result.inspection) return result;
		return retainArtifactAnalysis(
			{
				...result,
				inspection: Object.freeze({
					inspectionFile,
					inspection: result.inspection.inspection
				})
			},
			artifactAnalysis(result)
		);
	});
}

function isWithinDirectory(directory: string, candidate: string): boolean {
	const relative = path.relative(directory, candidate);
	return (
		relative !== '' &&
		relative !== '..' &&
		!relative.startsWith(`..${path.sep}`) &&
		!path.isAbsolute(relative)
	);
}
