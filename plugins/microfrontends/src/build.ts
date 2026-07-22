import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { ExactMicrofrontendConfig } from './config.js';
import {
	generateProvidedPackageBootstrap,
	generateRemoteEntryModule,
	validateBuildKey
} from './artifacts.js';
import { allProvidedPackageKeys } from './plugin-config.js';

/** Describes one generated exposure entry without assuming a bundler runtime. */
export type ExactRemoteExposureArtifact = {
	exposure: string;
	component: string;
	root: string;
	entryId: string;
	componentFacadeId: string;
	registrationId: string;
	entrySource: string;
};

/** Bundler-neutral artifact description mapped by each supported adapter. */
export type ExactRemoteArtifactPlan = {
	buildKey: string;
	providedPackages: readonly string[];
	providedBootstrapSource: string;
	exposures: readonly ExactRemoteExposureArtifact[];
};

/** Creates canonical entries and provider publication for one application build. */
export function createExactRemoteArtifactPlan(
	config: ExactMicrofrontendConfig,
	options: { packageName: string; buildKey: string }
): ExactRemoteArtifactPlan {
	validateBuildKey(options.buildKey);
	if (!options.packageName) throw new Error('Remote artifact plan requires a package name');
	const providedPackages = Object.freeze(allProvidedPackageKeys(config.providedPackages));
	const exposures = Object.freeze(
		Object.entries(config.exposes)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([exposure, value], index) => {
				if (!exposure || !value.component)
					throw new Error(`Invalid remote exposure ${JSON.stringify(exposure)}`);
				const root = `${options.packageName}#${exposure}`;
				const base = `\0exact:remote/${index}`;
				const componentFacadeId = `${base}/component`;
				const registrationId = `${base}/registration`;
				return Object.freeze({
					exposure,
					component: value.component,
					root,
					entryId: `${base}/entry`,
					componentFacadeId,
					registrationId,
					entrySource: generateRemoteEntryModule({
						buildKey: options.buildKey,
						root,
						componentImport: componentFacadeId,
						registrationImport: registrationId
					})
				});
			})
	);
	return Object.freeze({
		buildKey: options.buildKey,
		providedPackages,
		providedBootstrapSource: generateProvidedPackageBootstrap(providedPackages),
		exposures
	});
}

/** Resolves the one full Git SHA embedded independently in client and server targets. */
export function resolveExactBuildKey(
	options: {
		buildKey?: string;
		cwd?: string;
		environment?: Readonly<Record<string, string | undefined>>;
	} = {}
): string {
	const environment = options.environment ?? process.env;
	const supplied =
		options.buildKey ??
		environment.EXACT_BUILD_KEY ??
		environment.GIT_COMMIT_SHA ??
		environment.VERCEL_GIT_COMMIT_SHA ??
		environment.GITHUB_SHA;
	if (supplied) {
		validateBuildKey(supplied);
		return supplied.toLowerCase();
	}
	let discovered: string;
	try {
		discovered = execFileSync('git', ['rev-parse', 'HEAD'], {
			cwd: path.resolve(options.cwd ?? process.cwd()),
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		}).trim();
	} catch {
		throw new Error('Unable to discover the full Git commit SHA for the eXact build');
	}
	validateBuildKey(discovered);
	return discovered.toLowerCase();
}
