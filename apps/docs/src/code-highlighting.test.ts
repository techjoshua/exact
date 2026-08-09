import { describe, expect, it } from 'vitest';
import { tokenize } from './code-highlighting.js';

describe('TSX code highlighting', () => {
	it('colors opening, closing, and self-closing tag delimiters as tags', () => {
		const tokens = tokenize('<Panel><Icon /></Panel>', 'tsx').flatMap((line) => line.tokens);

		expect(tokens.filter(({ kind }) => kind === 'tag').map(({ text }) => text)).toEqual([
			'<Panel',
			'>',
			'<Icon',
			'/>',
			'</Panel',
			'>'
		]);
	});

	it('keeps comparison operators classified as operators', () => {
		const tokens = tokenize('const inside = minimum < value && value > maximum;', 'tsx').flatMap(
			(line) => line.tokens
		);

		expect(
			tokens.filter(({ text }) => text === '<' || text === '>').map(({ kind }) => kind)
		).toEqual(['operator', 'operator']);
	});

	it('tracks multiline self-closing tags without coloring expressions as delimiters', () => {
		const tokens = tokenize('<Meter\n  visible={value > minimum}\n/>', 'tsx').flatMap(
			(line) => line.tokens
		);

		expect(tokens.filter(({ text }) => text === '>').map(({ kind }) => kind)).toEqual(['operator']);
		expect(tokens.find(({ text }) => text === '/>')?.kind).toBe('tag');
	});
});
