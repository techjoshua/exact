import type { Component } from '@exact/core';
import { CodeBlock } from './CodeBlock.jsx';

type LogoOp = 'forward' | 'back' | 'left' | 'right' | 'penup' | 'pendown' | 'home' | 'clear' | 'color';
type LogoInstruction = {
	/** @exact key */
	id: string;
	op: LogoOp;
	argument?: number | string;
	line: number;
};

type Segment = {
	/** @exact key */
	id: string;
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	color: string;
};

type LogoState = {
	source: string;
	instructions: LogoInstruction[];
	cursor: number;
	x: number;
	y: number;
	heading: number;
	penDown: boolean;
	color: string;
	segments: Segment[];
	running: boolean;
	error: string | undefined;
	preset: string;
};

type Lexeme = { text: string; line: number; kind: 'word' | 'number' | 'open' | 'close' };

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

const allowedColors = new Set(['teal', 'amber', 'violet', 'coral']);

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

	this.onMount(({ signal }) => {
		compile();
		const interval = window.setInterval(() => {
			if (this.state.running) step();
		}, 90);
		signal.addEventListener('abort', () => window.clearInterval(interval), { once: true });
	});

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
							value={this.state.preset}
							onChange={(event: Event) => {
								const value = (event.currentTarget as HTMLSelectElement).value;
								this.state.preset = value;
								this.state.source = presets[value]!;
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
							value={this.state.source}
							onInput={(event: Event) => {
								this.state.source = (event.currentTarget as HTMLTextAreaElement).value;
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
						<svg viewBox="-220 -180 440 360" role="img" aria-labelledby="turtle-title turtle-description">
							<title id="turtle-title">Logo turtle drawing</title>
							<desc id="turtle-description">
								{this.state.segments.length} drawn segments. Turtle at {Math.round(this.state.x)},{' '}
								{Math.round(this.state.y)} heading {Math.round(normalizeHeading(this.state.heading))} degrees.
							</desc>
							<g className="stage-grid" aria-hidden="true">
								<line x1="-220" y1="0" x2="220" y2="0" />
								<line x1="0" y1="-180" x2="0" y2="180" />
							</g>
							<g className="turtle-path">
								{this.state.segments.map((segment) => (
									<line
										className={`turtle-segment color-${segment.color}`}
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
								command <strong>{this.state.cursor}/{this.state.instructions.length}</strong>
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
					<p className="logo-help">Commands are case-insensitive. Try FORWARD, RIGHT, LEFT, REPEAT, PENUP, PENDOWN, HOME, CLEAR, or COLOR.</p>
				)}
			</section>
		);
	};
}

function executeInstruction(state: LogoState, instruction: LogoInstruction): void {
	const amount = typeof instruction.argument === 'number' ? instruction.argument : 0;
	switch (instruction.op) {
		case 'forward':
			move(state, amount);
			break;
		case 'back':
			move(state, -amount);
			break;
		case 'left':
			state.heading -= amount;
			break;
		case 'right':
			state.heading += amount;
			break;
		case 'penup':
			state.penDown = false;
			break;
		case 'pendown':
			state.penDown = true;
			break;
		case 'home':
			state.x = 0;
			state.y = 0;
			state.heading = -90;
			break;
		case 'clear':
			state.segments = [];
			break;
		case 'color':
			state.color = String(instruction.argument);
			break;
	}
}

function move(state: LogoState, amount: number): void {
	const radians = (state.heading * Math.PI) / 180;
	const nextX = state.x + Math.cos(radians) * amount;
	const nextY = state.y + Math.sin(radians) * amount;
	if (state.penDown) {
		state.segments.push({
			id: `segment-${state.cursor}-${state.segments.length}`,
			x1: state.x,
			y1: state.y,
			x2: nextX,
			y2: nextY,
			color: state.color
		});
	}
	state.x = nextX;
	state.y = nextY;
}

function parseLogo(source: string): LogoInstruction[] {
	if (source.length > 12_000) throw new Error('Programs are limited to 12,000 characters.');
	const lexemes = lexLogo(source);
	let cursor = 0;
	let generated = 0;

	const parseBlock = (depth: number, expectClose: boolean): LogoInstruction[] => {
		if (depth > 12) throw new Error('REPEAT blocks may be nested up to 12 levels.');
		const instructions: LogoInstruction[] = [];
		while (cursor < lexemes.length) {
			const current = lexemes[cursor]!;
			if (current.kind === 'close') {
				if (!expectClose) throw new Error(`Unexpected ] on line ${current.line}.`);
				cursor++;
				return instructions;
			}
			if (current.kind !== 'word') throw new Error(`Expected a command on line ${current.line}.`);
			cursor++;
			const command = current.text.toUpperCase();
			if (command === 'REPEAT') {
				const count = readNumber(lexemes, cursor, current.line);
				cursor++;
				if (!Number.isInteger(count) || count < 0 || count > 250)
					throw new Error(`REPEAT on line ${current.line} needs a whole number from 0 to 250.`);
				if (lexemes[cursor]?.kind !== 'open') throw new Error(`REPEAT on line ${current.line} needs a [ block ].`);
				cursor++;
				const nested = parseBlock(depth + 1, true);
				for (let repetition = 0; repetition < count; repetition++) {
					for (const instruction of nested) {
						if (++generated > 2500) throw new Error('This program expands beyond the 2,500 command safety limit.');
						instructions.push({ ...instruction, id: `instruction-${generated}` });
					}
				}
				continue;
			}
			const op = normalizeCommand(command, current.line);
			let argument: number | string | undefined;
			if (op === 'forward' || op === 'back' || op === 'left' || op === 'right') {
				argument = readNumber(lexemes, cursor, current.line);
				cursor++;
			} else if (op === 'color') {
				const color = lexemes[cursor];
				if (!color || color.kind !== 'word' || !allowedColors.has(color.text.toLowerCase()))
					throw new Error(`COLOR on line ${current.line} accepts teal, amber, violet, or coral.`);
				argument = color.text.toLowerCase();
				cursor++;
			}
			if (++generated > 2500) throw new Error('Programs are limited to 2,500 executed commands.');
			instructions.push({ id: `instruction-${generated}`, op, argument, line: current.line });
		}
		if (expectClose) throw new Error('A REPEAT block is missing its closing ].');
		return instructions;
	};

	return parseBlock(0, false);
}

function readNumber(
	lexemes: Lexeme[],
	index: number,
	line: number
): number {
	const value = lexemes[index];
	if (!value || value.kind !== 'number') throw new Error(`The command on line ${line} needs a number.`);
	const number = Number(value.text);
	if (!Number.isFinite(number) || Math.abs(number) > 2000)
		throw new Error(`The number on line ${line} must be between -2000 and 2000.`);
	return number;
}

function lexLogo(source: string): Lexeme[] {
	const output: Lexeme[] = [];
	for (const [lineIndex, rawLine] of source.split('\n').entries()) {
		const line = rawLine.replace(/;.*/, '');
		const pieces = line.match(/\[|\]|-?\d+(?:\.\d+)?|[A-Za-z]+|\S/g) ?? [];
		for (const text of pieces) {
			const kind: Lexeme['kind'] = text === '[' ? 'open' : text === ']' ? 'close' : /^-?\d/.test(text) ? 'number' : 'word';
			output.push({ text, line: lineIndex + 1, kind });
		}
	}
	return output;
}

function normalizeCommand(command: string, line: number): LogoOp {
	const commands: Record<string, LogoOp> = {
		FORWARD: 'forward',
		FD: 'forward',
		BACK: 'back',
		BK: 'back',
		LEFT: 'left',
		LT: 'left',
		RIGHT: 'right',
		RT: 'right',
		PENUP: 'penup',
		PU: 'penup',
		PENDOWN: 'pendown',
		PD: 'pendown',
		HOME: 'home',
		CLEAR: 'clear',
		COLOR: 'color'
	};
	const result = commands[command];
	if (!result) throw new Error(`Unknown command ${command} on line ${line}.`);
	return result;
}

function normalizeHeading(value: number): number {
	return ((value % 360) + 360) % 360;
}
