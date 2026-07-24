type LogoOp =
	| 'forward'
	| 'back'
	| 'left'
	| 'right'
	| 'penup'
	| 'pendown'
	| 'home'
	| 'clear'
	| 'color';
export type LogoInstruction = {
	/** @exact key */
	id: string;
	op: LogoOp;
	argument?: number | string;
	line: number;
};

export type Segment = {
	/** @exact key */
	id: string;
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	color: string;
};

export type LogoDrawingState = {
	cursor: number;
	x: number;
	y: number;
	heading: number;
	penDown: boolean;
	color: string;
	segments: Segment[];
};

type Lexeme = { text: string; line: number; kind: 'word' | 'number' | 'open' | 'close' };

const allowedColors = new Set(['teal', 'amber', 'violet', 'coral']);

/** @exact client */
export function executeInstruction(state: LogoDrawingState, instruction: LogoInstruction): void {
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

function move(state: LogoDrawingState, amount: number): void {
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

/** @exact client */
export function parseLogo(source: string): LogoInstruction[] {
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
				if (lexemes[cursor]?.kind !== 'open')
					throw new Error(`REPEAT on line ${current.line} needs a [ block ].`);
				cursor++;
				const nested = parseBlock(depth + 1, true);
				for (let repetition = 0; repetition < count; repetition++) {
					for (const instruction of nested) {
						if (++generated > 2500)
							throw new Error('This program expands beyond the 2,500 command safety limit.');
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

function readNumber(lexemes: Lexeme[], index: number, line: number): number {
	const value = lexemes[index];
	if (!value || value.kind !== 'number')
		throw new Error(`The command on line ${line} needs a number.`);
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
			const kind: Lexeme['kind'] =
				text === '[' ? 'open' : text === ']' ? 'close' : /^-?\d/.test(text) ? 'number' : 'word';
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

/** @exact client */
export function normalizeHeading(value: number): number {
	return ((value % 360) + 360) % 360;
}
