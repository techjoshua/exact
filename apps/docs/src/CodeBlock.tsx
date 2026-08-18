import { TaskContext, type Component } from '@exactjs/core';
import { ThemeContext } from '@exactjs/theme';
import { tokenize, type CodeLanguage } from './code-highlighting.js';
import { deriveSyntaxPalette } from './syntax-theme.js';

type CodeBlockProps = {
	source: string;
	language?: CodeLanguage;
	title?: string;
	highlightLines?: number[];
	compact?: boolean;
};

type CodeBlockState = { copied: boolean };

/** Renders highlighted source with accessible line numbers and clipboard feedback. */
export function CodeBlock(this: Component<CodeBlockState>, props: CodeBlockProps) {
	this.state.copied = false;
	const theme = this.getContext(ThemeContext);
	const language = props.language ?? 'tsx';
	const lines = tokenize(props.source.trim(), language);
	const highlighted = new Set(props.highlightLines ?? []);

	const clearCopiedFeedback = (_task: TaskContext = TaskContext.latest()) => {
		setTimeout(() => {
			this.state.copied = false;
		}, 1400);
	};

	const copy = async () => {
		await navigator.clipboard.writeText(props.source.trim());
		this.state.copied = true;
		clearCopiedFeedback();
	};
	const syntaxStyle = () => {
		const light = deriveSyntaxPalette(theme.current, 'light'),
			dark = deriveSyntaxPalette(theme.current, 'dark'),
			adaptive = (lightColor: string, darkColor: string) =>
				`light-dark(${lightColor}, ${darkColor})`;
		return {
			backgroundColor: adaptive(light.surface, dark.surface),
			'--code-surface': adaptive(light.surface, dark.surface),
			'--code-surface-raised': adaptive(light.surfaceRaised, dark.surfaceRaised),
			'--code-text': adaptive(light.text, dark.text),
			'--code-muted': adaptive(light.muted, dark.muted),
			'--syntax-keyword': adaptive(light.keyword, dark.keyword),
			'--syntax-type': adaptive(light.type, dark.type),
			'--syntax-function': adaptive(light.function, dark.function),
			'--syntax-string': adaptive(light.string, dark.string),
			'--syntax-number': adaptive(light.number, dark.number),
			'--syntax-tag': adaptive(light.tag, dark.tag),
			'--syntax-property': adaptive(light.property, dark.property),
			'--syntax-command': adaptive(light.command, dark.command),
			'--syntax-bracket': adaptive(light.bracket, dark.bracket),
			'--syntax-comment': adaptive(light.comment, dark.comment),
			'--syntax-operator': adaptive(light.operator, dark.operator),
			'--syntax-invalid': adaptive(light.invalid, dark.invalid)
		};
	};

	return () => (
		<figure
			theme:surface="sunken"
			className="code-block"
			className:code-block--compact={props.compact}
		>
			<figcaption className="code-toolbar" style={theme.revision >= 0 ? syntaxStyle() : undefined}>
				<span>
					{props.title ?? 'Example'} <small>{language}</small>
				</span>
				<button
					theme:action="quiet"
					className="copy-button"
					style={theme.revision >= 0 ? { color: syntaxStyle()['--code-text'] } : undefined}
					type="button"
					onClick={() => void copy()}
				>
					{this.state.copied ? 'Copied' : 'Copy'}
				</button>
			</figcaption>
			<pre
				theme:text="code"
				style={theme.revision >= 0 ? syntaxStyle() : undefined}
				tabindex="0"
				aria-label={`${props.title ?? 'Code'} in ${language}`}
			>
				<code>
					{lines.map((line) => (
						<span className="code-line" className:is-highlighted={highlighted.has(line.number)}>
							<span className="line-number" aria-hidden="true">
								{line.number}
							</span>
							<span className="line-source">
								{line.tokens.map((token) => (
									<span className={['syntax', `syntax--${token.kind}`]}>{token.text}</span>
								))}
								{'\n'}
							</span>
						</span>
					))}
				</code>
			</pre>
			<span className="copy-status" aria-live="polite">
				{this.state.copied ? 'Code copied to clipboard.' : ''}
			</span>
		</figure>
	);
}
