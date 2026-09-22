import { checkRepositoryArtifacts } from './repository-artifacts.mjs';

const arguments_ = process.argv.slice(2);
if (arguments_.length > 1 || arguments_.some((value) => !value.startsWith('--base=')))
	throw new Error('Usage: node scripts/check-repository-artifacts.mjs [--base=<commit>]');
const base = arguments_[0]?.slice('--base='.length);
const violations = checkRepositoryArtifacts(process.cwd(), { base });
if (violations.length) {
	for (const { snapshot, filename, reason } of violations)
		console.error(`${snapshot}: ${JSON.stringify(filename)}: ${reason}`);
	process.exitCode = 1;
} else
	console.log('Repository artifact policy passed for staged files and the requested commit range.');
