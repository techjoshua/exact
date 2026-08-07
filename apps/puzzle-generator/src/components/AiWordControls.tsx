import type { AiPuzzleKind } from '../ai-word-list-format.js';

type AiWordControlsProps = {
	kind: AiPuzzleKind;
	topic: string;
	supported: boolean;
	busy: boolean;
	progress: number;
	status: string;
	error?: string;
	modelReady: boolean;
	onTopic(topic: string): void;
	onGenerate(): void;
	onCancel(): void;
	onRemoveModel(): void;
};

/** Renders the explicit opt-in controls for browser-local word and clue generation. */
export function AiWordControls(props: AiWordControlsProps) {
	return () => (
		<div className="option-box ai-option" aria-busy={props.busy ? 'true' : 'false'}>
			<strong>Local AI helper</strong>
			<p>
				Generate {props.kind === 'crossword' ? 'answers and clues' : 'a word list'} from a topic.
				Your topic stays on this device.
			</p>
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
					disabled={!props.supported || props.busy || !props.topic.trim()}
					onClick={props.onGenerate}
				>
					Generate with local AI
				</button>
				{props.busy ? (
					<button type="button" className="text-button" onClick={props.onCancel}>
						Cancel
					</button>
				) : props.modelReady ? (
					<button type="button" className="text-button" onClick={props.onRemoveModel}>
						Remove model
					</button>
				) : null}
			</div>
			<small>
				{props.supported
					? 'First use downloads about 290 MB from Hugging Face and needs roughly 1 GB of GPU memory. The model is cached by this browser.'
					: 'Local AI is unavailable because this browser or device does not expose WebGPU.'}
			</small>
		</div>
	);
}
