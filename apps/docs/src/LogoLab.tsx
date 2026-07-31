import type { Component } from '@exactjs/core';
import { CodeBlock } from './CodeBlock.jsx';
import {
	executeInstruction,
	normalizeHeading,
	parseLogo,
	type LogoDrawingState,
	type LogoInstruction
} from './logo-language.js';

type LogoState = LogoDrawingState & {
	source: string;
	instructions: LogoInstruction[];
	running: boolean;
	error: string | undefined;
	preset: string;
};

const presets: Record<string, string> = {
	star: `; A five-pointed star
REPEAT 5 [
  FORWARD 150
  RIGHT 144
]`,
	squares: `; Squares turning into a rosette
REPEAT 18 [
  REPEAT 4 [ FORWARD 74 RIGHT 90 ]
  RIGHT 20
]`,
	spiral: `; A growing angular spiral
FORWARD 8 RIGHT 91
FORWARD 16 RIGHT 91
FORWARD 24 RIGHT 91
FORWARD 32 RIGHT 91
FORWARD 40 RIGHT 91
FORWARD 48 RIGHT 91
FORWARD 56 RIGHT 91
FORWARD 64 RIGHT 91
FORWARD 72 RIGHT 91
FORWARD 80 RIGHT 91
FORWARD 88 RIGHT 91
FORWARD 96 RIGHT 91`,
	constellation: `; Pen control creates separate marks
COLOR amber
REPEAT 6 [ FORWARD 42 RIGHT 60 ]
PENUP FORWARD 90 PENDOWN
COLOR teal
REPEAT 5 [ FORWARD 52 RIGHT 144 ]`
};

/** Runs the bounded Logo interpreter and renders its reactive editor and SVG output. */
export function LogoLab(this: Component<LogoState>) {
	this.state.source = presets.star!;
	this.state.instructions = [];
	this.state.cursor = 0;
	this.state.x = 0;
	this.state.y = 0;
	this.state.heading = -90;
	this.state.penDown = true;
	this.state.color = 'teal';
	this.state.segments = [];
	this.state.running = false;
	this.state.error = undefined;
	this.state.preset = 'star';

	const resetTurtle = () => {
		this.state.cursor = 0;
		this.state.x = 0;
		this.state.y = 0;
		this.state.heading = -90;
		this.state.penDown = true;
		this.state.color = 'teal';
		this.state.segments = [];
		this.state.running = false;
	};

	const compile = () => {
		try {
			this.state.instructions = parseLogo(this.state.source);
			this.state.error = undefined;
			resetTurtle();
			return true;
		} catch (error) {
			this.state.instructions = [];
			this.state.error = error instanceof Error ? error.message : String(error);
			this.state.running = false;
			return false;
		}
	};

	const step = () => {
		if (this.state.cursor >= this.state.instructions.length) {
			this.state.running = false;
			return;
		}
		const instruction = this.state.instructions[this.state.cursor]!;
		this.state.cursor++;
		executeInstruction(this.state, instruction);
		if (this.state.cursor >= this.state.instructions.length) this.state.running = false;
	};

	this.onMount(() => {
		compile();
	});
	const advanceLogo = () => {
		window.setInterval(() => {
			if (this.state.running) step();
		}, 90);
	};
	advanceLogo();

	const run = () => {
		if (!this.state.instructions.length && !compile()) return;
		if (this.state.cursor >= this.state.instructions.length) resetTurtle();
		this.state.running = true;
	};

	const reset = () => {
		resetTurtle();
		compile();
	};

	return () => {
		const progress = this.state.instructions.length
			? Math.round((this.state.cursor / this.state.instructions.length) * 100)
			: 0;
		return (
			<section className="logo-lab" aria-label="Logo turtle interpreter">
				<div className="logo-toolbar">
					<label>
						Preset
						<select
							value:change={this.state.preset}
							onChange={() => {
								this.state.source = presets[this.state.preset]!;
								compile();
							}}
						>
							<option value="star">Star</option>
							<option value="squares">Turning squares</option>
							<option value="spiral">Spiral</option>
							<option value="constellation">Constellation</option>
						</select>
					</label>
					<div className="button-row">
						<button type="button" onClick={run} disabled={this.state.running}>
							Run
						</button>
						<button
							type="button"
							onClick={() => {
								this.state.running = false;
							}}
							disabled={!this.state.running}
						>
							Pause
						</button>
						<button type="button" onClick={step} disabled={this.state.running}>
							Step
						</button>
						<button type="button" onClick={reset}>
							Reset
						</button>
					</div>
				</div>

				<div className="logo-workspace">
					<div className="logo-editor-panel">
						<label for="logo-source">Program</label>
						<textarea
							id="logo-source"
							spellcheck="false"
							value:input={this.state.source}
							onInput={() => {
								this.state.preset = '';
								compile();
							}}
						/>
						<details className="logo-highlight">
							<summary>Highlighted program</summary>
							<CodeBlock source={this.state.source} language="logo" title="turtle.logo" compact />
						</details>
					</div>

					<div className="turtle-stage">
						<svg
							viewBox="-220 -180 440 360"
							role="img"
							aria-labelledby="turtle-title turtle-description"
						>
							<title id="turtle-title">Logo turtle drawing</title>
							<desc id="turtle-description">
								{this.state.segments.length} drawn segments. Turtle at {Math.round(this.state.x)},{' '}
								{Math.round(this.state.y)} heading{' '}
								{Math.round(normalizeHeading(this.state.heading))} degrees.
							</desc>
							<g className="stage-grid" aria-hidden="true">
								<line x1="-220" y1="0" x2="220" y2="0" />
								<line x1="0" y1="-180" x2="0" y2="180" />
							</g>
							<g className="turtle-path">
								{this.state.segments.map((segment) => (
									<line
										className={['turtle-segment', `color-${segment.color}`]}
										x1={segment.x1}
										y1={segment.y1}
										x2={segment.x2}
										y2={segment.y2}
									/>
								))}
							</g>
							<g
								className="turtle-cursor"
								transform={`translate(${this.state.x} ${this.state.y}) rotate(${this.state.heading + 90})`}
								aria-hidden="true"
							>
								<path d="M 0 -10 L 8 8 L 0 5 L -8 8 Z" />
							</g>
						</svg>
						<div className="turtle-inspector" aria-live="polite">
							<span>
								x <strong>{Math.round(this.state.x)}</strong>
							</span>
							<span>
								y <strong>{Math.round(this.state.y)}</strong>
							</span>
							<span>
								heading <strong>{Math.round(normalizeHeading(this.state.heading))}°</strong>
							</span>
							<span>
								command{' '}
								<strong>
									{this.state.cursor}/{this.state.instructions.length}
								</strong>
							</span>
							<span className="progress-track" aria-label={`${progress}% complete`}>
								<span style={{ width: `${progress}%` }} />
							</span>
						</div>
					</div>
				</div>
				{this.state.error ? (
					<p className="logo-error" role="alert">
						<strong>That turtle is puzzled.</strong> {this.state.error}
					</p>
				) : (
					<p className="logo-help">
						Commands are case-insensitive. Try FORWARD, RIGHT, LEFT, REPEAT, PENUP, PENDOWN, HOME,
						CLEAR, or COLOR.
					</p>
				)}
			</section>
		);
	};
}
