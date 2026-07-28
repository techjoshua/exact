import type { Component } from '@exactjs/core';
import { tokenize, type CodeLanguage } from './code-highlighting.js';

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
	const language = props.language ?? 'tsx';
	const lines = tokenize(props.source.trim(), language);
	const highlighted = new Set(props.highlightLines ?? []);
	let copiedTimer: number | undefined;
	let active = true;
	this.onUnmount(() => {
		active = false;
		window.clearTimeout(copiedTimer);
	});

	const copy = async () => {
		await navigator.clipboard.writeText(props.source.trim());
		if (!active) return;
		this.state.copied = true;
		window.clearTimeout(copiedTimer);
		copiedTimer = window.setTimeout(() => {
			this.state.copied = false;
		}, 1400);
	};

	return () => (
		<figure className={['code-block', props.compact && 'code-block--compact']}>
			<figcaption className="code-toolbar">
				<span>
					{props.title ?? 'Example'} <small>{language}</small>
				</span>
				<button className="copy-button" type="button" onClick={() => void copy()}>
					{this.state.copied ? 'Copied' : 'Copy'}
				</button>
			</figcaption>
			<pre tabindex="0" aria-label={`${props.title ?? 'Code'} in ${language}`}>
				<code>
					{lines.map((line) => (
						<span className={['code-line', highlighted.has(line.number) && 'is-highlighted']}>
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
