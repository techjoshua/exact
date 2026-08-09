import { pageMarginPresets, resolvePageMargin } from '../page-layout.js';
import type { PageMarginPreset, PageSize, PuzzleKind, PuzzleStyle } from '../types.js';

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
	const changePageSize = (value: string) => {
		const pageSize: PageSize =
			value === 'a4' || value === 'legal' || value === 'custom' ? value : 'letter';
		change('pageSize', pageSize);
	};
	const changeMarginPreset = (value: string) => {
		const preset: PageMarginPreset =
			value === 'narrow' || value === 'wide' || value === 'custom' ? value : 'standard';
		props.onStyle({
			...props.style,
			pageMarginPreset: preset,
			pageMargin: preset === 'custom' ? props.style.pageMargin : pageMarginPresets[preset]
		});
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
					<span>Title typeface</span>
					<select
						value={props.style.titleFontFamily}
						onChange={(event) =>
							change('titleFontFamily', event.currentTarget.value as PuzzleStyle['titleFontFamily'])
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
					<span>Title size · {props.style.titleFontSize}px</span>
					<input
						type="range"
						min="16"
						max="96"
						value={String(props.style.titleFontSize)}
						onInput={(event) => change('titleFontSize', Number(event.currentTarget.value))}
					/>
				</label>
			</div>
			<div className="field-grid">
				<label>
					<span>Puzzle typeface</span>
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
					<span>Puzzle type size · {props.style.fontSize}px</span>
					<input
						type="range"
						min="14"
						max="64"
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
			{props.kind !== 'sudoku' ? (
				<div className="option-box">
					<strong>{props.kind === 'crossword' ? 'Crossword clues' : 'Word list'}</strong>
					<div className="field-grid">
						<label>
							<span>{props.kind === 'crossword' ? 'Clue typeface' : 'List typeface'}</span>
							<select
								value={props.style.supplementaryFontFamily}
								onChange={(event) =>
									change(
										'supplementaryFontFamily',
										event.currentTarget.value as PuzzleStyle['supplementaryFontFamily']
									)
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
							<span>
								{props.kind === 'crossword' ? 'Clue' : 'List'} size ·
								{props.style.supplementaryFontSize}px
							</span>
							<input
								type="range"
								min="8"
								max="48"
								value={String(props.style.supplementaryFontSize)}
								onInput={(event) =>
									change('supplementaryFontSize', Number(event.currentTarget.value))
								}
							/>
						</label>
					</div>
				</div>
			) : null}
			<div className="option-box">
				<strong>Page</strong>
				<div className="field-grid">
					<label>
						<span>Page size</span>
						<select
							value={props.style.pageSize || 'letter'}
							onChange={(event) => changePageSize(event.currentTarget.value)}
						>
							<option value="letter">US Letter · 8.5 × 11 in</option>
							<option value="a4">A4 · 210 × 297 mm</option>
							<option value="legal">US Legal · 8.5 × 14 in</option>
							<option value="custom">Custom size</option>
						</select>
					</label>
					<label>
						<span>Margins · {resolvePageMargin(props.style).toFixed(2)} in</span>
						<select
							value={props.style.pageMarginPreset}
							onChange={(event) => changeMarginPreset(event.currentTarget.value)}
						>
							<option value="narrow">Narrow · 0.25 in</option>
							<option value="standard">Standard · 0.5 in</option>
							<option value="wide">Wide · 1 in</option>
							<option value="custom">Custom margin</option>
						</select>
					</label>
				</div>
				{props.style.pageSize === 'custom' ? (
					<div className="field-grid custom-layout-fields">
						<label>
							<span>Page width · inches</span>
							<input
								type="number"
								min="1"
								max="48"
								step="0.01"
								value={String(props.style.customPageWidth)}
								onChange={(event) =>
									change('customPageWidth', numberOrFallback(event.currentTarget.value, 8.5))
								}
							/>
						</label>
						<label>
							<span>Page height · inches</span>
							<input
								type="number"
								min="1"
								max="48"
								step="0.01"
								value={String(props.style.customPageHeight)}
								onChange={(event) =>
									change('customPageHeight', numberOrFallback(event.currentTarget.value, 11))
								}
							/>
						</label>
					</div>
				) : null}
				{props.style.pageMarginPreset === 'custom' ? (
					<div className="field-grid custom-layout-fields">
						<label>
							<span>Custom margin · inches</span>
							<input
								type="number"
								min="0"
								max="24"
								step="0.01"
								value={String(props.style.pageMargin)}
								onChange={(event) =>
									change('pageMargin', numberOrFallback(event.currentTarget.value, 0.5))
								}
							/>
						</label>
					</div>
				) : null}
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
					<span>{props.kind === 'crossword' ? 'Puzzle background' : 'Paper'}</span>
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
					<small className="option-note">
						The puzzle background applies only to letter cells; the page remains white.
					</small>
				</div>
			) : null}
		</section>
	);
}

function numberOrFallback(value: string, fallback: number): number {
	if (!value.trim()) return fallback;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}
