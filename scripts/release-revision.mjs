import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Resolves a release baseline through the repository's recorded history rewrite, then verifies
 * that the commit exists. Unknown or unavailable revisions fail rather than falling back to HEAD.
 * Recorded replacements take precedence even when an old object survives in a local clone.
 */
export function resolveReleaseRevision(root, requested) {
	let revision = requested;
	if (/^[a-f0-9]{40}$/i.test(requested)) {
		let mapping;
		try {
			mapping = readFileSync(path.join(root, 'docs/history-revisions.txt'), 'utf8');
		} catch (error) {
			if (error.code !== 'ENOENT') throw error;
		}
		for (const line of mapping?.split('\n') ?? []) {
			const [original, replacement] = line.trim().split(/\s+/);
			if (original?.toLowerCase() !== requested.toLowerCase()) continue;
			if (!/^[a-f0-9]{40}$/i.test(replacement))
				throw new Error(`Invalid replacement for release revision ${requested}`);
			revision = replacement;
			break;
		}
	}
	return execFileSync(
		'git',
		['rev-parse', '--verify', '--end-of-options', `${revision}^{commit}`],
		{
			cwd: root,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe']
		}
	).trim();
}
