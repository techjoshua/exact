import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveTheme } from '../dist/resolver.js';
import { exactThemeContract } from '../dist/token-contract.js';
import { parseThemeColor, resolveColor } from '../dist/color.js';

const stylesheetUrl = new URL('../styles.css', import.meta.url);
const source = readFileSync(stylesheetUrl, 'utf8');
const begin = '/* BEGIN GENERATED FALLBACK */';
const end = '/* END GENERATED FALLBACK */';
const appearances = {
	light: resolve('light', 'standard'),
	dark: resolve('dark', 'standard'),
	more: resolve('light', 'more'),
	darkMore: resolve('dark', 'more')
};

const generated = [
	begin,
	rule(':root', appearances.light),
	media(
		'(prefers-color-scheme: dark)',
		rule(':root:not([data-exact-theme])', differences(appearances.dark, appearances.light))
	),
	media(
		'(prefers-contrast: more)',
		rule(':root:not([data-exact-theme])', differences(appearances.more, appearances.light))
	),
	media(
		'(prefers-color-scheme: dark) and (prefers-contrast: more)',
		rule(':root:not([data-exact-theme])', appearances.darkMore)
	),
	end
].join('\n');

const pattern = new RegExp(`${escape(begin)}[\\s\\S]*?${escape(end)}`);
if (!pattern.test(source))
	throw new Error(`Missing generated fallback markers in ${fileURLToPath(stylesheetUrl)}`);
writeFileSync(stylesheetUrl, source.replace(pattern, generated));

function resolve(appearance, contrast) {
	return resolveTheme({ environment: { appearance, contrast, motion: 'full' } });
}

function rule(selector, theme) {
	const declarations = [];
	for (const name of Object.keys(theme.tokens).sort()) {
		const descriptor = exactThemeContract.tokens[name];
		if (descriptor.kind === 'color') {
			const color = tokenColor(theme, name);
			declarations.push(`\t${descriptor.cssName}: rgb(${color.srgb.join(' ')});`);
		}
		declarations.push(`\t${descriptor.cssName}: ${theme.tokens[name]};`);
	}
	declarations.push('\tcolor: var(--exact-theme-surface-foreground);');
	declarations.push('\taccent-color: var(--exact-theme-accent-solid);');
	declarations.push('\tfont-family: var(--exact-theme-font-body);');
	declarations.push('\tfont-size: var(--exact-theme-font-size-md);');
	declarations.push('\tline-height: var(--exact-theme-line-height-body);');
	return `${selector} {\n${declarations.join('\n')}\n}`;
}

function differences(theme, baseline) {
	return {
		...theme,
		tokens: Object.fromEntries(
			Object.entries(theme.tokens).filter(([name, value]) => baseline.tokens[name] !== value)
		)
	};
}

function tokenColor(theme, name) {
	return resolveColor(parseThemeColor(theme.tokens[name], `tokens.${name}`));
}

function media(query, body) {
	return `@media ${query} {\n${body
		.split('\n')
		.map((line) => `\t${line}`)
		.join('\n')}\n}`;
}
function escape(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
