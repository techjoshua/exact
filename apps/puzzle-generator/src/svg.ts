import type { CrosswordPuzzle, PuzzleStyle, SudokuPuzzle, WordSearchPuzzle } from './types.js';

const fontStacks: Readonly<Record<PuzzleStyle['fontFamily'], string>> = {
	sans: 'Inter, ui-sans-serif, system-ui, sans-serif',
	serif: "Georgia, 'Times New Roman', serif",
	mono: "'Courier New', ui-monospace, monospace"
};

/** Renders a complete standalone Sudoku SVG suitable for preview or download. */
export function renderSudokuSvg(
	puzzle: SudokuPuzzle,
	style: PuzzleStyle,
	solution: boolean
): string {
	const cell = Math.max(34, style.fontSize * 2.25);
	const margin = 34;
	const heading = 74;
	const gridSize = cell * puzzle.size;
	const width = gridSize + margin * 2;
	const height = heading + gridSize + margin;
	const values = solution ? puzzle.solution : puzzle.givens;
	const lines: string[] = [];
	for (let offset = 0; offset <= puzzle.size; offset++) {
		const position = margin + offset * cell;
		const weight = offset % puzzle.boxSize === 0 ? style.lineWidth * 2.3 : style.lineWidth;
		lines.push(
			`<path d="M ${position} ${heading} V ${heading + gridSize} M ${margin} ${heading + offset * cell} H ${margin + gridSize}" stroke="${xml(style.ink)}" stroke-width="${weight}"/>`
		);
	}
	const digits = values.flatMap((value, index) => {
		if (!value) return [];
		const row = Math.floor(index / puzzle.size);
		const column = index % puzzle.size;
		const authored = puzzle.givens[index] !== 0;
		return [
			`<text x="${margin + (column + 0.5) * cell}" y="${heading + (row + 0.68) * cell}" text-anchor="middle" font-size="${style.fontSize}" font-weight="${authored ? 700 : 500}" fill="${xml(authored ? style.ink : style.accent)}">${value}</text>`
		];
	});
	return svgDocument(
		width,
		height,
		style,
		`${titleMarkup(style, solution ? 'Solution' : 'Sudoku')}${lines.join('')}${digits.join('')}`
	);
}

/** Renders a word-search SVG; solution mode highlights only authored word paths. */
export function renderWordSearchSvg(
	puzzle: WordSearchPuzzle,
	style: PuzzleStyle,
	solution: boolean
): string {
	const cell = Math.max(28, style.fontSize * 1.7);
	const margin = 34;
	const heading = 74;
	const gridWidth = cell * puzzle.columns;
	const gridHeight = cell * puzzle.rows;
	const bank = wordBank(
		puzzle.placements.map((placement) => placement.word),
		gridWidth,
		style
	);
	const width = gridWidth + margin * 2;
	const height = heading + gridHeight + bank.height + margin;
	const highlights = solution
		? puzzle.placements
				.map((placement) => {
					const x1 = margin + (placement.column + 0.5) * cell;
					const y1 = heading + (placement.row + 0.5) * cell;
					const x2 = x1 + placement.dColumn * (placement.word.length - 1) * cell;
					const y2 = y1 + placement.dRow * (placement.word.length - 1) * cell;
					return `<path d="M ${x1} ${y1} L ${x2} ${y2}" stroke="${xml(style.accent)}" stroke-width="${cell * 0.72}" stroke-linecap="round" opacity=".26"/>`;
				})
				.join('')
		: '';
	const letters = puzzle.grid
		.map((letter, index) => {
			const row = Math.floor(index / puzzle.columns);
			const column = index % puzzle.columns;
			return `<text x="${margin + (column + 0.5) * cell}" y="${heading + (row + 0.69) * cell}" text-anchor="middle" font-size="${style.fontSize}" font-weight="600" fill="${xml(style.ink)}">${letter}</text>`;
		})
		.join('');
	return svgDocument(
		width,
		height,
		style,
		`${titleMarkup(style, solution ? 'Solution' : 'Word search')}${highlights}${letters}${bank.markup.replaceAll('{Y}', String(heading + gridHeight + 24))}`
	);
}

/** Renders a blocked crossword SVG with a word bank in lieu of authored clues. */
export function renderCrosswordSvg(
	puzzle: CrosswordPuzzle,
	style: PuzzleStyle,
	solution: boolean
): string {
	const cell = Math.max(34, style.fontSize * 2.1);
	const margin = 34;
	const heading = 74;
	const gridWidth = cell * puzzle.columns;
	const gridHeight = cell * puzzle.rows;
	const bank = wordBank(puzzle.words, gridWidth, style);
	const width = gridWidth + margin * 2;
	const height = heading + gridHeight + bank.height + margin;
	const cells = puzzle.cells
		.map((entry, index) => {
			const row = Math.floor(index / puzzle.columns);
			const column = index % puzzle.columns;
			const x = margin + column * cell;
			const y = heading + row * cell;
			if (!entry)
				return `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${xml(style.ink)}"/>`;
			return `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${xml(style.paper)}" stroke="${xml(style.ink)}" stroke-width="${style.lineWidth}"/>${entry.number ? `<text x="${x + 4}" y="${y + 11}" font-size="9" fill="${xml(style.ink)}">${entry.number}</text>` : ''}${solution ? `<text x="${x + cell / 2}" y="${y + cell * 0.7}" text-anchor="middle" font-size="${style.fontSize}" font-weight="600" fill="${xml(style.accent)}">${entry.letter}</text>` : ''}`;
		})
		.join('');
	return svgDocument(
		width,
		height,
		style,
		`${titleMarkup(style, solution ? 'Solution' : 'Crossword')}${cells}${bank.markup.replaceAll('{Y}', String(heading + gridHeight + 24))}`
	);
}

/** Encodes an SVG as an image data URL without a Blob lifetime to manage. */
export function svgDataUrl(svg: string): string {
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function svgDocument(width: number, height: number, style: PuzzleStyle, body: string): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${xml(style.title)}" style="font-family:${xml(fontStacks[style.fontFamily])}"><rect width="100%" height="100%" fill="${xml(style.paper)}"/>${body}</svg>`;
}

function titleMarkup(style: PuzzleStyle, fallback: string): string {
	return `<text x="34" y="42" font-size="${Math.max(22, style.fontSize * 1.35)}" font-weight="700" fill="${xml(style.ink)}">${xml(style.title.trim() || fallback)}</text>`;
}

function wordBank(
	words: readonly string[],
	gridWidth: number,
	style: PuzzleStyle
): { height: number; markup: string } {
	const sorted = [...words].sort();
	const longestWord = Math.max(...words.map((word) => word.length));
	const approximateWidth = Math.max(
		90,
		Math.min(gridWidth, longestWord * style.fontSize * 0.52 + 24)
	);
	const columns = Math.max(1, Math.floor(gridWidth / approximateWidth));
	const rows = Math.ceil(sorted.length / columns);
	const columnWidth = gridWidth / columns;
	const lineHeight = style.fontSize * 1.45;
	const markup = sorted
		.map((word, index) => {
			const column = index % columns;
			const row = Math.floor(index / columns);
			return `<text x="${34 + column * columnWidth}" y="{Y}" dy="${row * lineHeight}" font-size="${style.fontSize * 0.72}" letter-spacing="1.2" fill="${xml(style.ink)}">${xml(word)}</text>`;
		})
		.join('');
	return { height: rows * lineHeight + 30, markup };
}

function xml(value: string): string {
	return value.replace(/[&<>"']/g, (character) => {
		const entities: Record<string, string> = {
			'&': '&amp;',
			'<': '&lt;',
			'>': '&gt;',
			'"': '&quot;',
			"'": '&apos;'
		};
		return entities[character]!;
	});
}
