import type {
	CrosswordPuzzle,
	PageSize,
	PuzzleFont,
	PuzzleStyle,
	SudokuPuzzle,
	WordSearchPuzzle
} from './types.js';

const fontStacks: Readonly<Record<PuzzleFont, string>> = {
	sans: 'Inter, ui-sans-serif, system-ui, sans-serif',
	serif: "Georgia, 'Times New Roman', serif",
	mono: "'Courier New', ui-monospace, monospace",
	handwritten: "'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive",
	playful: "'Trebuchet MS', 'Arial Rounded MT Bold', ui-sans-serif, sans-serif"
};

const pageSizes: Readonly<Record<PageSize, { width: number; height: number }>> = {
	letter: { width: 816, height: 1056 },
	a4: { width: 794, height: 1123 },
	legal: { width: 816, height: 1344 }
};

/** Renders a complete standalone Sudoku SVG suitable for preview or download. */
export function renderSudokuSvg(
	puzzle: SudokuPuzzle,
	style: PuzzleStyle,
	solution: boolean
): string {
	const cell = Math.max(34, style.fontSize * 2.25);
	const margin = 34;
	const heading = titleHeight(style, margin);
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
		const answerValue = solution && !authored;
		const answerFont =
			answerValue && style.sudokuSolutionFont !== 'inherit'
				? ` font-family="${xml(fontStacks[style.sudokuSolutionFont])}"`
				: '';
		return [
			`<text x="${margin + (column + 0.5) * cell}" y="${heading + (row + 0.68) * cell}" text-anchor="middle" font-size="${style.fontSize}" font-weight="${authored ? 700 : style.sudokuSolutionBold ? 800 : 500}" fill="${xml(authored || style.monochromeSolution ? style.ink : style.accent)}"${answerFont}>${value}</text>`
		];
	});
	return svgDocument(
		width,
		height,
		style,
		`${titleMarkup(style, width)}${lines.join('')}${digits.join('')}`
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
	const heading = titleHeight(style, margin);
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
					const outlineWidth = Math.max(1.5, style.lineWidth);
					const path = wordHighlightPath(x1, y1, x2, y2, cell * 0.36);
					if (style.monochromeSolution) {
						return `<path data-solution-word="${xml(placement.word)}" d="${path}" fill="none" stroke="#000000" stroke-width="${outlineWidth}"/>`;
					}
					return `<path data-solution-word="${xml(placement.word)}" d="${path}" fill="${xml(style.accent)}" opacity=".26"/>`;
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
		`${titleMarkup(style, width)}<rect x="${margin}" y="${heading}" width="${gridWidth}" height="${gridHeight}" fill="none" stroke="${xml(style.ink)}" stroke-width="${style.lineWidth}"/>${highlights}${letters}${bank.markup.replaceAll('{Y}', String(heading + gridHeight + 24))}`
	);
}

function wordHighlightPath(x1: number, y1: number, x2: number, y2: number, radius: number): string {
	const dx = x2 - x1;
	const dy = y2 - y1;
	const length = Math.hypot(dx, dy);
	const r = Math.max(0.5, radius);
	if (length === 0) {
		return `M ${svgNumber(x1)} ${svgNumber(y1 - r)} A ${svgNumber(r)} ${svgNumber(r)} 0 1 1 ${svgNumber(x1)} ${svgNumber(y1 + r)} A ${svgNumber(r)} ${svgNumber(r)} 0 1 1 ${svgNumber(x1)} ${svgNumber(y1 - r)} Z`;
	}
	const perpendicularX = (-dy / length) * r;
	const perpendicularY = (dx / length) * r;
	return `M ${svgNumber(x1 - perpendicularX)} ${svgNumber(y1 - perpendicularY)} L ${svgNumber(x2 - perpendicularX)} ${svgNumber(y2 - perpendicularY)} A ${svgNumber(r)} ${svgNumber(r)} 0 0 1 ${svgNumber(x2 + perpendicularX)} ${svgNumber(y2 + perpendicularY)} L ${svgNumber(x1 + perpendicularX)} ${svgNumber(y1 + perpendicularY)} A ${svgNumber(r)} ${svgNumber(r)} 0 0 1 ${svgNumber(x1 - perpendicularX)} ${svgNumber(y1 - perpendicularY)} Z`;
}

function svgNumber(value: number): string {
	return String(Number(value.toFixed(3)));
}

/** Renders a blocked crossword SVG with a word bank in lieu of authored clues. */
export function renderCrosswordSvg(
	puzzle: CrosswordPuzzle,
	style: PuzzleStyle,
	solution: boolean
): string {
	const cell = Math.max(34, style.fontSize * 2.1);
	const margin = 34;
	const heading = titleHeight(style, margin);
	const gridWidth = cell * puzzle.columns;
	const gridHeight = cell * puzzle.rows;
	const width = Math.max(gridWidth + margin * 2, 620);
	const gridLeft = (width - gridWidth) / 2;
	const clues = clueTable(puzzle, width - margin * 2, style);
	const height = heading + gridHeight + clues.height + margin;
	const backgrounds = puzzle.cells
		.map((entry, index) => {
			const row = Math.floor(index / puzzle.columns);
			const column = index % puzzle.columns;
			const x = gridLeft + column * cell;
			const y = heading + row * cell;
			return `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${xml(entry ? style.paper : style.crosswordBlocks)}"/>`;
		})
		.join('');
	const grid = crosswordGridPath(puzzle, gridLeft, heading, cell);
	const contents = puzzle.cells
		.map((entry, index) => {
			if (!entry) return '';
			const row = Math.floor(index / puzzle.columns);
			const column = index % puzzle.columns;
			const x = gridLeft + column * cell;
			const y = heading + row * cell;
			return `${entry.number ? `<text x="${x + 4}" y="${y + 11}" font-size="9" fill="${xml(style.ink)}">${entry.number}</text>` : ''}${solution ? `<text x="${x + cell / 2}" y="${y + cell * 0.7}" text-anchor="middle" font-size="${style.fontSize}" font-weight="600" fill="${xml(style.monochromeSolution ? '#000000' : style.accent)}">${entry.letter}</text>` : ''}`;
		})
		.join('');
	return svgDocument(
		width,
		height,
		style,
		`${titleMarkup(style, width)}${backgrounds}<path d="${grid}" fill="none" stroke="${xml(style.crosswordGrid)}" stroke-width="${style.lineWidth}"/>${contents}${clues.markup.replaceAll('{Y}', String(heading + gridHeight + 26))}`,
		'#ffffff'
	);
}

function crosswordGridPath(
	puzzle: CrosswordPuzzle,
	margin: number,
	heading: number,
	cell: number
): string {
	const segments = new Map<string, string>();
	for (let index = 0; index < puzzle.cells.length; index++) {
		if (!puzzle.cells[index]) continue;
		const row = Math.floor(index / puzzle.columns);
		const column = index % puzzle.columns;
		const left = margin + column * cell;
		const top = heading + row * cell;
		const right = left + cell;
		const bottom = top + cell;
		segments.set(`h:${row}:${column}`, `M ${left} ${top} H ${right}`);
		segments.set(`h:${row + 1}:${column}`, `M ${left} ${bottom} H ${right}`);
		segments.set(`v:${row}:${column}`, `M ${left} ${top} V ${bottom}`);
		segments.set(`v:${row}:${column + 1}`, `M ${right} ${top} V ${bottom}`);
	}
	return [...segments.values()].join(' ');
}

/** Encodes an SVG as an image data URL without a Blob lifetime to manage. */
export function svgDataUrl(svg: string): string {
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function svgDocument(
	contentWidth: number,
	contentHeight: number,
	style: PuzzleStyle,
	body: string,
	pageBackground = style.paper
): string {
	const page = pageSizes[style.pageSize];
	const pageMargin = style.pageMargin * 96;
	const availableWidth = Math.max(1, page.width - pageMargin * 2);
	const availableHeight = Math.max(1, page.height - pageMargin * 2);
	const scale = Math.min(1, availableWidth / contentWidth, availableHeight / contentHeight);
	const left = pageMargin + (availableWidth - contentWidth * scale) / 2;
	const top = pageMargin + (availableHeight - contentHeight * scale) / 2;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${page.width}" height="${page.height}" viewBox="0 0 ${page.width} ${page.height}" data-page-size="${style.pageSize}" data-page-margin="${style.pageMargin}" data-content-scale="${svgNumber(scale)}" role="img" aria-label="${xml(style.title.trim() || 'Printable puzzle')}" style="font-family:${xml(fontStacks[style.fontFamily])}"><rect width="100%" height="100%" fill="${xml(pageBackground)}"/><g transform="translate(${svgNumber(left)} ${svgNumber(top)}) scale(${svgNumber(scale)})">${body}</g></svg>`;
}

function titleMarkup(style: PuzzleStyle, width: number): string {
	const title = style.title.trim();
	if (!title) return '';
	const alignment =
		style.titleAlignment === 'center'
			? { x: width / 2, anchor: 'middle' }
			: style.titleAlignment === 'right'
				? { x: width - 34, anchor: 'end' }
				: { x: 34, anchor: 'start' };
	return `<text x="${alignment.x}" y="${Math.max(42, style.titleFontSize * 1.35)}" text-anchor="${alignment.anchor}" font-family="${xml(fontStacks[style.titleFontFamily])}" font-size="${style.titleFontSize}" font-weight="700" fill="${xml(style.ink)}">${xml(title)}</text>`;
}

function titleHeight(style: PuzzleStyle, margin: number): number {
	return style.title.trim() ? Math.max(74, style.titleFontSize * 2.1) : margin;
}

/** Returns a user-facing notice when page constraints reduce authored content. */
export function pageFitWarning(svg: string): string | undefined {
	const scale = Number(svg.match(/data-content-scale="([^"]+)"/)?.[1] ?? 1);
	if (scale >= 0.995) return undefined;
	return `Content was scaled to ${Math.round(scale * 100)}% to fit the selected page and margins. Reduce the grid, type size, clues, or margins if it is too small to read.`;
}

function clueTable(
	puzzle: CrosswordPuzzle,
	width: number,
	style: PuzzleStyle
): { height: number; markup: string } {
	const columnGap = 24;
	const columnWidth = (width - columnGap) / 2;
	const fontSize = Math.max(10, style.fontSize * 0.64);
	const lineHeight = fontSize * 1.35;
	const groups = (['across', 'down'] as const).map((orientation, column) => {
		const entries = puzzle.entries.filter((entry) => entry.orientation === orientation);
		let line = 1;
		const x = 34 + column * (columnWidth + columnGap);
		const markup = [
			`<text x="${x}" y="{Y}" font-size="${fontSize + 2}" font-weight="700" fill="${xml(style.ink)}">${orientation === 'across' ? 'Across' : 'Down'}</text>`
		];
		for (const entry of entries) {
			const limit = Math.max(12, Math.floor(columnWidth / (fontSize * 0.56)));
			const lines = wrapClue(`${entry.number}. ${entry.clue}`, limit);
			for (const [index, text] of lines.entries()) {
				markup.push(
					`<text x="${x + (index ? 14 : 0)}" y="{Y}" dy="${line * lineHeight}" font-size="${fontSize}" fill="${xml(style.ink)}">${xml(text)}</text>`
				);
				line++;
			}
			line += 0.25;
		}
		return { lines: line, markup: markup.join('') };
	});
	return {
		height: Math.max(...groups.map((group) => group.lines)) * lineHeight + 22,
		markup: groups.map((group) => group.markup).join('')
	};
}

function wrapClue(clue: string, limit: number): string[] {
	const lines: string[] = [];
	let current = '';
	for (const word of clue.split(/\s+/)) {
		if (!current || `${current} ${word}`.length <= limit)
			current = current ? `${current} ${word}` : word;
		else {
			lines.push(current);
			current = word;
		}
	}
	if (current) lines.push(current);
	return lines;
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
