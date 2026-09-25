import { buildLibrary, type LibraryBuildOptions } from './build.js';

/** Parses the library subcommand independently of application compilation flags. */
export async function runLibraryBuildCli(argv: string[]): Promise<void> {
	const options: LibraryBuildOptions = {};
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		if (arg === '--help' || arg === '-h') {
			console.log(
				'Usage: exactc build-library [--root directory] [--project tsconfig.json] [--skip-declarations]'
			);
			return;
		}
		if (arg === '--skip-declarations') options.declarations = false;
		else if (arg === '--root' || arg === '--project') {
			const value = argv[++index];
			if (!value || value.startsWith('-')) throw new Error(`${arg} requires a value`);
			options[arg === '--root' ? 'root' : 'project'] = value;
		} else throw new Error(`Unknown build-library argument: ${arg}`);
	}
	await buildLibrary(options);
}
