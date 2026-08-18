import type { AiPuzzleKind } from '../ai-word-list-format.js';
import { getLocalAiModel, localAiModels, type LocalAiModelId } from '../ai-models.js';

type AiWordControlsProps = {
	kind: AiPuzzleKind;
	topic: string;
	promptTemplate: string;
	defaultPromptTemplate: string;
	promptVisible: boolean;
	response: string;
	responseVisible: boolean;
	supported: boolean;
	busy: boolean;
	progress: number;
	status: string;
	error?: string;
	model: LocalAiModelId;
	modelReady: boolean;
	onTopic(topic: string): void;
	onPromptTemplate(template: string): void;
	onPromptVisible(visible: boolean): void;
	onResponseVisible(visible: boolean): void;
	onResetPrompt(): void;
	onGenerate(): void;
	onModel(model: LocalAiModelId): void;
	onCancel(): void;
	onRemoveModel(): void;
};

/** Renders the explicit opt-in controls for browser-local word and clue generation. */
export function AiWordControls(props: AiWordControlsProps) {
	return () => (
		<div
			theme:surface="sunken"
			className="option-box ai-option"
			aria-busy={props.busy ? 'true' : 'false'}
		>
			<strong>Local AI helper</strong>
			<p>
				Generate {props.kind === 'crossword' ? 'answers and clues' : 'a word list'} from a topic.
				Your topic stays on this device.
			</p>
			<label className="wide-field">
				<span>Topic</span>
				<input
					theme:field="default"
					type="text"
					maxlength="80"
					placeholder="For example: deep-sea animals"
					value={props.topic}
					disabled={props.busy}
					onInput={(event) => props.onTopic(event.currentTarget.value)}
				/>
			</label>
			<label className="wide-field">
				<span>Local model</span>
				<select
					theme:field="default"
					value={props.model}
					disabled={props.busy}
					onChange={(event) => props.onModel(event.currentTarget.value as LocalAiModelId)}
				>
					{localAiModels.map((model) => (
						<option value={model.id}>
							{model.label} · ~{model.downloadMb} MB
						</option>
					))}
				</select>
				<small>{getLocalAiModel(props.model).note}</small>
			</label>
			<div className="ai-prompt-toolbar">
				<div>
					<button
						theme:action="quiet"
						type="button"
						className="text-button"
						aria-expanded={props.promptVisible ? 'true' : 'false'}
						aria-controls={`ai-prompt-${props.kind}`}
						onClick={() => props.onPromptVisible(!props.promptVisible)}
					>
						{props.promptVisible ? 'Hide prompt' : 'Show prompt'}
					</button>
					{props.response ? (
						<button
							theme:action="quiet"
							type="button"
							className="text-button"
							aria-expanded={props.responseVisible ? 'true' : 'false'}
							aria-controls={`ai-response-${props.kind}`}
							onClick={() => props.onResponseVisible(!props.responseVisible)}
						>
							{props.responseVisible ? 'Hide response' : 'Show response'}
						</button>
					) : null}
				</div>
				{props.promptVisible ? (
					<button
						theme:action="quiet"
						type="button"
						className="text-button"
						disabled={props.busy || props.promptTemplate === props.defaultPromptTemplate}
						onClick={props.onResetPrompt}
					>
						Reset template
					</button>
				) : null}
			</div>
			{props.promptVisible ? (
				<label className="ai-prompt-editor" id={`ai-prompt-${props.kind}`}>
					<span>Prompt template</span>
					<textarea
						theme:field="default"
						rows={12}
						maxlength="4000"
						value={props.promptTemplate}
						disabled={props.busy}
						spellcheck="true"
						onInput={(event) => props.onPromptTemplate(event.currentTarget.value)}
					/>
					<small>
						Use {'{{topic}}'} where the entered topic should appear. Structured JSON output and
						answer safety checks are enforced separately.
					</small>
				</label>
			) : null}
			{props.responseVisible && props.response ? (
				<div theme:surface="sunken" className="ai-response-viewer" id={`ai-response-${props.kind}`}>
					<span>Raw model response</span>
					<pre theme:text="code">{props.response}</pre>
					<small>Shown exactly as received, before parsing and safety checks.</small>
				</div>
			) : null}
			{props.busy ? (
				<div className="ai-progress" aria-live="polite">
					<progress max="1" value={String(props.progress)} />
					<span>{props.status}</span>
				</div>
			) : props.status !== 'Ready' ? (
				<p theme:status="info" className="ai-status" aria-live="polite">
					{props.status}
				</p>
			) : null}
			{props.error ? (
				<p theme:status="danger" className="ai-error" role="alert">
					{props.error}
				</p>
			) : null}
			<div className="ai-actions">
				<button
					theme:action="secondary"
					type="button"
					className="secondary-button"
					disabled={
						!props.supported || props.busy || !props.topic.trim() || !props.promptTemplate.trim()
					}
					onClick={props.onGenerate}
				>
					Generate with local AI
				</button>
				{props.busy ? (
					<button theme:action="quiet" type="button" onClick={props.onCancel}>
						Cancel
					</button>
				) : props.modelReady ? (
					<button
						theme:action="quiet"
						theme:tone="danger"
						type="button"
						onClick={props.onRemoveModel}
					>
						Remove model
					</button>
				) : null}
			</div>
			<small>
				{props.supported
					? `First use downloads about ${getLocalAiModel(props.model).downloadMb} MB from Hugging Face and needs roughly ${formatMemory(getLocalAiModel(props.model).gpuMemoryMb)} of GPU memory. Each model is cached separately by this browser.`
					: 'Local AI is unavailable because this browser or device does not expose WebGPU.'}
			</small>
		</div>
	);
}

function formatMemory(megabytes: number): string {
	return megabytes < 1000 ? `${megabytes} MB` : `${(megabytes / 1000).toFixed(1)} GB`;
}
