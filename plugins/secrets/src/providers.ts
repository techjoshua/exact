import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { SecretProvider } from './config.js';
import { secret } from './values.js';

/** Configures environment secrets. */
export interface EnvironmentSecretsOptions {
	/** Files overlaid in order after process values. Defaults to .env. */
	readonly files?: readonly string[];
	/** Includes process environment values unless false. File values take precedence. */
	readonly includeProcessEnvironment?: boolean;
	/** Ignores missing files unless false. Other read failures still reject. */
	readonly optionalFiles?: boolean;
}

/**
 * Creates an environment provider that overlays .env files on process values by default.
 * Each load captures its abort signal and returns an ordinary independent name dictionary.
 * Missing files are optional by default. Later files override earlier values.
 */
export function environmentSecrets(options: EnvironmentSecretsOptions = {}): SecretProvider {
	return {
		name: 'environment',
		async load(context: import('./config.js').SecretProviderContext) {
			const signal = context.signal;
			signal.throwIfAborted();
			const values: Record<string, import('./index.js').Secret<string>> = Object.create(null);
			if (options.includeProcessEnvironment !== false) {
				for (const [name, value] of Object.entries(process.env)) {
					if (value !== undefined) values[name] = secret(name, value);
				}
			}
			for (const file of options.files ?? ['.env']) {
				signal.throwIfAborted();
				const filename = path.resolve(context.applicationRoot, file);
				let source: string;
				try {
					source = await readFile(filename, { encoding: 'utf8', signal });
				} catch (error) {
					signal.throwIfAborted();
					if (options.optionalFiles !== false && isMissingFile(error)) continue;
					throw new Error(`Unable to load secret environment file ${filename}`, { cause: error });
				}
				for (const [name, value] of parseEnvironmentFile(source))
					values[name] = secret(name, value);
			}
			return values;
		}
	};
}

/**
 * Parses single-line NAME=value declarations into an ordered map, with later duplicates winning.
 * Accepts export prefixes, matching outer quotes, and whitespace-prefixed comments on unquoted
 * values. Values remain literal. Malformed names or declarations throw.
 */
export function parseEnvironmentFile(source: string): Map<string, string> {
	const result = new Map<string, string>();
	for (const rawLine of source.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#')) continue;
		const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
		if (!match) throw new Error('Malformed environment secret declaration');
		let value = match[2]!;
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		} else {
			value = value.replace(/\s+#.*$/, '');
		}
		result.set(match[1]!, value);
	}
	return result;
}

function isMissingFile(error: unknown): boolean {
	return !!error && typeof error === 'object' && (error as { code?: unknown }).code === 'ENOENT';
}
