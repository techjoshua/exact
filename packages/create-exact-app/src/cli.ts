#!/usr/bin/env node
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import {
	bundlers,
	createExactApp,
	runtimes,
	testRunners,
	type Bundler,
	type Runtime,
	type TestRunner
} from './index.js';

if (process.argv.includes('--help') || process.argv.includes('-h')) {
	output.write(`create-exact-app [directory] [options]

Options:
  --name <name>                 npm package name
  --bundler <vite|webpack|bun>  build integration
  --runtime <platform>          ${runtimes.join(', ')}
  --test-runner <runner>        ${testRunners.join(', ')}
  --skill | --no-skill          include the repo-local eXact Agent Skill
  --install | --no-install      install dependencies after generation
  --yes                         accept recommended defaults
  --help                        show this help
`);
	process.exit(0);
}

type Arguments = {
	directory?: string;
	name?: string;
	bundler?: Bundler;
	runtime?: Runtime;
	testRunner?: TestRunner;
	skill?: boolean;
	install?: boolean;
};

const parsed = parseArguments(process.argv.slice(2));
const prompt = createInterface({ input, output });
try {
	const directory =
		parsed.directory ?? ((await prompt.question('Project directory: ')) || 'exact-app');
	const name = parsed.name ?? path.basename(path.resolve(directory)).toLowerCase();
	const bundler = parsed.bundler ?? (await choose(prompt, 'Build integration', bundlers, 'vite'));
	const runtime = parsed.runtime ?? (await choose(prompt, 'Runtime platform', runtimes, 'browser'));
	const testRunner =
		parsed.testRunner ?? (await choose(prompt, 'Test runner', testRunners, 'vitest'));
	const skill =
		parsed.skill ??
		(await confirm(prompt, 'Install the portable eXact Agent Skill in this project?', true));
	const install = parsed.install ?? (await confirm(prompt, 'Install npm dependencies now?', true));
	await createExactApp({
		directory,
		name,
		bundler,
		runtime,
		testRunner,
		skill,
		install
	});
	output.write(`\nCreated ${name} in ${path.resolve(directory)}\n`);
} finally {
	prompt.close();
}

function parseArguments(values: string[]): Arguments {
	const result: Arguments = {};
	for (let index = 0; index < values.length; index++) {
		const value = values[index]!;
		if (!value.startsWith('--') && !result.directory) result.directory = value;
		else if (value === '--name') result.name = values[++index];
		else if (value === '--bundler') result.bundler = option(values[++index], bundlers, 'bundler');
		else if (value === '--runtime') result.runtime = option(values[++index], runtimes, 'runtime');
		else if (value === '--test-runner')
			result.testRunner = option(values[++index], testRunners, 'test runner');
		else if (value === '--skill') result.skill = true;
		else if (value === '--no-skill') result.skill = false;
		else if (value === '--install') result.install = true;
		else if (value === '--no-install') result.install = false;
		else if (value === '--yes') {
			result.bundler ??= 'vite';
			result.runtime ??= 'browser';
			result.testRunner ??= 'vitest';
			result.skill ??= true;
			result.install ??= true;
		} else throw new Error(`Unknown option: ${value}`);
	}
	return result;
}

async function choose<T extends string>(
	prompt: ReturnType<typeof createInterface>,
	label: string,
	values: readonly T[],
	defaultValue: T
): Promise<T> {
	output.write(`\n${label}:\n`);
	values.forEach((value, index) => output.write(`  ${index + 1}. ${value}\n`));
	const answer = await prompt.question(`Choose [${values.indexOf(defaultValue) + 1}]: `);
	if (!answer.trim()) return defaultValue;
	const selected = values[Number(answer) - 1] ?? values.find((value) => value === answer);
	if (!selected) throw new Error(`Invalid ${label.toLowerCase()}: ${answer}`);
	return selected;
}

async function confirm(
	prompt: ReturnType<typeof createInterface>,
	label: string,
	defaultValue: boolean
): Promise<boolean> {
	const answer = await prompt.question(`${label} ${defaultValue ? '[Y/n]' : '[y/N]'} `);
	if (!answer.trim()) return defaultValue;
	return /^y(?:es)?$/i.test(answer);
}

function option<T extends string>(
	value: string | undefined,
	values: readonly T[],
	label: string
): T {
	if (value && values.includes(value as T)) return value as T;
	throw new Error(`Invalid ${label}: ${value ?? ''}. Expected one of ${values.join(', ')}`);
}
