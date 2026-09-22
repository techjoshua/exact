import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

/** Removes fenced examples so illustrative links and headings are not treated as documentation. */
function prose(source) {
	return source.replace(/^([ \t]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\2[^\n]*(?:\n|$)/gm, '');
}

/** Computes GitHub-style heading identities, including duplicate headings and explicit HTML anchors. */
export function markdownAnchors(source) {
	const anchors = new Set();
	const counts = new Map();
	const text = prose(source);
	for (const match of text.matchAll(/^(?:#{1,6})\s+(.+?)\s*#*\s*$|^([^\n]+)\n(?:=+|-+)\s*$/gm)) {
		const heading = (match[1] ?? match[2])
			.replace(/<[^>]*>/g, '')
			.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
		const slug = heading
			.toLowerCase()
			.replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, '')
			.replace(/\s/g, '-');
		const count = counts.get(slug) ?? 0;
		counts.set(slug, count + 1);
		anchors.add(count ? `${slug}-${count}` : slug);
	}
	for (const match of text.matchAll(/\b(?:id|name)=["']([^"']+)["']/g)) anchors.add(match[1]);
	return anchors;
}

/** Extracts inline and reference-style Markdown link targets outside code examples. */
export function markdownLinks(source) {
	const text = prose(source).replace(/`[^`\n]+`/g, '');
	const definitions = new Map();
	const links = [];
	const definition = /^\s{0,3}\[([^\]]+)\]:\s*(<[^>]+>|\S+)/gm;
	for (const match of text.matchAll(definition))
		definitions.set(match[1].toLowerCase(), match[2].replace(/^<|>$/g, ''));
	for (const match of text.matchAll(
		/!?\[[^\]\n]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+["'][^\n]*?["'])?\s*\)/g
	))
		links.push(match[1].replace(/^<|>$/g, ''));
	for (const match of text.matchAll(/!?\[([^\]\n]+)\]\[([^\]\n]*)\]/g)) {
		const key = (match[2] || match[1]).toLowerCase();
		if (!definitions.has(key)) throw new Error(`Undefined Markdown reference [${key}]`);
		links.push(definitions.get(key));
	}
	for (const match of text.matchAll(/(?<!!)\[([^\]\n]+)\](?![(:\[])/g)) {
		const target = definitions.get(match[1].toLowerCase());
		if (target) links.push(target);
	}
	return [...new Set(links)];
}

/** Rejects generated per-run metric documents independently of their filename or blob size. */
export function generatedReportViolation(source) {
	const text = prose(source);
	const metricTable = /^\|[^\n]*(?:\bRPS\b|\bp(?:50|95|99)\b|throughput|latency)[^\n]*\|/im.test(
		text
	);
	const generated =
		/(?:auto[- ]?generated|generated (?:benchmark|performance|metric|report)|benchmark (?:capture|run) (?:id|timestamp)|measurement[_ -]round)/i.test(
			text
		);
	const rawSamples = /"(?:samplesMs|latencySamples|rawSamples|sampleDurations)"\s*:\s*\[/i.test(
		source
	);
	return rawSamples || (metricTable && generated)
		? 'Generated benchmark tables and raw samples belong in ignored captures; update maintained results instead'
		: undefined;
}

function git(root, args) {
	return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
}

/** Validates local references and immutable findings using source files only, before package builds. */
export async function checkDocumentation(root, { base = 'HEAD', files } = {}) {
	const names =
		files ??
		git(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
			.split('\0')
			.filter(Boolean);
	const deleted = new Set(git(root, ['ls-files', '--deleted', '-z']).split('\0'));
	const violations = [];
	const cache = new Map();
	const read = async (name) => {
		if (!cache.has(name)) cache.set(name, await readFile(path.join(root, name), 'utf8'));
		return cache.get(name);
	};
	for (const name of names.filter((n) => n.endsWith('.md') && !deleted.has(n))) {
		const source = await read(name);
		const generated = generatedReportViolation(source);
		if (generated) violations.push(`${name}: ${generated}`);
		let links;
		try {
			links = markdownLinks(source);
		} catch (error) {
			violations.push(`${name}: ${error.message}`);
			continue;
		}
		for (const link of links) {
			if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(link)) continue;
			const [address, fragment] = link.split('#');
			let decoded;
			try {
				decoded = decodeURIComponent(address.split('?')[0]);
			} catch {
				violations.push(`${name}: invalid link ${link}`);
				continue;
			}
			const target = decoded
				? path.posix.normalize(
						path.posix.join(
							decoded.startsWith('/') ? '' : path.posix.dirname(name),
							decoded.replace(/^\//, '')
						)
					)
				: name;
			if (target.startsWith('../')) {
				violations.push(`${name}: link leaves repository: ${link}`);
				continue;
			}
			try {
				await stat(path.join(root, target));
				if (
					fragment &&
					target.endsWith('.md') &&
					!markdownAnchors(await read(target)).has(decodeURIComponent(fragment))
				)
					violations.push(`${name}: missing anchor ${link}`);
			} catch {
				violations.push(`${name}: missing local target ${link}`);
			}
		}
	}
	// Existing findings are immutable, including deletions. New corrections link back without editing originals.
	const previous = git(root, ['ls-tree', '-r', '--name-only', base, '--', 'docs/findings'])
		.trim()
		.split('\n')
		.filter(Boolean);
	for (const name of previous) {
		const before = git(root, ['show', `${base}:${name}`]);
		const after = await read(name).catch(() => undefined);
		if (before !== after)
			violations.push(`${name}: immutable finding changed; add a linked correction`);
	}
	if (violations.length)
		throw new Error(`Documentation policy violations:\n${violations.join('\n')}`);
}
