import { peek, type Component } from '@exactjs/core';
import { GeneratorControls } from './components/GeneratorControls.jsx';
import { PuzzlePreview } from './components/PuzzlePreview.jsx';
import { StyleControls } from './components/StyleControls.jsx';
import {
	createPuzzleDocuments,
	downloadSvg,
	exportBaseName,
	type DocumentRequest
} from './documents.js';
import { createSeed } from './random.js';
import type { Difficulty, PuzzleGeneratorState, PuzzleKind, PuzzleStyle } from './types.js';

const starterWords = `ORBIT
COMET
LUNAR
STARLIGHT
PLANET
TELESCOPE
GALAXY
ECLIPSE
ASTRONAUT
NEBULA`;

const initialStyle: PuzzleStyle = {
	title: 'The Sunday Puzzle No. 1',
	fontFamily: 'sans',
	fontSize: 20,
	ink: '#17251e',
	accent: '#d85f3d',
	paper: '#fffdf6',
	lineWidth: 1.5
};

/** Owns the browser-local generator inputs and the current pair of SVG artifacts. */
export function PuzzleGeneratorApp(this: Component<PuzzleGeneratorState>) {
	this.state.kind = 'sudoku';
	this.state.difficulty = 'medium';
	this.state.seed = createSeed();
	this.state.sudokuBoxSize = 3;
	this.state.wordRows = 14;
	this.state.wordColumns = 14;
	this.state.wordText = starterWords;
	this.state.style = initialStyle;
	this.state.documents = peek(() => createPuzzleDocuments(requestFromState(this.state)));
	this.state.status = 'Ready to export';
	this.state.previewSolution = false;

	const generate = () => {
		try {
			this.state.documents = peek(() => createPuzzleDocuments(requestFromState(this.state)));
			this.state.status = 'Freshly generated';
			this.state.previewSolution = false;
		} catch (error) {
			this.state.status = error instanceof Error ? error.message : String(error);
		}
	};

	const changeKind = (kind: PuzzleKind) => {
		this.state.kind = kind;
		this.state.style = {
			...this.state.style,
			title:
				kind === 'sudoku'
					? 'The Sunday Sudoku'
					: kind === 'word-search'
						? 'A Search Through Space'
						: 'The Stellar Crossword'
		};
		generate();
	};

	const download = (solution: boolean) => {
		const base = exportBaseName(this.state.style.title, this.state.kind);
		downloadSvg(
			solution ? this.state.documents.solutionSvg : this.state.documents.puzzleSvg,
			`${base}-${solution ? 'solution' : 'puzzle'}.svg`
		);
		this.state.status = `${solution ? 'Solution' : 'Puzzle'} SVG exported`;
	};

	return () => (
		<div className="app-shell">
			<header className="masthead">
				<a className="brand" href="#top" aria-label="Puzzle Foundry home">
					<span className="brand-mark" aria-hidden="true">
						PF
					</span>
					<span>
						<strong>Puzzle Foundry</strong>
						<small>Make something worth penciling in.</small>
					</span>
				</a>
				<div className="privacy-note">
					<span aria-hidden="true">●</span>
					Local only · no uploads
				</div>
			</header>

			<main id="top">
				<section className="hero">
					<div>
						<span className="eyebrow">A small press for big thinkers</span>
						<h1>
							Build a puzzle.
							<br />
							<span>Keep the answer.</span>
						</h1>
					</div>
					<p>
						Generate polished, printable puzzles without sending a word or seed anywhere. Export the
						challenge and its answer key as separate, infinitely sharp SVG files.
					</p>
				</section>

				<div className="workspace">
					<aside className="controls-panel">
						<GeneratorControls
							kind={this.state.kind}
							difficulty={this.state.difficulty}
							seed={this.state.seed}
							boxSize={this.state.sudokuBoxSize}
							rows={this.state.wordRows}
							columns={this.state.wordColumns}
							wordText={this.state.wordText}
							onKind={changeKind}
							onDifficulty={(difficulty: Difficulty) => {
								this.state.difficulty = difficulty;
							}}
							onSeed={(seed: number) => {
								this.state.seed = seed;
							}}
							onBoxSize={(size: 2 | 3) => {
								this.state.sudokuBoxSize = size;
							}}
							onRows={(rows: number) => {
								this.state.wordRows = clampDimension(rows);
							}}
							onColumns={(columns: number) => {
								this.state.wordColumns = clampDimension(columns);
							}}
							onWords={(words: string) => {
								this.state.wordText = words;
							}}
							onGenerate={generate}
							onRandomize={() => {
								this.state.seed = createSeed();
								generate();
							}}
						/>
						<StyleControls
							style={this.state.style}
							onStyle={(style: PuzzleStyle) => {
								this.state.style = style;
								generate();
							}}
						/>
					</aside>

					<PuzzlePreview
						documents={this.state.documents}
						solution={this.state.previewSolution}
						status={this.state.status}
						onMode={(solution: boolean) => {
							this.state.previewSolution = solution;
						}}
						onDownload={download}
					/>
				</div>
			</main>

			<footer>
				<span>Puzzle Foundry</span>
				<span>One HTML file. Three generators. Zero network calls.</span>
			</footer>
		</div>
	);
}

function requestFromState(state: PuzzleGeneratorState): DocumentRequest {
	return {
		kind: state.kind,
		difficulty: state.difficulty,
		seed: state.seed,
		boxSize: state.sudokuBoxSize,
		rows: state.wordRows,
		columns: state.wordColumns,
		wordText: state.wordText,
		style: state.style
	};
}

function clampDimension(value: number): number {
	return Number.isFinite(value) ? Math.max(5, Math.min(30, Math.round(value))) : 5;
}
