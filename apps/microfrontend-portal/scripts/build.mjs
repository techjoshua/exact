import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exact } from '@exactjs/vite-plugin';
import { build } from 'vite';

const sampleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(sampleRoot, 'dist');

/** Builds remote artifacts first, then binds their emitted entries into the public page build. */
export async function buildMicrofrontendPortal() {
	const previousBuildKey = process.env.EXACT_BUILD_KEY;
	const previousBilling = process.env.EXACT_BILLING_ENTRY;
	const previousBranding = process.env.EXACT_BRANDING_ENTRY;
	const previousCompact = process.env.EXACT_COMPACT_BRANDING_ENTRY;
	process.env.EXACT_BUILD_KEY = resolveBuildKey();
	try {
		const billing = await buildRemote('billing', 'billing');
		const branding = await buildRemote('branding', 'branding');
		process.env.EXACT_BILLING_ENTRY = publicUrl('billing', billing['./Billing']);
		process.env.EXACT_BRANDING_ENTRY = publicUrl('branding', branding['./Shell']);
		process.env.EXACT_COMPACT_BRANDING_ENTRY = publicUrl('branding', branding['./CompactShell']);
		await buildClient('page', path.join(outputRoot, 'public'), false);
		await build({
			root: sampleRoot,
			logLevel: 'warn',
			build: {
				ssr: path.join(sampleRoot, 'server', 'start.ts'),
				outDir: path.join(outputRoot, 'server'),
				emptyOutDir: true,
				rollupOptions: { output: { entryFileNames: 'start.js' } }
			}
		});
		return { billing, branding, buildKey: process.env.EXACT_BUILD_KEY };
	} finally {
		restore('EXACT_BUILD_KEY', previousBuildKey);
		restore('EXACT_BILLING_ENTRY', previousBilling);
		restore('EXACT_BRANDING_ENTRY', previousBranding);
		restore('EXACT_COMPACT_BRANDING_ENTRY', previousCompact);
	}
}

async function buildRemote(name, outputName) {
	let entries = {};
	await buildClient(name, path.join(outputRoot, 'public', 'remotes', outputName), true, (value) => {
		entries = value;
	});
	return entries;
}

async function buildClient(name, outDir, emptyOutDir, onRemoteEntries) {
	const applicationRoot = path.join(sampleRoot, name);
	await build({
		root: applicationRoot,
		configFile: false,
		logLevel: 'warn',
		resolve: { alias: sharedAlias() },
		plugins: [exact({ applicationRoot, onRemoteEntries })],
		build: { outDir, emptyOutDir, assetsInlineLimit: 0 }
	});
}

function sharedAlias() {
	return {
		'@exactjs/sample-microfrontend-portal/shared': path.join(sampleRoot, 'src', 'shared.ts')
	};
}

function publicUrl(remote, entry) {
	if (!entry) throw new Error(`The ${remote} build did not emit its configured exposure`);
	return `/remotes/${remote}/${entry.replaceAll('\\', '/')}`;
}

function resolveBuildKey() {
	return execFileSync('git', ['rev-parse', 'HEAD'], {
		cwd: path.resolve(sampleRoot, '../..'),
		encoding: 'utf8'
	}).trim();
}

function restore(name, value) {
	if (value === undefined) delete process.env[name];
	else process.env[name] = value;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
	await buildMicrofrontendPortal();
