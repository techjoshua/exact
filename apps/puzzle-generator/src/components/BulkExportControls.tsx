import { BULK_COUNT_LIMIT } from '../bulk-export.js';
import type { PuzzleKind } from '../types.js';

type BulkExportControlsProps = {
	kind: PuzzleKind;
	count: number;
	planText: string;
	verified: boolean;
	busy: boolean;
	completed: number;
	status: string;
	error?: string;
	canUseOpenAi: boolean;
	onCount(count: number): void;
	onPlanText(source: string): void;
	onManualDraft(): void;
	onOpenAiDraft(): void;
	onVerify(): void;
	onGenerate(): void;
	onCancel(): void;
};

/** Owns no content, but exposes the complete draft-review-verify-export edition workflow. */
export function BulkExportControls(props: BulkExportControlsProps) {
	return () => (
		<div className="bulk-export" aria-busy={props.busy ? 'true' : 'false'}>
			<div>
				<strong>Bulk puzzle edition</strong>
				<span>Each puzzle has its own title and source material; page and type styling are shared.</span>
			</div>
			<div className="bulk-export-actions">
				<label>
					<span>Quantity</span>
					<input type="number" min="1" max={BULK_COUNT_LIMIT} value={props.count} disabled={props.busy} onInput={(event) => props.onCount(Number(event.currentTarget.value))} />
				</label>
				<button type="button" className="secondary-button" disabled={props.busy} onClick={props.onManualDraft}>
					Manual draft
				</button>
				{props.kind !== 'sudoku' ? (
					<button type="button" className="secondary-button" disabled={props.busy || !props.canUseOpenAi} onClick={props.onOpenAiDraft}>
						Draft with OpenAI
					</button>
				) : null}
			</div>
			{props.kind !== 'sudoku' && !props.canUseOpenAi ? (
				<small className="bulk-help">OpenAI drafting uses the saved API key, model, and topic in the authoring controls.</small>
			) : null}
			{props.planText ? (
				<>
					<label className="bulk-plan-editor">
						<span>Edition plan</span>
						<textarea rows={16} value={props.planText} disabled={props.busy} spellcheck="false" onInput={(event) => props.onPlanText(event.currentTarget.value)} />
						<small>Begin every puzzle with “# Title” and separate puzzles with a line containing only “---”. Add words below word-search titles and “ANSWER - clue” lines below crossword titles.</small>
					</label>
					<div className="bulk-final-actions">
						<button type="button" className="secondary-button" disabled={props.busy} onClick={props.onVerify}>Verify edition</button>
						<button type="button" className="download-button" disabled={props.busy || !props.verified} onClick={props.onGenerate}>Download verified ZIP ↓</button>
						{props.busy ? <button type="button" className="text-button" onClick={props.onCancel}>Cancel</button> : null}
					</div>
				</>
			) : null}
			{props.busy ? (
				<div className="bulk-progress" aria-live="polite"><progress max={props.count} value={props.completed} /><span>{props.status}</span></div>
			) : (
				<span className:verified={props.verified} className="bulk-status" aria-live="polite">{props.status}</span>
			)}
			{props.error ? <p className="generation-error" role="alert">{props.error}</p> : null}
		</div>
	);
}
