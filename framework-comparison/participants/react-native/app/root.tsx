import {
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
	type LinksFunction,
	type MetaFunction
} from 'react-router';
import sharedStyles from '../../react/src/styles.css?url';

/** Supplies the shared visual contract without sharing React UI generation. */
export const links: LinksFunction = () => [{ rel: 'stylesheet', href: sharedStyles }];

/** Describes the native React participant document. */
export const meta: MetaFunction = () => [
	{ title: 'Incident Operations' },
	{ name: 'framework-participant', content: 'react-native' }
];

/** Owns the React Router document shell. */
export default function Root() {
	return <Outlet />;
}

/** Emits the production HTML document around the active route tree. */
export function Layout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<Meta />
				<Links />
			</head>
			<body>
				{children}
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

/** Keeps route failures visible to correctness tests and human reviewers. */
export function ErrorBoundary({ error }: { error: unknown }) {
	return (
		<main>
			<h1>Signal Desk could not load</h1>
			<p role="alert">{error instanceof Error ? error.message : 'Unknown route failure'}</p>
		</main>
	);
}
