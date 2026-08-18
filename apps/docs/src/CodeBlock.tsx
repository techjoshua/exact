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
	const syntax = this.reactive(() => deriveSyntaxPalette(theme.current, 'follow'));
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
		const current = syntax.get();
		return {
			backgroundColor: current.surface,
			'--code-surface': current.surface,
			'--code-surface-raised': current.surfaceRaised,
			'--code-text': current.text,
			'--code-muted': current.muted,
			'--syntax-keyword': current.keyword,
			'--syntax-type': current.type,
			'--syntax-function': current.function,
			'--syntax-string': current.string,
			'--syntax-number': current.number,
			'--syntax-tag': current.tag,
			'--syntax-property': current.property,
			'--syntax-command': current.command,
			'--syntax-bracket': current.bracket,
			'--syntax-comment': current.comment,
			'--syntax-operator': current.operator,
			'--syntax-invalid': current.invalid
		};
	};

	return () => (
		<figure
			theme:surface="sunken"
			className="code-block"
			className:code-block--compact={props.compact}
		>
			<figcaption className="code-toolbar" style={syntaxStyle()}>
				<span>
					{props.title ?? 'Example'} <small>{language}</small>
				</span>
				<button
					theme:action="quiet"
					className="copy-button"
					style={{ color: syntaxStyle()['--code-text'] }}
					type="button"
					onClick={() => void copy()}
				>
					{this.state.copied ? 'Copied' : 'Copy'}
				</button>
			</figcaption>
			<pre
				theme:text="code"
				style={syntaxStyle()}
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
