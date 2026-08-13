import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { ExactComponentAuthorizationIdentity } from '@exactjs/core';
import type { DynamicComponentArtifact } from '@exactjs/core';
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
	componentAuthorization?: ExactComponentAuthorizationIdentity;
	providedPackages: readonly string[];
	providedBootstrapSource: string;
	exposures: readonly ExactRemoteExposureArtifact[];
};

/** Immutable output accepted only after one complete bundler generation succeeds. */
export type ExactRemoteAcceptedGeneration = Readonly<{
	buildKey: string;
	entries: Readonly<Record<string, string>>;
	artifacts: Readonly<Record<string, DynamicComponentArtifact>>;
	resources: Readonly<{
		css: readonly string[];
		assets: readonly string[];
		chunks: readonly string[];
	}>;
}>;

/** Validates and freezes one adapter's actual emitted remote outputs. */
export function acceptExactRemoteArtifactGeneration(
	plan: ExactRemoteArtifactPlan,
	output: Readonly<{
		entries: Readonly<Record<string, string>>;
		publicPath?: string;
		immutable?: boolean;
		integrity?: Readonly<Record<string, string>>;
		css?: readonly string[];
		assets?: readonly string[];
		chunks?: readonly string[];
	}>
): ExactRemoteAcceptedGeneration {
	const entries: Record<string, string> = {};
	const artifacts: Record<string, DynamicComponentArtifact> = {};
	for (const exposure of plan.exposures) {
		const emitted = output.entries[exposure.exposure];
		if (!emitted)
			throw new Error(
				`Missing emitted entry for remote exposure ${JSON.stringify(exposure.exposure)}`
			);
		const url = publicArtifactUrl(output.publicPath, emitted);
		entries[exposure.exposure] = url;
		if (output.immutable) {
			artifacts[exposure.exposure] = Object.freeze({
				url,
				authorized: true,
				immutable: true,
				...(output.integrity?.[exposure.exposure]
					? { integrity: output.integrity[exposure.exposure] }
					: {})
			});
		}
	}
	return Object.freeze({
		buildKey: plan.buildKey,
		entries: Object.freeze(entries),
		artifacts: Object.freeze(artifacts),
		resources: Object.freeze({
			css: Object.freeze(uniqueOutput(output.css)),
			assets: Object.freeze(uniqueOutput(output.assets)),
			chunks: Object.freeze(uniqueOutput(output.chunks))
		})
	});
}

function publicArtifactUrl(publicPath: string | undefined, filename: string): string {
	if (/^https:\/\//.test(filename) || (filename.startsWith('/') && !filename.startsWith('//')))
		return filename;
	const prefix = publicPath && publicPath !== 'auto' ? publicPath.replace(/\/$/, '') : '';
	return `${prefix}/${filename.replace(/^\/+/, '')}`;
}

function uniqueOutput(values: readonly string[] | undefined): string[] {
	return [...new Set(values ?? [])].sort();
}

/** Creates canonical entries and provider publication for one application build. */
export function createExactRemoteArtifactPlan(
	config: ExactMicrofrontendConfig,
	options: {
		packageName: string;
		buildKey: string;
		componentAuthorization?: ExactComponentAuthorizationIdentity;
	}
): ExactRemoteArtifactPlan {
	validateBuildKey(options.buildKey);
	if (
		options.componentAuthorization &&
		options.componentAuthorization.buildKey !== options.buildKey
	)
		throw new Error('Remote component authorization does not match its build key');
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
						...(options.componentAuthorization
							? { componentAuthorization: options.componentAuthorization }
							: {}),
						root,
						componentImport: componentFacadeId,
						registrationImport: registrationId
					})
				});
			})
	);
	return Object.freeze({
		buildKey: options.buildKey,
		...(options.componentAuthorization
			? { componentAuthorization: options.componentAuthorization }
			: {}),
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
