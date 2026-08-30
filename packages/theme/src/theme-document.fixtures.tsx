import { ThemeScopeEnhancement } from './components.js';

function ThemeDocument(props: { text: string }) {
	return () => (
		<ThemeScopeEnhancement scope tonic="teal" appearance="light">
			<div>
				<p>{props.text}</p>
			</div>
		</ThemeScopeEnhancement>
	);
}

/** Same-source fixture compiled independently for the client and server targets. */
export const themeDocumentRoot = (text: string) => <ThemeDocument text={text} />;
