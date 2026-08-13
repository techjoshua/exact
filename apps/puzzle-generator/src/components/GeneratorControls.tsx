import type { Difficulty, PuzzleKind } from '../types.js';
import { AiWordControls } from './AiWordControls.jsx';

type GeneratorControlsProps = {
	kind: PuzzleKind;
	difficulty: Difficulty;
	seed: number;
	boxSize: 2 | 3;
	rows: number;
	columns: number;
	wordText: string;
	aiTopic: string;
	aiPromptTemplate: string;
	aiDefaultPromptTemplate: string;
	aiPromptVisible: boolean;
	aiResponse: string;
	aiResponseVisible: boolean;
	aiBusy: boolean;
	aiProgress: number;
	aiStatus: string;
	aiError?: string;
	aiModel: string;
	aiApiKeyStored: boolean;
	onKind(kind: PuzzleKind): void;
	onDifficulty(difficulty: Difficulty): void;
	onSeed(seed: number): void;
	onBoxSize(size: 2 | 3): void;
	onRows(rows: number): void;
	onColumns(columns: number): void;
	onWordText(wordText: string): void;
	onAiTopic(topic: string): void;
	onAiPromptTemplate(template: string): void;
	onAiPromptVisible(visible: boolean): void;
	onAiResponseVisible(visible: boolean): void;
	onAiResetPrompt(): void;
	onAiGenerate(): void;
	onAiModel(model: string): void;
	onAiSaveApiKey(apiKey: string): void;
	onAiClearApiKey(): void;
	onAiCancel(): void;
	onRandomize(): void;
};

const puzzleKinds: ReadonlyArray<{ id: PuzzleKind; label: string; note: string }> = [
	{ id: 'sudoku', label: 'Sudoku', note: 'Unique solution' },
	{ id: 'word-search', label: 'Word search', note: 'Your word list' },
	{ id: 'crossword', label: 'Crossword', note: 'Maximum overlap' }
];

/** Renders puzzle-specific inputs without owning their durable values. */
export function GeneratorControls(props: GeneratorControlsProps) {
	return () => (
		<section className="control-section" aria-labelledby="puzzle-heading">
			<div className="section-heading">
				<span>01</span>
				<div>
					<h2 id="puzzle-heading">Choose the puzzle</h2>
					<p>Everything is generated locally from the seed.</p>
				</div>
			</div>

			<div className="kind-grid">
				{puzzleKinds.map((kind) => (
					<button
						type="button"
						className="kind-card"
						className:active={props.kind === kind.id}
						onClick={() => props.onKind(kind.id)}
					>
						<strong>{kind.label}</strong>
						<small>{kind.note}</small>
					</button>
				))}
			</div>

			<div className="field-grid">
				{props.kind === 'sudoku' ? (
					<label>
						<span>House size</span>
						<select
							value={String(props.boxSize)}
							onChange={(event) => props.onBoxSize(Number(event.currentTarget.value) as 2 | 3)}
						>
							<option value="3">3 × 3 (9 × 9 grid)</option>
							<option value="2">2 × 2 (4 × 4 grid)</option>
						</select>
					</label>
				) : null}

				{props.kind !== 'crossword' ? (
					<label>
						<span>Difficulty</span>
						<select
							value={props.difficulty}
							onChange={(event) => props.onDifficulty(event.currentTarget.value as Difficulty)}
						>
							<option value="easy">Easy</option>
							<option value="medium">Medium</option>
							<option value="hard">Hard</option>
						</select>
					</label>
				) : null}

				{props.kind === 'word-search' ? (
					<>
						<label>
							<span>Rows</span>
							<input
								type="number"
								min="5"
								max="30"
								value={String(props.rows)}
								onInput={(event) => props.onRows(Number(event.currentTarget.value))}
							/>
						</label>
						<label>
							<span>Columns</span>
							<input
								type="number"
								min="5"
								max="30"
								value={String(props.columns)}
								onInput={(event) => props.onColumns(Number(event.currentTarget.value))}
							/>
						</label>
					</>
				) : null}
			</div>

			{props.kind !== 'sudoku' ? (
				<>
					<label className="word-field">
						<span>{props.kind === 'crossword' ? 'Crossword words' : 'Words to hide'}</span>
						<textarea
							rows={6}
							value={props.wordText}
							onChange={(event) => props.onWordText(event.currentTarget.value)}
							spellcheck="false"
						/>
						<small>
							{props.kind === 'crossword'
								? 'Enter one answer per line as “word - clue”. Lines without a clue remain usable and are labeled.'
								: 'Separate words with spaces, commas, or new lines. Letters A–Z; duplicates are removed.'}
						</small>
					</label>
					<AiWordControls
						kind={props.kind}
						topic={props.aiTopic}
						promptTemplate={props.aiPromptTemplate}
						defaultPromptTemplate={props.aiDefaultPromptTemplate}
						promptVisible={props.aiPromptVisible}
						response={props.aiResponse}
						responseVisible={props.aiResponseVisible}
						busy={props.aiBusy}
						progress={props.aiProgress}
						status={props.aiStatus}
						error={props.aiError}
						model={props.aiModel}
						apiKeyStored={props.aiApiKeyStored}
						onTopic={props.onAiTopic}
						onPromptTemplate={props.onAiPromptTemplate}
						onPromptVisible={props.onAiPromptVisible}
						onResponseVisible={props.onAiResponseVisible}
						onResetPrompt={props.onAiResetPrompt}
						onGenerate={props.onAiGenerate}
						onModel={props.onAiModel}
						onSaveApiKey={props.onAiSaveApiKey}
						onClearApiKey={props.onAiClearApiKey}
						onCancel={props.onAiCancel}
					/>
				</>
			) : null}

			<div className="seed-row">
				<label>
					<span>Seed</span>
					<input
						type="number"
						min="0"
						max="4294967295"
						value={String(props.seed)}
						onInput={(event) => props.onSeed(Number(event.currentTarget.value) >>> 0)}
					/>
				</label>
				<button type="button" className="shuffle-button" onClick={props.onRandomize}>
					<span>Shuffle</span>
					<span aria-hidden="true">↻</span>
				</button>
			</div>
		</section>
	);
}
