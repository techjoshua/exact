import { createRef, type Component } from '@exactjs/core';
import type { AiPuzzleKind } from '../ai-word-list-format.js';

type AiWordControlsProps = {
	kind: AiPuzzleKind;
	topic: string;
	promptTemplate: string;
	defaultPromptTemplate: string;
	promptVisible: boolean;
	response: string;
	responseVisible: boolean;
	busy: boolean;
	progress: number;
	status: string;
	error?: string;
	model: string;
	apiKeyStored: boolean;
	configVisible: boolean;
	onTopic(topic: string): void;
	onPromptTemplate(template: string): void;
	onPromptVisible(visible: boolean): void;
	onResponseVisible(visible: boolean): void;
	onResetPrompt(): void;
	onGenerate(): void;
	onModel(model: string): void;
	onSaveApiKey(apiKey: string): void;
	onClearApiKey(): void;
	onCancel(): void;
	onConfigVisible(visible: boolean): void;
};

/** Renders explicit OpenAI credentials and word or clue generation controls. */
export function AiWordControls(this: Component<{}>, props: AiWordControlsProps) {
	const apiKeyInput = createRef<HTMLInputElement>('openai-api-key');

	return () => (
		<div
			className="option-box ai-option"
			className:expanded={props.configVisible}
			aria-busy={props.busy ? 'true' : 'false'}
		>
			<button
				type="button"
				className="ai-config-toggle"
				aria-expanded={props.configVisible ? 'true' : 'false'}
				aria-controls={`ai-config-${props.kind}`}
				aria-label={`OpenAI helper · ${props.apiKeyStored ? 'configured' : 'setup required'}`}
				onClick={() => props.onConfigVisible(!props.configVisible)}
			>
				<span
					className="ai-config-icon"
					className:configured={props.apiKeyStored}
					aria-hidden="true"
				>
					<svg viewBox="0 0 24 24">
						<circle cx="8" cy="12" r="4" />
						<path d="M12 12h9m-3 0v3m-3-3v2" />
					</svg>
					<span>{props.apiKeyStored ? '✓' : '!'}</span>
				</span>
				<span className="ai-config-label">
					<strong>OpenAI helper</strong>
					<small>{props.apiKeyStored ? 'Configured' : 'Setup required'}</small>
				</span>
				<span className="ai-config-chevron" aria-hidden="true">
					{props.configVisible ? '−' : '+'}
				</span>
			</button>
			{props.configVisible ? (
				<div className="ai-config-body" id={`ai-config-${props.kind}`}>
					<p>
						Generate {props.kind === 'crossword' ? 'answers and clues' : 'a word list'} from a
						topic. Your topic and prompt are sent to OpenAI.
					</p>
					<label className="wide-field">
						<span>OpenAI API key</span>
						<input
							ref={this.ref(apiKeyInput)}
							type="password"
							autocomplete="off"
							placeholder={props.apiKeyStored ? 'API key saved in this browser' : 'sk-…'}
							disabled={props.busy}
						/>
						<small>
							Saving stores the key in this origin's localStorage. Scripts running on this origin
							can read it, so use a restricted key and clear it on shared devices.
						</small>
					</label>
					<div className="ai-actions">
						<button
							type="button"
							className="secondary-button"
							disabled={props.busy}
							onClick={() => {
								const input = this.refs.get(apiKeyInput);
								const key = input?.value.trim() ?? '';
								if (!key) return;
								props.onSaveApiKey(key);
								input!.value = '';
							}}
						>
							Save API key
						</button>
						{props.apiKeyStored ? (
							<button
								type="button"
								className="text-button"
								disabled={props.busy}
								onClick={props.onClearApiKey}
							>
								Clear saved key
							</button>
						) : null}
					</div>
					<label className="wide-field">
						<span>OpenAI model</span>
						<input
							type="text"
							value={props.model}
							disabled={props.busy}
							onInput={(event) => props.onModel(event.currentTarget.value)}
						/>
					</label>
					<label className="wide-field">
						<span>Topic</span>
						<input
							type="text"
							maxlength="80"
							placeholder="For example: deep-sea animals"
							value={props.topic}
							disabled={props.busy}
							onInput={(event) => props.onTopic(event.currentTarget.value)}
						/>
					</label>
					<div className="ai-prompt-toolbar">
						<div>
							<button
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
						<div className="ai-response-viewer" id={`ai-response-${props.kind}`}>
							<span>Raw model response</span>
							<pre>{props.response}</pre>
							<small>Shown exactly as received, before parsing and safety checks.</small>
						</div>
					) : null}
					{props.busy ? (
						<div className="ai-progress" aria-live="polite">
							<progress max="1" value={String(props.progress)} />
							<span>{props.status}</span>
						</div>
					) : props.status !== 'Ready' ? (
						<p className="ai-status" aria-live="polite">
							{props.status}
						</p>
					) : null}
					{props.error ? (
						<p className="ai-error" role="alert">
							{props.error}
						</p>
					) : null}
					<div className="ai-actions">
						<button
							type="button"
							className="secondary-button"
							disabled={
								!props.apiKeyStored ||
								props.busy ||
								!props.topic.trim() ||
								!props.promptTemplate.trim()
							}
							onClick={props.onGenerate}
						>
							Generate with OpenAI
						</button>
						{props.busy ? (
							<button type="button" className="text-button" onClick={props.onCancel}>
								Cancel
							</button>
						) : null}
					</div>
				</div>
			) : null}
		</div>
	);
}
