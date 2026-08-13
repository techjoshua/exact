import { peek, type Component } from '@exactjs/core';
import { GeneratorControls } from './components/GeneratorControls.jsx';
import { PuzzlePreview } from './components/PuzzlePreview.jsx';
import { StyleControls } from './components/StyleControls.jsx';
import { defaultAiPromptTemplate, type AiPuzzleKind } from './ai-word-list-format.js';
import {
	BULK_COUNT_LIMIT,
	createBulkPuzzleArchive,
	downloadBulkPuzzleArchive
} from './bulk-export.js';
import {
	createManualBulkPlan,
	formatBulkPuzzlePlan,
	parseBulkPuzzlePlan,
	verifyBulkPuzzlePlan
} from './bulk-plan.js';
import {
	createPuzzleDocuments,
	downloadSvg,
	exportBaseName,
	type DocumentRequest
} from './documents.js';
import { createSeed } from './random.js';
import { generateOpenAiWordList } from './openai-ai.js';
import { generateOpenAiBulkPlan } from './openai-bulk.js';
import { clearOpenAiSettings, loadOpenAiSettings, saveOpenAiSettings } from './openai-settings.js';
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
	supplementaryFontFamily: 'sans',
	supplementaryFontSize: 14,
	pageSize: 'letter',
	customPageWidth: 8.5,
	customPageHeight: 11,
	pageMarginPreset: 'standard',
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
	const openAiSettings = loadOpenAiSettings();
	let openAiApiKey = openAiSettings.apiKey;
	let openAiRequest: AbortController | undefined;
	let bulkRequest: AbortController | undefined;
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
	this.state.aiResponse = '';
	this.state.aiResponseVisible = false;
	this.state.aiBusy = false;
	this.state.aiProgress = 0;
	this.state.aiStatus = 'Ready';
	this.state.aiError = undefined;
	this.state.aiModel = openAiSettings.model;
	this.state.aiApiKeyStored = Boolean(openAiApiKey);
	this.state.style = initialStyle;
	this.state.documents = peek(() => createPuzzleDocuments(requestFromState(this.state)));
	this.state.status = 'Ready to export';
	this.state.error = undefined;
	this.state.previewSolution = false;
	this.state.bulkCount = 50;
	this.state.bulkPlanText = '';
	this.state.bulkVerified = false;
	this.state.bulkBusy = false;
	this.state.bulkCompleted = 0;
	this.state.bulkStatus = 'Ready to create a puzzle set';
	this.state.bulkError = undefined;
	let aiGeneration = 0;
	let bulkGeneration = 0;

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

	const invalidateBulkVerification = () => {
		if (!this.state.bulkPlanText) return;
		this.state.bulkVerified = false;
		this.state.bulkStatus = 'Shared settings changed; verify the edition again';
		this.state.bulkError = undefined;
	};

	const changeKind = (kind: PuzzleKind) => {
		if (this.state.aiBusy) cancelAiGeneration();
		if (this.state.bulkBusy) cancelBulkGeneration();
		this.state.kind = kind;
		this.state.bulkPlanText = '';
		this.state.bulkVerified = false;
		this.state.bulkStatus = 'Create or draft an edition plan';
		this.state.bulkError = undefined;
		generate();
	};

	const generateWithOpenAi = async () => {
		const topic = this.state.aiTopic.trim();
		const kind = this.state.kind;
		const model = this.state.aiModel.trim();
		if (!topic || !model || !openAiApiKey || kind === 'sudoku' || this.state.aiBusy) return;
		const promptTemplate = aiPromptTemplate(this.state, kind);
		const generation = ++aiGeneration;
		openAiRequest = new AbortController();
		this.state.aiBusy = true;
		this.state.aiProgress = 0.5;
		this.state.aiStatus = 'Waiting for OpenAI…';
		this.state.aiError = undefined;
		this.state.aiResponse = '';
		this.state.aiResponseVisible = false;
		try {
			const wordText = await generateOpenAiWordList(
				openAiApiKey,
				model,
				topic,
				kind,
				promptTemplate,
				(response) => {
					if (generation !== aiGeneration) return;
					const attempt = response.attempt === 'initial' ? 'Initial response' : 'Repair response';
					const section = `${attempt}\n${response.content}`;
					this.state.aiResponse = this.state.aiResponse
						? `${this.state.aiResponse}\n\n${section}`
						: section;
				},
				openAiRequest.signal
			);
			if (generation !== aiGeneration) return;
			if (kind === 'crossword') this.state.crosswordText = wordText;
			else this.state.wordText = wordText;
			this.state.aiStatus = 'Generated with OpenAI';
			this.state.aiProgress = 1;
			generate('OpenAI word list applied');
		} catch (error) {
			if (generation !== aiGeneration) return;
			this.state.aiError =
				error instanceof DOMException && error.name === 'AbortError'
					? undefined
					: error instanceof Error
						? error.message
						: String(error);
			this.state.aiStatus = this.state.aiError
				? 'OpenAI could not generate a list'
				: 'OpenAI request canceled';
			if (this.state.aiResponse) this.state.aiResponseVisible = true;
		} finally {
			if (generation === aiGeneration) {
				this.state.aiBusy = false;
				openAiRequest = undefined;
			}
		}
	};

	const cancelAiGeneration = () => {
		aiGeneration++;
		openAiRequest?.abort();
		openAiRequest = undefined;
		this.state.aiBusy = false;
		this.state.aiProgress = 0;
		this.state.aiStatus = 'OpenAI request canceled';
	};

	const changeOpenAiModel = (model: string) => {
		if (model === this.state.aiModel) return;
		if (this.state.aiBusy) cancelAiGeneration();
		if (this.state.bulkBusy) cancelBulkGeneration();
		this.state.aiModel = model;
		this.state.aiError = undefined;
		if (openAiApiKey) {
			try {
				saveOpenAiSettings({ apiKey: openAiApiKey, model });
			} catch (error) {
				this.state.aiError = `Could not save OpenAI settings: ${error instanceof Error ? error.message : String(error)}`;
			}
		}
		this.state.aiStatus = 'Ready';
		this.state.aiResponse = '';
		this.state.aiResponseVisible = false;
	};

	const saveOpenAiApiKey = (apiKey: string) => {
		try {
			saveOpenAiSettings({ apiKey, model: this.state.aiModel });
			openAiApiKey = apiKey;
			this.state.aiApiKeyStored = true;
			this.state.aiStatus = 'API key saved in this browser';
			this.state.aiError = undefined;
		} catch (error) {
			this.state.aiError = `Could not save the API key: ${error instanceof Error ? error.message : String(error)}`;
		}
	};

	const clearOpenAiApiKey = () => {
		if (this.state.aiBusy) cancelAiGeneration();
		if (this.state.bulkBusy) cancelBulkGeneration();
		try {
			clearOpenAiSettings();
			openAiApiKey = '';
			this.state.aiApiKeyStored = false;
			this.state.aiStatus = 'Saved API key cleared';
			this.state.aiError = undefined;
		} catch (error) {
			this.state.aiError = `Could not clear the API key: ${error instanceof Error ? error.message : String(error)}`;
		}
	};

	const generateBulkArchive = async () => {
		if (this.state.bulkBusy || !this.state.bulkVerified) return;
		const generation = ++bulkGeneration;
		const count = this.state.bulkCount;
		const request = requestFromState(this.state);
		let plan;
		try {
			plan = parseBulkPuzzlePlan(this.state.bulkPlanText, request.kind);
		} catch (error) {
			this.state.bulkVerified = false;
			this.state.bulkError = error instanceof Error ? error.message : String(error);
			return;
		}
		bulkRequest = new AbortController();
		this.state.bulkBusy = true;
		this.state.bulkCompleted = 0;
		this.state.bulkStatus = `Creating 0 of ${count} distinct puzzles…`;
		this.state.bulkError = undefined;
		try {
			const archive = await createBulkPuzzleArchive(
				request,
				plan,
				({ completed, total }) => {
					if (generation !== bulkGeneration) return;
					this.state.bulkCompleted = completed;
					this.state.bulkStatus = `Creating ${completed} of ${total} distinct puzzles…`;
				},
				bulkRequest.signal
			);
			if (generation !== bulkGeneration) return;
			downloadBulkPuzzleArchive(archive);
			this.state.bulkStatus = `${count} puzzle and solution pairs exported`;
			this.state.status = `Bulk ${request.kind} ZIP exported`;
		} catch (error) {
			if (generation !== bulkGeneration) return;
			const canceled = error instanceof DOMException && error.name === 'AbortError';
			this.state.bulkError = canceled
				? undefined
				: error instanceof Error
					? error.message
					: String(error);
			this.state.bulkStatus = canceled ? 'Bulk generation canceled' : 'Could not create puzzle set';
		} finally {
			if (generation === bulkGeneration) {
				this.state.bulkBusy = false;
				bulkRequest = undefined;
			}
		}
	};

	const createManualEditionDraft = () => {
		const request = requestFromState(this.state);
		this.state.bulkPlanText = formatBulkPuzzlePlan(
			createManualBulkPlan(request, this.state.bulkCount)
		);
		this.state.bulkVerified = false;
		this.state.bulkError = undefined;
		this.state.bulkStatus =
			request.kind === 'sudoku'
				? 'Review the individual titles, then verify the edition'
				: 'Replace repeated source blocks with per-puzzle material, then verify';
	};

	const verifyBulkEdition = () => {
		const verification = verifyBulkPuzzlePlan(
			this.state.bulkPlanText,
			requestFromState(this.state),
			this.state.bulkCount
		);
		this.state.bulkVerified = verification.issues.length === 0;
		this.state.bulkError = verification.issues.length
			? verification.issues.join('\n')
			: undefined;
		this.state.bulkStatus = verification.issues.length
			? `${verification.issues.length} edition issue${verification.issues.length === 1 ? '' : 's'} need attention`
			: verification.warnings.length
				? `Verified with ${verification.warnings.length} warning${verification.warnings.length === 1 ? '' : 's'}: ${verification.warnings.join(' ')}`
				: `${verification.plan!.entries.length} titled puzzles verified and ready to export`;
	};

	const generateBulkPlanWithOpenAi = async () => {
		const kind = this.state.kind;
		const topic = this.state.aiTopic.trim();
		const model = this.state.aiModel.trim();
		if (kind === 'sudoku' || !topic || !model || !openAiApiKey || this.state.bulkBusy) return;
		const generation = ++bulkGeneration;
		bulkRequest = new AbortController();
		this.state.bulkBusy = true;
		this.state.bulkCompleted = 0;
		this.state.bulkError = undefined;
		this.state.bulkVerified = false;
		this.state.bulkStatus = `OpenAI is drafting 0 of ${this.state.bulkCount} puzzles…`;
		try {
			const plan = await generateOpenAiBulkPlan(
				openAiApiKey,
				model,
				topic,
				kind,
				this.state.bulkCount,
				({ completed, total, content }) => {
					if (generation !== bulkGeneration) return;
					this.state.bulkCompleted = completed;
					this.state.bulkStatus = `OpenAI drafted ${completed} of ${total} puzzles…`;
					if (content)
						this.state.aiResponse = this.state.aiResponse
							? `${this.state.aiResponse}\n\nBulk draft\n${content}`
							: `Bulk draft\n${content}`;
				},
				bulkRequest.signal
			);
			if (generation !== bulkGeneration) return;
			this.state.bulkPlanText = formatBulkPuzzlePlan(plan);
			this.state.bulkStatus = 'OpenAI draft ready for manual review and verification';
		} catch (error) {
			if (generation !== bulkGeneration) return;
			const canceled = error instanceof DOMException && error.name === 'AbortError';
			this.state.bulkError = canceled ? undefined : error instanceof Error ? error.message : String(error);
			this.state.bulkStatus = canceled ? 'Bulk drafting canceled' : 'OpenAI could not draft the edition';
		} finally {
			if (generation === bulkGeneration) {
				this.state.bulkBusy = false;
				bulkRequest = undefined;
			}
		}
	};

	const cancelBulkGeneration = () => {
		bulkGeneration++;
		bulkRequest?.abort();
		bulkRequest = undefined;
		this.state.bulkBusy = false;
		this.state.bulkCompleted = 0;
		this.state.bulkStatus = 'Bulk generation canceled';
		this.state.bulkError = undefined;
	};

	this.onUnmount(() => {
		aiGeneration++;
		openAiRequest?.abort();
		bulkGeneration++;
		bulkRequest?.abort();
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
					Local puzzle generation · OpenAI helper is opt-in
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
						Generate polished, printable puzzles locally. Optional OpenAI input authoring sends only
						the topic and prompt you submit. Export the challenge and answer key as separate,
						infinitely sharp SVG files.
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
							aiResponse={this.state.aiResponse}
							aiResponseVisible={this.state.aiResponseVisible}
							aiBusy={this.state.aiBusy}
							aiProgress={this.state.aiProgress}
							aiStatus={this.state.aiStatus}
							aiError={this.state.aiError}
							aiModel={this.state.aiModel}
							aiApiKeyStored={this.state.aiApiKeyStored}
							onKind={changeKind}
							onDifficulty={(difficulty) => {
								this.state.difficulty = difficulty;
								invalidateBulkVerification();
								generate();
							}}
							onSeed={(seed) => {
								this.state.seed = seed;
								invalidateBulkVerification();
								generate();
							}}
							onBoxSize={(boxSize) => {
								this.state.sudokuBoxSize = boxSize;
								invalidateBulkVerification();
								generate();
							}}
							onRows={(rows: number) => {
								this.state.wordRows = clampDimension(rows);
								invalidateBulkVerification();
								generate();
							}}
							onColumns={(columns: number) => {
								this.state.wordColumns = clampDimension(columns);
								invalidateBulkVerification();
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
							onAiResponseVisible={(visible) => {
								this.state.aiResponseVisible = visible;
							}}
							onAiResetPrompt={() => {
								const kind = currentAiKind(this.state.kind);
								if (kind === 'crossword')
									this.state.aiCrosswordPrompt = defaultAiPromptTemplate(kind);
								else this.state.aiWordSearchPrompt = defaultAiPromptTemplate(kind);
								this.state.aiError = undefined;
							}}
							onAiGenerate={() => void generateWithOpenAi()}
							onAiModel={changeOpenAiModel}
							onAiSaveApiKey={saveOpenAiApiKey}
							onAiClearApiKey={clearOpenAiApiKey}
							onAiCancel={cancelAiGeneration}
							onRandomize={() => {
								this.state.seed = createSeed();
								invalidateBulkVerification();
								generate('Puzzle shuffled');
							}}
						/>
						<StyleControls
							kind={this.state.kind}
							style={this.state.style}
							onStyle={(style: PuzzleStyle) => {
								this.state.style = style;
								invalidateBulkVerification();
								generate();
							}}
						/>
					</aside>

					<PuzzlePreview
						kind={this.state.kind}
						documents={this.state.documents}
						solution:onSolution={this.state.previewSolution}
						status={this.state.status}
						error={this.state.error}
						onDownload={download}
						bulkCount={this.state.bulkCount}
						bulkPlanText={this.state.bulkPlanText}
						bulkVerified={this.state.bulkVerified}
						bulkBusy={this.state.bulkBusy}
						bulkCompleted={this.state.bulkCompleted}
						bulkStatus={this.state.bulkStatus}
						bulkError={this.state.bulkError}
						bulkCanUseOpenAi={
							this.state.aiApiKeyStored &&
							Boolean(this.state.aiTopic.trim()) &&
							Boolean(this.state.aiModel.trim())
						}
						onBulkCount={(count) => {
							this.state.bulkCount = clampBulkCount(count);
							this.state.bulkVerified = false;
							this.state.bulkError = undefined;
						}}
						onBulkPlanText={(source) => {
							this.state.bulkPlanText = source;
							this.state.bulkVerified = false;
							this.state.bulkStatus = 'Edition changed; verify it before export';
							this.state.bulkError = undefined;
						}}
						onBulkManualDraft={createManualEditionDraft}
						onBulkOpenAiDraft={() => void generateBulkPlanWithOpenAi()}
						onBulkVerify={verifyBulkEdition}
						onBulkGenerate={() => void generateBulkArchive()}
						onBulkCancel={cancelBulkGeneration}
					/>
				</div>
			</main>

			<footer>
				<span>Puzzle Foundry</span>
				<span>One HTML file. Three generators. Optional OpenAI input authoring.</span>
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

function clampBulkCount(value: number): number {
	return Number.isFinite(value)
		? Math.max(1, Math.min(BULK_COUNT_LIMIT, Math.round(value)))
		: 1;
}
