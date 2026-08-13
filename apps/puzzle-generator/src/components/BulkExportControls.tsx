import { BULK_COUNT_LIMIT } from '../bulk-export.js';

type BulkExportControlsProps = {
	count: number;
	busy: boolean;
	completed: number;
	status: string;
	error?: string;
	onCount(count: number): void;
	onGenerate(): void;
	onCancel(): void;
};

/** Edits and reports one bulk archive operation without owning its generation lifecycle. */
export function BulkExportControls(props: BulkExportControlsProps) {
	return () => (
		<div className="bulk-export">
			<div>
				<strong>Bulk puzzle set</strong>
				<span>Current type and settings · distinct puzzles with paired answers</span>
			</div>
			<div className="bulk-export-actions">
				<label>
					<span>Quantity</span>
					<input
						type="number"
						min="1"
						max={BULK_COUNT_LIMIT}
						value={props.count}
						disabled={props.busy}
						onInput={(event) => props.onCount(Number(event.currentTarget.value))}
					/>
				</label>
				<button
					type="button"
					className="download-button"
					disabled={props.busy}
					onClick={props.onGenerate}
				>
					Download ZIP ↓
				</button>
				{props.busy ? (
					<button type="button" className="text-button" onClick={props.onCancel}>
						Cancel
					</button>
				) : null}
			</div>
			{props.busy ? (
				<div className="bulk-progress" aria-live="polite">
					<progress max={props.count} value={props.completed} />
					<span>{props.status}</span>
				</div>
			) : (
				<span className="bulk-status" aria-live="polite">
					{props.status}
				</span>
			)}
			{props.error ? (
				<p className="generation-error" role="alert">
					{props.error}
				</p>
			) : null}
		</div>
	);
}
