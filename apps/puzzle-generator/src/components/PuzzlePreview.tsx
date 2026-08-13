import { svgDataUrl } from '../svg.js';
import type { PuzzleDocuments } from '../types.js';
import type { PuzzleKind } from '../types.js';
import { BulkExportControls } from './BulkExportControls.jsx';

type PuzzlePreviewProps = {
	documents: PuzzleDocuments;
	solution: boolean;
	status: string;
	error?: string;
	onSolution(solution: boolean): void;
	onDownload(solution: boolean): void;
	bulkCount: number;
	bulkPlanText: string;
	bulkVerified: boolean;
	bulkBusy: boolean;
	bulkCompleted: number;
	bulkStatus: string;
	bulkError?: string;
	kind: PuzzleKind;
	bulkCanUseOpenAi: boolean;
	onBulkCount(count: number): void;
	onBulkPlanText(source: string): void;
	onBulkManualDraft(): void;
	onBulkOpenAiDraft(): void;
	onBulkVerify(): void;
	onBulkGenerate(): void;
	onBulkCancel(): void;
};

/** Shows the generated artifact and exposes separate puzzle/solution downloads. */
export function PuzzlePreview(props: PuzzlePreviewProps) {
	return () => (
		<section className="preview-panel" aria-labelledby="preview-heading">
			<div className="preview-toolbar">
				<div>
					<span className="eyebrow">Live proof</span>
					<h2 id="preview-heading">Print preview</h2>
				</div>
				<div className="view-switch" role="group" aria-label="Preview document">
					<button
						type="button"
						className:active={!props.solution}
						onClick={() => props.onSolution(false)}
					>
						Puzzle
					</button>
					<button
						type="button"
						className:active={props.solution}
						onClick={() => props.onSolution(true)}
					>
						Solution
					</button>
				</div>
			</div>

			<div className="paper-stage">
				<img
					src={svgDataUrl(props.solution ? props.documents.solutionSvg : props.documents.puzzleSvg)}
					alt={props.solution ? 'Generated puzzle solution' : 'Generated printable puzzle'}
				/>
			</div>

			<div className="artifact-info" aria-live="polite">
				<div>
					<strong>{props.status}</strong>
					{props.error ? (
						<p className="generation-error" role="alert">
							{props.error}
						</p>
					) : null}
					<span>{props.documents.summary}</span>
					{props.documents.warning ? <small>{props.documents.warning}</small> : null}
				</div>
				<div className="download-actions">
					<button
						type="button"
						className="secondary-button"
						onClick={() => props.onDownload(false)}
					>
						Puzzle SVG
					</button>
					<button type="button" className="download-button" onClick={() => props.onDownload(true)}>
						Solution SVG ↓
					</button>
				</div>
			</div>

			<BulkExportControls
				kind={props.kind}
				count={props.bulkCount}
				planText={props.bulkPlanText}
				verified={props.bulkVerified}
				busy={props.bulkBusy}
				completed={props.bulkCompleted}
				status={props.bulkStatus}
				error={props.bulkError}
				canUseOpenAi={props.bulkCanUseOpenAi}
				onCount={props.onBulkCount}
				onPlanText={props.onBulkPlanText}
				onManualDraft={props.onBulkManualDraft}
				onOpenAiDraft={props.onBulkOpenAiDraft}
				onVerify={props.onBulkVerify}
				onGenerate={props.onBulkGenerate}
				onCancel={props.onBulkCancel}
			/>
		</section>
	);
}
