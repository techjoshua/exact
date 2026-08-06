import type { PuzzleStyle } from '../types.js';

type StyleControlsProps = {
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
			<label className="wide-field">
				<span>Printed title</span>
				<input
					type="text"
					maxlength="80"
					value={props.style.title}
					onInput={(event) => change('title', event.currentTarget.value)}
				/>
			</label>
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
		</section>
	);
}
