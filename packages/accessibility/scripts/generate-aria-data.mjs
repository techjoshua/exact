import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputFile = path.join(packageRoot, 'src', 'generated', 'aria-data.ts');
const check = process.argv.includes('--check');

const roles = [
	'alert',
	'alertdialog',
	'application',
	'article',
	'banner',
	'blockquote',
	'button',
	'caption',
	'cell',
	'checkbox',
	'code',
	'columnheader',
	'combobox',
	'complementary',
	'contentinfo',
	'definition',
	'deletion',
	'dialog',
	'directory',
	'document',
	'emphasis',
	'feed',
	'figure',
	'form',
	'generic',
	'grid',
	'gridcell',
	'group',
	'heading',
	'img',
	'insertion',
	'link',
	'list',
	'listbox',
	'listitem',
	'log',
	'main',
	'marquee',
	'math',
	'menu',
	'menubar',
	'menuitem',
	'menuitemcheckbox',
	'menuitemradio',
	'meter',
	'navigation',
	'none',
	'note',
	'option',
	'paragraph',
	'presentation',
	'progressbar',
	'radio',
	'radiogroup',
	'region',
	'row',
	'rowgroup',
	'rowheader',
	'scrollbar',
	'search',
	'searchbox',
	'separator',
	'slider',
	'spinbutton',
	'status',
	'strong',
	'subscript',
	'superscript',
	'switch',
	'tab',
	'table',
	'tablist',
	'tabpanel',
	'term',
	'textbox',
	'time',
	'timer',
	'toolbar',
	'tooltip',
	'tree',
	'treegrid',
	'treeitem'
];

const properties = {
	activedescendant: 'id',
	atomic: ['true', 'false'],
	autocomplete: ['none', 'inline', 'list', 'both'],
	braillelabel: 'string',
	brailleroledescription: 'string',
	busy: ['true', 'false'],
	checked: ['true', 'false', 'mixed', 'undefined'],
	colcount: 'integer',
	colindex: 'integer',
	colspan: 'integer',
	controls: 'ids',
	current: ['page', 'step', 'location', 'date', 'time', 'true', 'false'],
	describedby: 'ids',
	description: 'string',
	details: 'id',
	disabled: ['true', 'false'],
	dropeffect: ['copy', 'execute', 'link', 'move', 'none', 'popup'],
	errormessage: 'id',
	expanded: ['true', 'false', 'undefined'],
	flowto: 'ids',
	grabbed: ['true', 'false', 'undefined'],
	haspopup: ['false', 'true', 'menu', 'listbox', 'tree', 'grid', 'dialog'],
	hidden: ['true', 'false', 'undefined'],
	invalid: ['false', 'true', 'grammar', 'spelling'],
	keyshortcuts: 'string',
	label: 'string',
	labelledby: 'ids',
	level: 'integer',
	live: ['off', 'polite', 'assertive'],
	modal: ['true', 'false'],
	multiline: ['true', 'false'],
	multiselectable: ['true', 'false'],
	orientation: ['horizontal', 'vertical', 'undefined'],
	owns: 'ids',
	placeholder: 'string',
	posinset: 'integer',
	pressed: ['true', 'false', 'mixed', 'undefined'],
	readonly: ['true', 'false'],
	relevant: ['additions', 'removals', 'text', 'all'],
	required: ['true', 'false'],
	roledescription: 'string',
	rowcount: 'integer',
	rowindex: 'integer',
	rowspan: 'integer',
	selected: ['true', 'false', 'undefined'],
	setsize: 'integer',
	sort: ['none', 'ascending', 'descending', 'other'],
	valuemax: 'number',
	valuemin: 'number',
	valuenow: 'number',
	valuetext: 'string'
};

const source = `/**
 * Generated from the WAI-ARIA 1.2 role and state/property indexes.
 * Source: https://www.w3.org/TR/wai-aria-1.2/
 * Regenerate with npm run generate:aria -w @exactjs/accessibility.
 */
export const ariaDataRevision = 'WAI-ARIA 1.2';
export const ariaDataSource = 'https://www.w3.org/TR/wai-aria-1.2/';
export const ariaRoles = Object.freeze(${JSON.stringify(roles)} as const);
export const ariaProperties = Object.freeze(${JSON.stringify(properties, null, '\t')} as const);
`;
const generated = await format(source, {
	...(await resolveConfig(outputFile)),
	parser: 'typescript'
});

if (check) {
	const existing = await readFile(outputFile, 'utf8').catch(() => '');
	if (existing !== generated) {
		console.error(
			'Generated ARIA data is stale. Run npm run generate:aria -w @exactjs/accessibility.'
		);
		process.exitCode = 1;
	}
} else {
	await mkdir(path.dirname(outputFile), { recursive: true });
	await writeFile(outputFile, generated);
}
