import { buildLibrary, type LibraryBuildOptions } from './build.js';
import { watchLibraryBuild } from './watch.js';

/** Parses the library subcommand independently of application compilation flags. */
export async function runLibraryBuildCli(argv: string[]): Promise<void> {
	const options: LibraryBuildOptions = {};
	let watch = false;
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		if (arg === '--help' || arg === '-h') {
			console.log(
				'Usage: exactc build-library [--root directory] [--project tsconfig.json] [--skip-declarations] [--watch]'
			);
			return;
		}
		if (arg === '--watch') watch = true;
		else if (arg === '--skip-declarations') options.declarations = false;
		else if (arg === '--root' || arg === '--project') {
			const value = argv[++index];
			if (!value || value.startsWith('-')) throw new Error(`${arg} requires a value`);
			options[arg === '--root' ? 'root' : 'project'] = value;
		} else
			throw new Error(
				`Unknown build-library argument: ${arg}. Supported options are --root, --project, --skip-declarations, and --watch`
			);
	}
	if (!watch) return buildLibrary(options);
	const watcher = watchLibraryBuild(options, {
		onBuild: () => console.log('Library build complete. Watching for changes.'),
		onError: (error) => console.error(error)
	});
	let stop!: () => void;
	const stopped = new Promise<void>((resolve) => {
		stop = resolve;
	});
	process.once('SIGINT', stop);
	process.once('SIGTERM', stop);
	try {
		await stopped;
	} finally {
		process.removeListener('SIGINT', stop);
		process.removeListener('SIGTERM', stop);
		await watcher.close();
	}
}
