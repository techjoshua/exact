import type { PuzzleKind, PuzzleStyle } from '../types.js';

type StyleControlsProps = {
	kind: PuzzleKind;
	style: PuzzleStyle;
	onStyle(style: PuzzleStyle): void;
};

/** Renders common export-format settings shared by every generator. */
export function StyleControls(props: StyleControlsProps) {
	const change = <K extends keyof PuzzleStyle>(key: K, value: PuzzleStyle[K]) => {
		props.onStyle({ ...props.style, [key]: value });
	};
	return () => (
		<section className="control-section style-section" aria-labelledby="style-heading">
			<div className="section-heading">
				<span>02</span>
				<div>
					<h2 id="style-heading">Set the edition</h2>
					<p>One visual system for the puzzle and answer key.</p>
				</div>
			</div>
			<div className="field-grid title-fields">
				<label>
					<span>Printed title · optional</span>
					<input
						type="text"
						maxlength="80"
						placeholder="No title"
						value={props.style.title}
						onInput={(event) => change('title', event.currentTarget.value)}
					/>
				</label>
				<label>
					<span>Title alignment</span>
					<select
						value={props.style.titleAlignment}
						onChange={(event) =>
							change('titleAlignment', event.currentTarget.value as PuzzleStyle['titleAlignment'])
						}
					>
						<option value="left">Left</option>
						<option value="center">Center</option>
						<option value="right">Right</option>
					</select>
				</label>
			</div>
			<div className="field-grid">
				<label>
					<span>Typeface</span>
					<select
						value={props.style.fontFamily}
						onChange={(event) =>
							change('fontFamily', event.currentTarget.value as PuzzleStyle['fontFamily'])
						}
					>
						<option value="sans">Modern sans</option>
						<option value="serif">Classic serif</option>
						<option value="mono">Editorial mono</option>
						<option value="handwritten">Handwritten print</option>
						<option value="playful">Playful rounded</option>
					</select>
				</label>
				<label>
					<span>Type size · {props.style.fontSize}px</span>
					<input
						type="range"
						min="14"
						max="28"
						value={String(props.style.fontSize)}
						onInput={(event) => change('fontSize', Number(event.currentTarget.value))}
					/>
				</label>
				<label>
					<span>Line weight · {props.style.lineWidth}px</span>
					<input
						type="range"
						min="1"
						max="4"
						step="0.5"
						value={String(props.style.lineWidth)}
						onInput={(event) => change('lineWidth', Number(event.currentTarget.value))}
					/>
				</label>
			</div>
			<div className="color-grid">
				<label>
					<span>Ink</span>
					<input
						type="color"
						value={props.style.ink}
						onInput={(event) => change('ink', event.currentTarget.value)}
					/>
				</label>
				<label>
					<span>Answer accent</span>
					<input
						type="color"
						value={props.style.accent}
						onInput={(event) => change('accent', event.currentTarget.value)}
					/>
				</label>
				<label>
					<span>Paper</span>
					<input
						type="color"
						value={props.style.paper}
						onInput={(event) => change('paper', event.currentTarget.value)}
					/>
				</label>
			</div>

			<label className="check-field">
				<input
					type="checkbox"
					checked={props.style.monochromeSolution}
					onChange={(event) => change('monochromeSolution', event.currentTarget.checked)}
				/>
				<span>Black-and-white solution</span>
			</label>

			{props.kind === 'sudoku' ? (
				<div className="option-box">
					<strong>Answer digits</strong>
					<div className="field-grid">
						<label>
							<span>Solution typeface</span>
							<select
								value={props.style.sudokuSolutionFont}
								onChange={(event) =>
									change(
										'sudokuSolutionFont',
										event.currentTarget.value as PuzzleStyle['sudokuSolutionFont']
									)
								}
							>
								<option value="inherit">Match puzzle</option>
								<option value="sans">Modern sans</option>
								<option value="serif">Classic serif</option>
								<option value="mono">Editorial mono</option>
								<option value="handwritten">Handwritten print</option>
								<option value="playful">Playful rounded</option>
							</select>
						</label>
						<label className="check-field compact-check">
							<input
								type="checkbox"
								checked={props.style.sudokuSolutionBold}
								onChange={(event) => change('sudokuSolutionBold', event.currentTarget.checked)}
							/>
							<span>Bold solution values</span>
						</label>
					</div>
				</div>
			) : null}

			{props.kind === 'crossword' ? (
				<div className="option-box">
					<strong>Crossword grid</strong>
					<div className="color-grid crossword-colors">
						<label>
							<span>Grid lines</span>
							<input
								type="color"
								value={props.style.crosswordGrid}
								onInput={(event) => change('crosswordGrid', event.currentTarget.value)}
							/>
						</label>
						<label>
							<span>Unused background</span>
							<input
								type="color"
								value={props.style.crosswordBlocks}
								onInput={(event) => change('crosswordBlocks', event.currentTarget.value)}
							/>
						</label>
					</div>
					<label className="check-field">
						<input
							type="checkbox"
							checked={props.style.crosswordWordList}
							onChange={(event) => change('crosswordWordList', event.currentTarget.checked)}
						/>
						<span>Include word list</span>
					</label>
				</div>
			) : null}
		</section>
	);
}
