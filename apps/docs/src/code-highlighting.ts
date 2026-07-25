/** Languages whose source tokens the documentation renderer can classify. */
export type CodeLanguage = 'tsx' | 'ts' | 'json' | 'css' | 'shell' | 'logo';

type TokenKind =
	| 'plain'
	| 'keyword'
	| 'type'
	| 'function'
	| 'string'
	| 'number'
	| 'comment'
	| 'operator'
	| 'tag'
	| 'property'
	| 'command'
	| 'bracket'
	| 'invalid';

type CodeToken = {
	/** @exact key */
	id: string;
	text: string;
	kind: TokenKind;
};

type CodeLine = {
	/** @exact key */
	id: string;
	number: number;
	tokens: CodeToken[];
};

const keywords = new Set([
	'async',
	'await',
	'break',
	'case',
	'catch',
	'class',
	'const',
	'continue',
	'declare',
	'default',
	'do',
	'else',
	'export',
	'extends',
	'false',
	'finally',
	'for',
	'from',
	'function',
	'get',
	'if',
	'import',
	'in',
	'instanceof',
	'interface',
	'let',
	'new',
	'null',
	'of',
	'return',
	'satisfies',
	'set',
	'static',
	'super',
	'switch',
	'this',
	'throw',
	'true',
	'try',
	'type',
	'typeof',
	'undefined',
	'using',
	'void',
	'while',
	'with',
	'yield'
]);

const typeWords = new Set([
	'AbortSignal',
	'Child',
	'Component',
	'ContextToken',
	'Error',
	'FormData',
	'Logger',
	'Promise',
	'ReactiveValue',
	'Record',
	'Request',
	'Response',
	'string',
	'number',
	'boolean',
	'unknown',
	'never'
]);

const logoCommands = new Set([
	'FORWARD',
	'FD',
	'BACK',
	'BK',
	'LEFT',
	'LT',
	'RIGHT',
	'RT',
	'PENUP',
	'PU',
	'PENDOWN',
	'PD',
	'HOME',
	'CLEAR',
	'REPEAT',
	'COLOR'
]);

/**
 * Tokenizes source into deterministic presentation spans without external state.
 *
 * @exact pure
 */
export function tokenize(source: string, language: CodeLanguage): CodeLine[] {
	return source.split('\n').map((line, lineIndex) => ({
		id: `line-${lineIndex}`,
		number: lineIndex + 1,
		tokens: tokenizeLine(line, language, lineIndex)
	}));
}

function tokenizeLine(line: string, language: CodeLanguage, lineIndex: number): CodeToken[] {
	if (language === 'logo') return tokenizeLogo(line, lineIndex);
	if (language === 'shell') return tokenizeShell(line, lineIndex);

	const tokens: CodeToken[] = [];
	const expression =
		/(\/\/.*|\/\*.*?\*\/|<!--[\s\S]*?-->|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|[A-Za-z_$][\w$]*|<\/?[A-Za-z][\w.-]*|\/?\>|=>|===|!==|==|!=|<=|>=|&&|\|\||\+\+|--|\*\*|[{}()[\].,:;?+\-*/%=<>!&|])/g;
	let cursor = 0;
	let match: RegExpExecArray | null;
	let tokenIndex = 0;
	while ((match = expression.exec(line))) {
		if (match.index > cursor) {
			tokens.push(token(line.slice(cursor, match.index), 'plain', lineIndex, tokenIndex++));
		}
		const text = match[0];
		let kind: TokenKind = 'operator';
		if (text.startsWith('//') || text.startsWith('/*') || text.startsWith('<!--')) kind = 'comment';
		else if (/^["'`]/.test(text)) kind = 'string';
		else if (/^\d/.test(text)) kind = 'number';
		else if (text.startsWith('<')) kind = 'tag';
		else if (keywords.has(text)) kind = 'keyword';
		else if (typeWords.has(text) || /^[A-Z]/.test(text)) kind = 'type';
		else if (/^[A-Za-z_$]/.test(text)) {
			const after = line.slice(expression.lastIndex);
			const before = line.slice(0, match.index);
			kind = /^\s*\(/.test(after)
				? 'function'
				: /[.{]\s*$/.test(before) || /^\s*:/.test(after)
					? 'property'
					: 'plain';
		}
		tokens.push(token(text, kind, lineIndex, tokenIndex++));
		cursor = expression.lastIndex;
	}
	if (cursor < line.length) tokens.push(token(line.slice(cursor), 'plain', lineIndex, tokenIndex));
	if (!tokens.length) tokens.push(token('', 'plain', lineIndex, 0));
	return tokens;
}

function tokenizeLogo(line: string, lineIndex: number): CodeToken[] {
	const parts = line.match(/;.*|\[|\]|-?\d+(?:\.\d+)?|[A-Za-z]+|\s+|\S/g) ?? [''];
	return parts.map((text, index) => {
		let kind: TokenKind = 'plain';
		if (text.startsWith(';')) kind = 'comment';
		else if (text === '[' || text === ']') kind = 'bracket';
		else if (/^-?\d/.test(text)) kind = 'number';
		else if (logoCommands.has(text.toUpperCase())) kind = 'command';
		else if (/^[A-Za-z]+$/.test(text)) kind = 'string';
		return token(text, kind, lineIndex, index);
	});
}

function tokenizeShell(line: string, lineIndex: number): CodeToken[] {
	const parts = line.match(
		/#.*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|--?[\w-]+|\b(?:npm|npx|node|git)\b|\s+|\S+/g
	) ?? [''];
	return parts.map((text, index) => {
		const kind: TokenKind = text.startsWith('#')
			? 'comment'
			: /^["']/.test(text)
				? 'string'
				: text.startsWith('-')
					? 'property'
					: /^(npm|npx|node|git)$/.test(text)
						? 'function'
						: 'plain';
		return token(text, kind, lineIndex, index);
	});
}

function token(text: string, kind: TokenKind, line: number, index: number): CodeToken {
	return { id: `${line}-${index}`, text, kind };
}
