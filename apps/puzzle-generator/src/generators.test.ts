import { describe, expect, it } from 'vitest';
import { prebuiltAppConfig } from '@mlc-ai/web-llm';
import {
	aiWordListPrompt,
	aiWordListSchema,
	defaultAiPromptTemplate,
	formatAiWordListResponse
} from './ai-word-list-format.js';
import { defaultLocalAiModel, localAiModels } from './ai-models.js';
import { crosswordEnclosedCells } from './crossword-background.js';
import { generateCrossword } from './crossword.js';
import { createPuzzleDocuments, exportBaseName } from './documents.js';
import { renderCrosswordSvg, renderSudokuSvg, renderWordSearchSvg } from './svg.js';
import { generateSudoku, countSudokuSolutions } from './sudoku.js';
import type { CrosswordPuzzle, PuzzleStyle } from './types.js';
import { generateWordSearch, gridContainsBlockedSequence } from './word-search.js';
import { parseCrosswordClues, parseWords, validateWords } from './words.js';

const style: PuzzleStyle = {
	title: 'Test & Proof',
	titleAlignment: 'left',
	titleFontFamily: 'serif',
	titleFontSize: 30,
	fontFamily: 'sans',
	fontSize: 20,
	supplementaryFontFamily: 'mono',
	supplementaryFontSize: 15,
	pageSize: 'letter',
	customPageWidth: 8.5,
	customPageHeight: 11,
	pageMarginPreset: 'standard',
	pageMargin: 0.5,
	ink: '#111111',
	accent: '#cc3300',
	paper: '#ffffff',
	lineWidth: 1.5,
	monochromeSolution: false,
	crosswordGrid: '#111111',
	crosswordBlocks: '#111111',
	sudokuSolutionFont: 'inherit',
	sudokuSolutionBold: false
};

describe('Sudoku generation', () => {
	for (const boxSize of [2, 3] as const) {
		it(`creates a deterministic unique ${boxSize * boxSize}×${boxSize * boxSize} puzzle`, () => {
			const first = generateSudoku(boxSize, 'hard', 42);
			const second = generateSudoku(boxSize, 'hard', 42);
			expect(first).toEqual(second);
			expect(countSudokuSolutions(first.givens, boxSize)).toBe(1);
			expect(first.solution).toHaveLength((boxSize * boxSize) ** 2);
		});
	}

	it('removes more clues as difficulty increases', () => {
		const easy = generateSudoku(3, 'easy', 84).givens.filter(Boolean).length;
		const hard = generateSudoku(3, 'hard', 84).givens.filter(Boolean).length;
		expect(hard).toBeLessThan(easy);
	});
});

describe('word-search generation', () => {
	const words = ['ORBIT', 'COMET', 'PLANET', 'GALAXY', 'NEBULA'];

	it('places every word and avoids blocked output', () => {
		const puzzle = generateWordSearch(words, 12, 14, 'hard', 1234);
		expect(puzzle.placements.map((placement) => placement.word).sort()).toEqual([...words].sort());
		expect(gridContainsBlockedSequence(puzzle.grid, puzzle.rows, puzzle.columns)).toBe(false);
	});

	it('reports a word that cannot fit the selected dimensions', () => {
		expect(() => generateWordSearch(['EXTRALONGWORD', 'TINY'], 6, 6, 'easy', 1)).toThrow(
			/longest word/i
		);
	});
});

describe('crossword generation', () => {
	it('maximizes connected overlap for a compatible word set', () => {
		const words = ['ORBIT', 'COMET', 'METEOR', 'TELESCOPE', 'PLANET', 'LUNAR'];
		const puzzle = generateCrossword(words, 7788);
		expect(puzzle.words.length).toBeGreaterThanOrEqual(5);
		expect(puzzle.rows * puzzle.columns).toBeLessThan(180);
		expect(puzzle.cells.filter(Boolean).length).toBeLessThan(
			puzzle.words.reduce((total, word) => total + word.length, 0)
		);
	});
});

describe('document and input contracts', () => {
	it('offers distinct local chat models below the advertised download ceiling', () => {
		const registeredModelIds = new Set(
			prebuiltAppConfig.model_list.map((model: { model_id: string }) => model.model_id)
		);
		expect(localAiModels).toHaveLength(10);
		expect(new Set(localAiModels.map((model) => model.id)).size).toBe(localAiModels.length);
		expect(localAiModels.every((model) => model.downloadMb < 1536)).toBe(true);
		expect(localAiModels.every((model) => registeredModelIds.has(model.id))).toBe(true);
		expect(JSON.stringify(localAiModels)).not.toContain('gemma3-1b');
		expect(defaultLocalAiModel).toBe('Llama-3.2-1B-Instruct-q4f16_1-MLC');
	});

	it('validates and formats structured local-AI puzzle material', () => {
		const wordSearch = formatAiWordListResponse(
			JSON.stringify({
				words: ['coral reef', 'OCTOPUS', 'whale', 'SHARK', 'KELP', 'TURTLE', 'DOLPHIN']
			}),
			'word-search'
		);
		expect(wordSearch).toBe('CORALREEF\nOCTOPUS\nWHALE\nSHARK\nKELP\nTURTLE\nDOLPHIN');

		const crossword = formatAiWordListResponse(
			JSON.stringify({
				entries: [
					{ word: 'orbit', clue: 'Path around a planet' },
					{ word: 'comet', clue: 'Icy visitor' },
					{ word: 'lunar', clue: 'Related to the moon' },
					{ word: 'star', clue: 'Distant point of light' },
					{ word: 'eclipse', clue: 'Celestial shadow event' },
					{ word: 'galaxy', clue: 'Vast collection of stars' }
				]
			}),
			'crossword'
		);
		expect(crossword).toContain('ORBIT - Path around a planet');
		const crosswordTemplate = defaultAiPromptTemplate('crossword');
		expect(crosswordTemplate).toContain('{{topic}}');
		expect(crosswordTemplate).toContain('conventional American-style crossword');
		expect(crosswordTemplate).toContain('array of 20 objects');
		expect(crosswordTemplate).toContain('published crossword');
		expect(crosswordTemplate).toContain('Never put the answer');
		expect(crosswordTemplate).toContain('exactly one top-level property named "entries"');
		expect(crosswordTemplate).toContain('no introduction, explanation, markdown, or code fence');
		expect(crosswordTemplate).toContain('quoted key "entries"');
		expect(crosswordTemplate).not.toContain('ANSWER1');
		expect(defaultAiPromptTemplate('word-search')).toContain(
			'exactly one top-level property named "words"'
		);
		expect(defaultAiPromptTemplate('word-search')).toContain('quoted key "words"');
		expect(defaultAiPromptTemplate('word-search')).toContain('array of 20 strings');
		expect(defaultAiPromptTemplate('word-search')).not.toContain('WORD1');
		expect(aiWordListPrompt('space', 'crossword')).toContain('related to "space"');
		expect(aiWordListPrompt('space', 'crossword')).not.toContain('{{topic}}');
		expect(aiWordListPrompt('space', 'crossword', 'Write short clues.')).toBe(
			'Write short clues.\nTopic: "space"'
		);
		const parsedSchema = JSON.parse(aiWordListSchema('crossword'));
		expect(parsedSchema.required).toEqual(['entries']);
		expect(parsedSchema.properties.entries.minItems).toBeUndefined();
		expect(parsedSchema.properties.entries.maxItems).toBeUndefined();
	});

	it('rejects malformed or unsafe local-AI responses', () => {
		expect(() => formatAiWordListResponse('not json', 'word-search')).toThrow(/malformed/i);
		expect(() =>
			formatAiWordListResponse(
				JSON.stringify({ words: ['ORBIT', 'COMET', 'PLANET', 'GALAXY', 'SHIT', 'NEBULA'] }),
				'word-search'
			)
		).toThrow(/rejected/i);
		expect(() =>
			formatAiWordListResponse(
				JSON.stringify({
					entries: [
						{ word: 'BREAK', clue: 'Break the habit, or so?' },
						{ word: 'PROGRAM', clue: 'Programme your code with instructions' },
						{ word: 'INPUT', clue: 'Information supplied to software' },
						{ word: 'SYNTAX', clue: 'Grammar of a programming language' },
						{ word: 'CODE', clue: 'Instructions written for a computer' },
						{ word: 'REPEAT', clue: 'Do another time' }
					]
				}),
				'crossword'
			)
		).toThrow(/repeated answers.*BREAK.*PROGRAM/i);
		expect(() =>
			formatAiWordListResponse(
				JSON.stringify({
					words: ['WORD', 'ORBIT', 'COMET', 'PLANET', 'GALAXY', 'NEBULA']
				}),
				'word-search'
			)
		).toThrow(/placeholder/i);
	});

	it('normalizes words, rejects blocked input, and emits separate SVG documents', () => {
		expect(parseWords('orbit, ORBIT\ncomet')).toEqual(['ORBIT', 'COMET']);
		expect(validateWords(['NICE', 'SHIT'], 2)).toMatch(/blocked/i);
		const documents = createPuzzleDocuments({
			kind: 'sudoku',
			difficulty: 'medium',
			seed: 5,
			boxSize: 2,
			rows: 10,
			columns: 10,
			wordText: '',
			style
		});
		expect(documents.puzzleSvg).toContain('<svg');
		expect(documents.puzzleSvg).toContain('width="816" height="1056"');
		expect(documents.puzzleSvg).toContain('data-page-margin="0.5"');
		expect(documents.puzzleSvg).toContain('Test &amp; Proof');
		expect(documents.puzzleSvg).toContain('font-size="30"');
		expect(documents.solutionSvg).not.toBe(documents.puzzleSvg);
		expect(exportBaseName('My Puzzle!', 'sudoku')).toBe('my-puzzle');
	});

	it('parses human-readable crossword clues and prints a complete clue table', () => {
		const clues = parseCrosswordClues('orbit - Path around a planet\nCOMET — Icy visitor\nmoon');
		expect(clues).toEqual([
			{ word: 'ORBIT', clue: 'Path around a planet' },
			{ word: 'COMET', clue: 'Icy visitor' },
			{ word: 'MOON', clue: 'No clue provided' }
		]);
		const crossword = generateCrossword(
			clues.map((entry) => entry.word),
			21,
			clues
		);
		const svg = renderCrosswordSvg(crossword, style, false);
		expect(svg).toContain('>Across</text>');
		expect(svg).toContain('>Down</text>');
		for (const entry of crossword.entries) expect(svg).toContain(entry.clue);
		expect(svg).toContain('font-family="&apos;Courier New&apos;');
		expect(svg).toContain('font-size="15"');
	});

	it.each(
		['-', '–', '\u2014'].flatMap((dash) =>
			['', ' ', 'left', 'right'].map((spacing) => ({ dash, spacing }))
		)
	)('accepts pasted crossword separators ($dash, $spacing)', ({ dash, spacing }) => {
		const before = spacing === ' ' || spacing === 'left' ? ' ' : '';
		const after = spacing === ' ' || spacing === 'right' ? ' ' : '';
		const clue = 'Path around a planet, described in enough detail to exceed the answer limit';
		const wordText = `ORBIT${before}${dash}${after}${clue}\nCOMET - Icy visitor\nMOON - Natural satellite`;
		expect(parseCrosswordClues(wordText)[0]).toEqual({ word: 'ORBIT', clue });
		const request = {
			kind: 'crossword' as const,
			difficulty: 'medium' as const,
			seed: 21,
			boxSize: 3 as const,
			rows: 14,
			columns: 14,
			style
		};
		expect(createPuzzleDocuments({ ...request, wordText })).toEqual(
			createPuzzleDocuments({
				...request,
				wordText: wordText.replace(`${before}${dash}${after}`, ' - ')
			})
		);
	});

	it.each(['-', '–', '\u2014'])(
		'keeps later spaced dashes in a clue after an unspaced %s separator',
		(dash) => {
			expect(parseCrosswordClues(`ORBIT${dash}Path around a planet — with details`)).toEqual([
				{ word: 'ORBIT', clue: 'Path around a planet — with details' }
			]);
		}
	);

	it('preserves hyphenated answers when an explicit spaced separator is present', () => {
		expect(parseCrosswordClues('X-RAY - Imaging technique with a dash-bearing clue')).toEqual([
			{ word: 'XRAY', clue: 'Imaging technique with a dash-bearing clue' }
		]);
	});

	it.each([
		{ line: '  ORBIT: Path around a planet, through outer space!  ', reason: /24-letter limit/ },
		{ line: 'A - A single letter.', reason: /at least two letters/ },
		{ line: 'S.H.I.T - Punctuation remains visible!', reason: /blocked sequence/ }
	])('identifies the original crossword line in validation errors: $line', ({ line, reason }) => {
		const request = {
			kind: 'crossword' as const,
			difficulty: 'medium' as const,
			seed: 21,
			boxSize: 3 as const,
			rows: 14,
			columns: 14,
			style,
			wordText: `ORBIT - Path around a planet\r\n\r\n${line}\r\nCOMET - Icy visitor`
		};
		expect(() => createPuzzleDocuments(request)).toThrow(reason);
		expect(() => createPuzzleDocuments(request)).toThrow(`Line 3:`);
		expect(() => createPuzzleDocuments(request)).toThrow(`Original line: ${line}`);
	});

	it.each([false, true])(
		'adds optional inline answer spaces to numbered clues (solution=%s)',
		(solution) => {
			const clues = parseCrosswordClues(
				'ORBIT - Path around a planet\nCOMET - Icy visitor with a tail\nMOON - Natural satellite'
			);
			const puzzle = generateCrossword(
				clues.map((entry) => entry.word),
				21,
				clues
			);
			const plain = renderCrosswordSvg(puzzle, style, solution);
			expect(plain).not.toMatch(/_+:/);
			const withSpaces = renderCrosswordSvg(
				puzzle,
				{ ...style, crosswordClueAnswerSpaces: true },
				solution
			);
			const lines = [...withSpaces.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(
				(match) => match[1]!
			);
			for (const entry of puzzle.entries) {
				const firstWord = entry.clue.split(' ')[0];
				expect(
					lines.some((line) =>
						line.startsWith(`${entry.number}. ${'_'.repeat(entry.word.length)}: ${firstWord}`)
					)
				).toBe(true);
			}
			expect(lines.filter((line) => /_+:/.test(line))).toHaveLength(puzzle.entries.length);
			expect(lines.join(' ')).toContain('Icy visitor with a tail');
		}
	);

	it('fits answer blanks and wraps clues within compact columns at large mono sizes', () => {
		const puzzle: CrosswordPuzzle = {
			rows: 24,
			columns: 5,
			cells: Array(120).fill(undefined),
			words: ['COMET', 'CDEFGHIJKLMNOPQRSTUVWXYZ'],
			entries: [
				{ word: 'COMET', clue: 'Icy visitor with a tail', number: 1, orientation: 'across' },
				{
					word: 'CDEFGHIJKLMNOPQRSTUVWXYZ',
					clue: 'Supercalifragilisticexpialidocious visitor',
					number: 2,
					orientation: 'down'
				}
			],
			unplaced: []
		};
		const svg = renderCrosswordSvg(
			puzzle,
			{ ...style, supplementaryFontSize: 48, crosswordClueAnswerSpaces: true },
			false
		);
		const lines = [...svg.matchAll(/<text([^>]*)>([^<]*)<\/text>/g)];
		expect(lines.some((line) => line[2] === '1. _____:')).toBe(true);
		expect(lines.some((line) => line[2] === 'Icy')).toBe(true);
		expect(lines.some((line) => line[2] === `2. ${'_'.repeat(24)}:`)).toBe(true);
		for (const line of lines.filter((line) => /_+:|Supercalifragilistic/.test(line[2]!))) {
			const width = Number(line[1]!.match(/textLength="([^"]+)"/)?.[1]);
			expect(width).toBeGreaterThan(0);
			expect(width).toBeLessThanOrEqual(264);
			expect(line[1]).toContain('lengthAdjust="spacingAndGlyphs"');
		}
	});

	it('renders custom page dimensions and margins and rejects unusable print regions', () => {
		const puzzle = generateSudoku(2, 'easy', 7);
		const customStyle: PuzzleStyle = {
			...style,
			pageSize: 'custom',
			customPageWidth: 12.25,
			customPageHeight: 9.5,
			pageMarginPreset: 'custom',
			pageMargin: 0.375
		};
		const svg = renderSudokuSvg(puzzle, customStyle, false);
		expect(svg).toContain('width="1176" height="912"');
		expect(svg).toContain('data-page-size="custom"');
		expect(svg).toContain('data-page-margin="0.375"');
		expect(() =>
			createPuzzleDocuments({
				kind: 'sudoku',
				difficulty: 'easy',
				seed: 7,
				boxSize: 2,
				rows: 8,
				columns: 8,
				wordText: '',
				style: { ...customStyle, pageMargin: 5 }
			})
		).toThrow(/printable space/i);
	});

	it('renders the three inch-based page presets at print-standard dimensions', () => {
		const puzzle = generateSudoku(2, 'easy', 7);
		const presets = [
			['letter', 816, 1056],
			['seven-by-ten', 672, 960],
			['six-by-nine', 576, 864]
		] as const;

		for (const [pageSize, width, height] of presets) {
			const svg = renderSudokuSvg(puzzle, { ...style, pageSize }, false);
			expect(svg).toContain(`width="${width}" height="${height}"`);
			expect(svg).toContain(`data-page-size="${pageSize}"`);
		}
	});

	it('omits an empty title and aligns a supplied title', () => {
		const puzzle = generateSudoku(2, 'easy', 7);
		const untitled = renderSudokuSvg(puzzle, { ...style, title: '' }, false);
		const centered = renderSudokuSvg(
			puzzle,
			{ ...style, title: 'Centered', titleAlignment: 'center' },
			false
		);
		expect(untitled).not.toContain('>Sudoku</text>');
		expect(centered).toContain('text-anchor="middle"');
		expect(centered).toContain('>Centered</text>');
	});

	it('renders puzzle-specific print and solution options', () => {
		const wordSearch = generateWordSearch(['ORBIT', 'COMET'], 8, 8, 'easy', 19);
		const wordPuzzleSvg = renderWordSearchSvg(wordSearch, style, false);
		const colorWordSolutionSvg = renderWordSearchSvg(wordSearch, style, true);
		const wordSolutionSvg = renderWordSearchSvg(
			wordSearch,
			{ ...style, monochromeSolution: true },
			true
		);
		expect(wordPuzzleSvg).toContain('<rect x="34"');
		expect(wordSolutionSvg).not.toContain('<ellipse');
		expect(wordSolutionSvg).toContain('fill="none" stroke="#000000"');
		const colorPaths = [
			...colorWordSolutionSvg.matchAll(/data-solution-word="([^"]+)" d="([^"]+)"/g)
		];
		const monochromePaths = [
			...wordSolutionSvg.matchAll(/data-solution-word="([^"]+)" d="([^"]+)"/g)
		];
		expect(monochromePaths.map((match) => match[1])).toEqual(colorPaths.map((match) => match[1]));
		expect(monochromePaths.map((match) => match[2])).toEqual(colorPaths.map((match) => match[2]));
		expect(monochromePaths).toHaveLength(wordSearch.placements.length);

		const crossword = generateCrossword(['ORBIT', 'COMET', 'METEOR'], 21);
		const crosswordSvg = renderCrosswordSvg(
			crossword,
			{
				...style,
				crosswordGrid: '#123456',
				crosswordBlocks: '#ffffff',
				monochromeSolution: true
			},
			true
		);
		expect(crosswordSvg).toContain('stroke="#123456"');
		expect(crosswordSvg.match(/stroke="#123456"/g)).toHaveLength(1);
		expect(crosswordSvg).not.toMatch(/<rect[^>]+stroke=/);
		expect(crosswordSvg).toContain('<rect width="100%" height="100%" fill="#ffffff"');
		expect(crosswordSvg).not.toContain('>ORBIT</text>');
		expect(crosswordSvg).toContain('fill="#000000"');

		const sudokuSvg = renderSudokuSvg(
			generateSudoku(2, 'medium', 22),
			{ ...style, sudokuSolutionFont: 'handwritten', sudokuSolutionBold: true },
			true
		);
		expect(sudokuSvg).toContain('font-family="&apos;Segoe Print&apos;');
		expect(sudokuSvg).toContain('font-weight="800"');
	});
});

describe('crossword unused-cell presentation', () => {
	const layout = (rows: string[]): CrosswordPuzzle => ({
		rows: rows.length,
		columns: rows[0]!.length,
		cells: rows
			.join('')
			.split('')
			.map((letter) => (letter === '.' ? undefined : { letter })),
		words: [],
		entries: [],
		unplaced: []
	});

	it.each([
		{ rows: ['.AA', 'A.A', 'AAA'], expected: [4] },
		{ rows: ['AAA', 'A.A', 'AA.'], expected: [4] },
		{ rows: ['AAAA', 'A..A', 'AAAA'], expected: [] },
		{ rows: ['AAAA', 'A..A', 'A..A', 'AAAA'], expected: [] },
		{ rows: ['A.A', 'A.A', 'AAA'], expected: [] },
		{ rows: ['...'], expected: [] },
		{ rows: ['A', '.', 'A'], expected: [] },
		{ rows: ['AAA'], expected: [] }
	])('marks only individual empty cells surrounded by letters: $rows', ({ rows, expected }) => {
		const marked = [...crosswordEnclosedCells(layout(rows))].flatMap((value, index) =>
			value ? [index] : []
		);
		expect(marked).toEqual(expected);
	});

	it.each([false, true])(
		'colors puzzle and solution holes separately (solution=%s)',
		(solution) => {
			const puzzle = layout(['.AA', 'A.A', 'AAA']);
			const colors = { ...style, paper: '#eeeeee', crosswordBlocks: '#ffffff' };
			const fills = (svg: string) =>
				[...svg.matchAll(/<rect x="[^>]+fill="([^"]+)"/g)].map((match) => match[1]);
			expect(
				fills(renderCrosswordSvg(layout(['AAAA', 'A..A', 'AAAA']), colors, solution)).slice(5, 7)
			).toEqual(['#ffffff', '#ffffff']);
			expect(fills(renderCrosswordSvg(puzzle, colors, solution))).toEqual([
				'#ffffff',
				'#eeeeee',
				'#eeeeee',
				'#eeeeee',
				'#000000',
				'#eeeeee',
				'#eeeeee',
				'#eeeeee',
				'#eeeeee'
			]);
			expect(
				fills(
					renderCrosswordSvg(puzzle, { ...colors, crosswordEnclosedBlocks: '#123456' }, solution)
				)[4]
			).toBe('#123456');
		}
	);
});
