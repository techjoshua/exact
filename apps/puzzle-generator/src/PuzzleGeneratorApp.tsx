import { peek, type Component } from '@exactjs/core';
import { GeneratorControls } from './components/GeneratorControls.jsx';
import { PuzzlePreview } from './components/PuzzlePreview.jsx';
import { StyleControls } from './components/StyleControls.jsx';
import { defaultAiPromptTemplate, type AiPuzzleKind } from './ai-word-list-format.js';
import { defaultLocalAiModel, type LocalAiModelId } from './ai-models.js';
import {
	createPuzzleDocuments,
	downloadSvg,
	exportBaseName,
	type DocumentRequest
} from './documents.js';
import { createSeed } from './random.js';
import type { PuzzleGeneratorState, PuzzleKind, PuzzleStyle } from './types.js';

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

const starterCrossword = `ORBIT - Path around a planet
COMET - Icy visitor with a tail
LUNAR - Related to the moon
STARLIGHT - Glow arriving from a distant sun
PLANET - World that circles a star
TELESCOPE - Instrument for viewing distant objects
GALAXY - Vast system of stars
ECLIPSE - One celestial body hides another
ASTRONAUT - Traveler beyond Earth's atmosphere
NEBULA - Cloud of gas and dust in space`;

const initialStyle: PuzzleStyle = {
	title: 'The Sunday Puzzle No. 1',
	titleAlignment: 'left',
	titleFontFamily: 'serif',
	titleFontSize: 28,
	fontFamily: 'sans',
	fontSize: 20,
	pageSize: 'letter',
	pageMargin: 0.5,
	ink: '#17251e',
	accent: '#d85f3d',
	paper: '#fffdf6',
	lineWidth: 1.5,
	monochromeSolution: false,
	crosswordGrid: '#17251e',
	crosswordBlocks: '#fffdf6',
	sudokuSolutionFont: 'inherit',
	sudokuSolutionBold: false
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
	this.state.crosswordText = starterCrossword;
	this.state.aiTopic = '';
	this.state.aiWordSearchPrompt = defaultAiPromptTemplate('word-search');
	this.state.aiCrosswordPrompt = defaultAiPromptTemplate('crossword');
	this.state.aiPromptVisible = false;
	this.state.aiSupported =
		typeof navigator !== 'undefined' && 'gpu' in navigator && globalThis.isSecureContext !== false;
	this.state.aiBusy = false;
	this.state.aiProgress = 0;
	this.state.aiStatus = 'Ready';
	this.state.aiError = undefined;
	this.state.aiModel = defaultLocalAiModel;
	this.state.aiModelReady = false;
	this.state.style = initialStyle;
	this.state.documents = peek(() => createPuzzleDocuments(requestFromState(this.state)));
	this.state.status = 'Ready to export';
	this.state.error = undefined;
	this.state.previewSolution = false;
	let aiGeneration = 0;
	let localAiModule: Promise<typeof import('./local-ai.js')> | undefined;

	const generate = (status = 'Preview updated') => {
		try {
			this.state.documents = peek(() => createPuzzleDocuments(requestFromState(this.state)));
			this.state.status = status;
			this.state.error = undefined;
		} catch (error) {
			this.state.status = 'Could not update puzzle · showing the last valid preview';
			this.state.error = error instanceof Error ? error.message : String(error);
		}
	};

	const changeKind = (kind: PuzzleKind) => {
		if (this.state.aiBusy) cancelAiGeneration();
		this.state.kind = kind;
		generate();
	};

	const generateWithLocalAi = async () => {
		const topic = this.state.aiTopic.trim();
		const kind = this.state.kind;
		if (!topic || kind === 'sudoku' || this.state.aiBusy) return;
		const promptTemplate = aiPromptTemplate(this.state, kind);
		const generation = ++aiGeneration;
		this.state.aiBusy = true;
		this.state.aiProgress = 0;
		this.state.aiStatus = 'Preparing local AI…';
		this.state.aiError = undefined;
		try {
			localAiModule ??= import('./local-ai.js');
			const localAi = await localAiModule;
			if (generation !== aiGeneration) return;
			const wordText = await localAi.generateLocalAiWordList(
				this.state.aiModel,
				topic,
				kind,
				promptTemplate,
				(progress) => {
					if (generation !== aiGeneration) return;
					this.state.aiProgress = progress.progress;
					this.state.aiStatus = progress.text;
				}
			);
			if (generation !== aiGeneration) return;
			if (kind === 'crossword') this.state.crosswordText = wordText;
			else this.state.wordText = wordText;
			this.state.aiStatus = 'Generated locally';
			this.state.aiProgress = 1;
			this.state.aiModelReady = true;
			generate('Local AI word list applied');
		} catch (error) {
			if (generation !== aiGeneration) return;
			this.state.aiError = error instanceof Error ? error.message : String(error);
			this.state.aiStatus = 'Local AI could not generate a list';
		} finally {
			if (generation === aiGeneration) this.state.aiBusy = false;
		}
	};

	const removeLocalAiModel = async () => {
		try {
			localAiModule ??= import('./local-ai.js');
			const localAi = await localAiModule;
			await localAi.removeLocalAiModel(this.state.aiModel);
			localAiModule = undefined;
			this.state.aiModelReady = false;
			this.state.aiStatus = 'Downloaded model removed';
			this.state.aiError = undefined;
		} catch (error) {
			this.state.aiError = error instanceof Error ? error.message : String(error);
		}
	};

	const cancelAiGeneration = () => {
		aiGeneration++;
		void localAiModule?.then((localAi) => localAi.disposeLocalAi());
		localAiModule = undefined;
		this.state.aiBusy = false;
		this.state.aiProgress = 0;
		this.state.aiStatus = 'Local AI canceled';
	};

	const changeLocalAiModel = (model: LocalAiModelId) => {
		if (model === this.state.aiModel) return;
		if (this.state.aiBusy) cancelAiGeneration();
		else {
			aiGeneration++;
			void localAiModule?.then((localAi) => localAi.disposeLocalAi());
			localAiModule = undefined;
		}
		this.state.aiModel = model;
		this.state.aiModelReady = false;
		this.state.aiStatus = 'Ready';
		this.state.aiError = undefined;
	};

	this.onUnmount(() => {
		aiGeneration++;
		void localAiModule?.then((localAi) => localAi.disposeLocalAi());
	});

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
					Local generation · no puzzle uploads
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
							wordText={
								this.state.kind === 'crossword' ? this.state.crosswordText : this.state.wordText
							}
							aiTopic={this.state.aiTopic}
							aiPromptTemplate={aiPromptTemplate(this.state, currentAiKind(this.state.kind))}
							aiDefaultPromptTemplate={defaultAiPromptTemplate(currentAiKind(this.state.kind))}
							aiPromptVisible={this.state.aiPromptVisible}
							aiSupported={this.state.aiSupported}
							aiBusy={this.state.aiBusy}
							aiProgress={this.state.aiProgress}
							aiStatus={this.state.aiStatus}
							aiError={this.state.aiError}
							aiModel={this.state.aiModel}
							aiModelReady={this.state.aiModelReady}
							onKind={changeKind}
							onDifficulty={(difficulty) => {
								this.state.difficulty = difficulty;
								generate();
							}}
							onSeed={(seed) => {
								this.state.seed = seed;
								generate();
							}}
							onBoxSize={(boxSize) => {
								this.state.sudokuBoxSize = boxSize;
								generate();
							}}
							onRows={(rows: number) => {
								this.state.wordRows = clampDimension(rows);
								generate();
							}}
							onColumns={(columns: number) => {
								this.state.wordColumns = clampDimension(columns);
								generate();
							}}
							onWordText={(wordText) => {
								if (this.state.kind === 'crossword') this.state.crosswordText = wordText;
								else this.state.wordText = wordText;
								generate();
							}}
							onAiTopic={(topic) => {
								this.state.aiTopic = topic;
								this.state.aiError = undefined;
							}}
							onAiPromptTemplate={(template) => {
								if (this.state.kind === 'crossword') this.state.aiCrosswordPrompt = template;
								else this.state.aiWordSearchPrompt = template;
								this.state.aiError = undefined;
							}}
							onAiPromptVisible={(visible) => {
								this.state.aiPromptVisible = visible;
							}}
							onAiResetPrompt={() => {
								const kind = currentAiKind(this.state.kind);
								if (kind === 'crossword')
									this.state.aiCrosswordPrompt = defaultAiPromptTemplate(kind);
								else this.state.aiWordSearchPrompt = defaultAiPromptTemplate(kind);
								this.state.aiError = undefined;
							}}
							onAiGenerate={() => void generateWithLocalAi()}
							onAiModel={changeLocalAiModel}
							onAiCancel={cancelAiGeneration}
							onAiRemoveModel={() => void removeLocalAiModel()}
							onRandomize={() => {
								this.state.seed = createSeed();
								generate('Puzzle shuffled');
							}}
						/>
						<StyleControls
							kind={this.state.kind}
							style={this.state.style}
							onStyle={(style: PuzzleStyle) => {
								this.state.style = style;
								generate();
							}}
						/>
					</aside>

					<PuzzlePreview
						documents={this.state.documents}
						solution:onSolution={this.state.previewSolution}
						status={this.state.status}
						error={this.state.error}
						onDownload={download}
					/>
				</div>
			</main>

			<footer>
				<span>Puzzle Foundry</span>
				<span>One HTML file. Three generators. Optional local AI.</span>
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
		wordText: state.kind === 'crossword' ? state.crosswordText : state.wordText,
		style: state.style
	};
}

function currentAiKind(kind: PuzzleKind): AiPuzzleKind {
	return kind === 'crossword' ? 'crossword' : 'word-search';
}

function aiPromptTemplate(state: PuzzleGeneratorState, kind: AiPuzzleKind): string {
	return kind === 'crossword' ? state.aiCrosswordPrompt : state.aiWordSearchPrompt;
}

function clampDimension(value: number): number {
	return Number.isFinite(value) ? Math.max(5, Math.min(30, Math.round(value))) : 5;
}
