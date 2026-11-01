import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { API } from '@typescript/native/unstable/async';
import {
	isExportDeclaration,
	isImportDeclaration,
	isNamespaceExport,
	isStringLiteral,
	type SourceFile
} from '@typescript/native/unstable/ast';
import type { ExactPackageEnhancementImport } from './contracts.js';

/** Detached configuration text and declarations, ready for the existing loading owner. */
export type PreparedNativeConfigSource = Readonly<{
	executableSource: string;
	packageEnhancements: readonly ExactPackageEnhancementImport[];
}>;

const require = createRequire(import.meta.url);
let preparationTail: Promise<void> = Promise.resolve();

/**
 * Prepares one configuration without executing it or checking its application project.
 *
 * The pinned TypeScript7.0.2 official async API owns parsing. Its snapshot and API are closed
 * before isolated CLI emit. Temporary files and the emit child are closed before this
 * promise settles, and returned values retain no AST, API or process handles. Concurrent
 * preparations share one serial tool lifetime. Loading, metadata restoration and config
 * normalization remain with the existing caller.
 *
 * TypeScript extensions retain their native emit format. In particular, `.cts` produces
 * CommonJS text. This function does not add a CommonJS execution strategy to an ESM loader.
 */
export function prepareNativeConfigSource(
	authoredSource: string,
	configPath: string,
	options: Readonly<{ emit?: boolean }> = {}
): Promise<PreparedNativeConfigSource> {
	const pending = preparationTail.then(() =>
		prepareSource(authoredSource, path.resolve(configPath), options.emit !== false)
	);
	preparationTail = pending.then(
		() => {},
		() => {}
	);
	return pending;
}

async function prepareSource(
	authoredSource: string,
	configPath: string,
	emit: boolean
): Promise<PreparedNativeConfigSource> {
	const temporary = await mkdtemp(path.join(tmpdir(), `exact-config-prepare-${process.pid}-`));
	try {
		const filename = path.join(temporary, path.basename(configPath));
		const parseConfig = path.join(temporary, 'parse.json');
		await writeFile(filename, authoredSource);
		await writeFile(
			parseConfig,
			JSON.stringify({
				compilerOptions: {
					target: 'ES2022',
					module: 'ESNext',
					moduleResolution: 'Bundler',
					allowJs: true,
					noCheck: true,
					noResolve: true,
					noLib: true,
					types: []
				},
				files: [filename]
			})
		);
		const declaration = await parseDeclarations(
			authoredSource,
			configPath,
			filename,
			parseConfig,
			temporary
		);
		if (!emit || !/\.[cm]?ts$/i.test(configPath)) return declaration;

		// The API lifetime is over. This program contains only the sanitized config,
		// never imported TS roots or an inherited application compiler configuration.
		await writeFile(filename, declaration.executableSource);
		const outputDirectory = path.join(temporary, 'output');
		const emitConfig = path.join(temporary, 'emit.json');
		await writeFile(
			emitConfig,
			JSON.stringify({
				compilerOptions: {
					target: 'ES2022',
					module: 'ESNext',
					moduleResolution: 'Bundler',
					verbatimModuleSyntax: true,
					isolatedModules: true,
					noCheck: true,
					noResolve: true,
					types: [],
					noEmitOnError: true,
					outDir: outputDirectory
				},
				files: [filename]
			})
		);
		await emitConfigSource(emitConfig, temporary, configPath);
		const extension = path.extname(configPath).toLowerCase();
		const outputExtension = extension === '.mts' ? '.mjs' : extension === '.cts' ? '.cjs' : '.js';
		const outputName = path.basename(configPath, path.extname(configPath)) + outputExtension;
		return {
			...declaration,
			executableSource: await readFile(path.join(outputDirectory, outputName), 'utf8')
		};
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
}

// API7.0.2 exposes ImportAttributes.attributes. Projection to strings/ranges is
// completed while its snapshot is live, so no decoded nodes escape this owner.
async function parseDeclarations(
	authoredSource: string,
	configPath: string,
	filename: string,
	parseConfig: string,
	directory: string
): Promise<PreparedNativeConfigSource> {
	const api = new API({ cwd: directory });
	try {
		const snapshot = await api.updateSnapshot({ openProjects: [parseConfig] });
		try {
			const project = snapshot.getProject(parseConfig);
			const source = await project?.program.getSourceFile(filename);
			if (!project || !source || source.text !== authoredSource)
				throw new Error(`Unable to parse ${configPath}: native source snapshot unavailable`);
			const errors = await project.program.getSyntacticDiagnostics(filename);
			if (errors.length)
				throw new Error(
					`Unable to parse ${configPath}: ${errors.map((error) => error.text).join('\n')}`
				);
			return extractDeclarations(source, configPath);
		} finally {
			await snapshot.dispose();
		}
	} finally {
		await api.close();
	}
}

function extractDeclarations(source: SourceFile, configPath: string): PreparedNativeConfigSource {
	const registrations: ExactPackageEnhancementImport[] = [];
	const removals: { start: number; end: number }[] = [];
	for (const statement of source.statements) {
		if (!isImportDeclaration(statement) && !isExportDeclaration(statement)) continue;
		const attributes: Record<string, string> = {};
		for (const attribute of statement.attributes?.attributes ?? []) {
			if (isStringLiteral(attribute.value)) attributes[attribute.name.text] = attribute.value.text;
		}
		if (attributes.type !== 'exact-enhancement' || attributes.scope !== 'package') continue;
		if (!isExportDeclaration(statement))
			throw new Error(
				`${configPath}: package-scoped enhancements must use an attributed namespace export`
			);
		if (
			statement.isTypeOnly ||
			!statement.moduleSpecifier ||
			!isStringLiteral(statement.moduleSpecifier) ||
			!statement.exportClause ||
			!isNamespaceExport(statement.exportClause)
		)
			throw new Error(
				`${configPath}: package-scoped enhancements require an attributed namespace export`
			);
		registrations.push({
			localName: statement.exportClause.name.text,
			moduleSpecifier: statement.moduleSpecifier.text,
			importKind: 'namespace',
			declaredIn: configPath
		});
		removals.push({ start: statement.getFullStart(), end: statement.end });
	}
	const names = new Set<string>();
	for (const registration of registrations) {
		if (names.has(registration.localName))
			throw new Error(
				`${configPath}: duplicate package-scoped enhancement identifier ${JSON.stringify(registration.localName)}`
			);
		names.add(registration.localName);
	}
	let executableSource = source.text;
	for (const removal of removals.reverse())
		executableSource =
			executableSource.slice(0, removal.start) +
			// Match UTF16 code units, including both halves of a surrogate pair.
			executableSource.slice(removal.start, removal.end).replace(/[^\r\n]/g, ' ') +
			executableSource.slice(removal.end);
	return {
		executableSource,
		packageEnhancements: registrations
	};
}

/** Resolves the selected package's declared CLI entry, leaving platform selection to it. */
async function nativeCliEntry(): Promise<string> {
	const manifestPath = require.resolve('@typescript/native/package.json');
	const manifest: { bin?: string | Record<string, string> } = JSON.parse(
		await readFile(manifestPath, 'utf8')
	);
	const entry = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.tsc;
	if (!entry) throw new Error('The configured TypeScript native package has no tsc entry');
	return path.resolve(path.dirname(manifestPath), entry);
}

// Runtime selection is Node/Bun's own executable, never a PATH-dependent node
// command or a private vendor binary. Close, including failed spawn, is awaited.
async function emitConfigSource(
	config: string,
	directory: string,
	authoredPath: string
): Promise<void> {
	const entry = await nativeCliEntry();
	const child = spawn(process.execPath, [entry, '--project', config, '--pretty', 'false'], {
		cwd: directory,
		stdio: ['ignore', 'pipe', 'pipe']
	});
	let diagnostic = '';
	child.stdout.on('data', (data: Buffer) => {
		diagnostic += data.toString();
	});
	child.stderr.on('data', (data: Buffer) => {
		diagnostic += data.toString();
	});
	try {
		await new Promise<void>((resolve, reject) => {
			child.once('error', reject);
			child.once('close', (code, signal) => {
				if (code === 0) resolve();
				else
					reject(
						new Error(
							`Unable to transpile ${authoredPath}: ${diagnostic.trim() || signal || `exit ${code}`}`
						)
					);
			});
		});
	} finally {
		if (child.exitCode === null && child.signalCode === null) {
			const closed = new Promise<void>((resolve) => {
				child.once('close', () => resolve());
			});
			child.kill();
			await closed;
		}
	}
}
