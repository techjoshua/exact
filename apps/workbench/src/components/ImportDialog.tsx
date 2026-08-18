import { createRef, type Component } from '@exactjs/core';
import { WorkbenchContext } from '../context.js';

type ImportDialogProps = {
	value: string;
	error?: string;
};

/** Renders the workbench JSON import dialog. */
export function ImportDialog(this: Component<{}>, props: ImportDialogProps) {
	const workbench = this.getContext(WorkbenchContext);
	const importRef = createRef<HTMLTextAreaElement>('import-json');

	this.onMount(() => {
		this.refs.get(importRef)?.focus();
	});

	return () => (
		<div className="dialog-backdrop" onClick={() => workbench.closeImport()}>
			<section
				theme:surface="overlay"
				className="import-dialog"
				role="dialog"
				aria-modal="true"
				aria-label="Import and export tasks"
				onClick={(event) => event.stopPropagation()}
			>
				<header>
					<div>
						<h2>Import / Export Tasks</h2>
						<p>Paste a task JSON array, or use the current text as an export snapshot.</p>
					</div>
					<button theme:action="quiet" type="button" onClick={() => workbench.closeImport()}>
						Close
					</button>
				</header>

				<textarea
					theme:field="default"
					ref={this.ref(importRef)}
					rows={16}
					value={props.value}
					onInput={(event) => workbench.setImportText(event.currentTarget.value)}
				/>

				{props.error ? (
					<p theme:status="danger" className="form-error">
						{props.error}
					</p>
				) : null}

				<footer>
					<button theme:action="secondary" type="button" onClick={() => workbench.exportTasks()}>
						Refresh Export
					</button>
					<button theme:action="primary" type="button" onClick={() => workbench.importTasks()}>
						Import Tasks
					</button>
				</footer>
			</section>
		</div>
	);
}
