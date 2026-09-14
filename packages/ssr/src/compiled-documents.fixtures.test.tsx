/** Incomplete document whose body retains ordinary component compilation. */
export function BodyOnlyDocument() {
	return () => (
		<html>
			<body>
				<main>Body only</main>
			</body>
		</html>
	);
}

/** Loose compiled intrinsic content requires the framework-provided head and body. */
export function LooseDocument() {
	return () => (
		<html>
			<main>Loose content</main>
		</html>
	);
}

/** Runtime normalization orders an authored body before an authored head. */
export function ReorderedDocument() {
	return () => (
		<html>
			<body>
				<main>Content</main>
			</body>
			<head>
				<title>Reordered</title>
			</head>
		</html>
	);
}

/** Ambiguous authored body and loose intrinsic content must remain rejected. */
export function AmbiguousDocument() {
	return () => (
		<html>
			<body>Body</body>
			<main>Loose</main>
		</html>
	);
}

/** A second authored head must remain rejected after compilation. */
export function DuplicateHeadDocument() {
	return () => (
		<html>
			<head>
				<title>First</title>
			</head>
			<head>
				<title>Second</title>
			</head>
			<body>Body</body>
		</html>
	);
}

/** Regular component whose root is a document. */
export function InnerDocument() {
	return () => (
		<html>
			<head>
				<title>Nested</title>
			</head>
			<body>Body</body>
		</html>
	);
}

/** A compiled ordinary intrinsic cannot conceal an invalid nested document. */
export function NestedDocument() {
	return () => (
		<main>
			<InnerDocument />
		</main>
	);
}

/** Dynamic metadata and assets share ordinary document component props. */
export function AssetDocument(props: { title: string; sources: string[] }) {
	return () => (
		<html lang="en">
			<head>
				<meta charSet="UTF-8" />
				<title>{props.title}</title>
				{props.sources.map((src) => (
					<script type="module" src={src} />
				))}
				<link rel="stylesheet" href="/app.css" />
			</head>
			<body>
				<main>{props.title}</main>
			</body>
		</html>
	);
}

/** Literal native URLs and dynamic inputs must retain the same server URL policy. */
export function LiteralUrlDocument(props: { href: string }) {
	return () => (
		<html>
			<head>
				<title>Literal URLs</title>
				<link rel="stylesheet" href="/app.css" />
			</head>
			<body>
				<a href="/guide?first=1&second=2">Guide</a>
				<img src="https://example.test/icon.svg" />
				<a href={props.href}>Dynamic</a>
				<a href="javascript:alert(1)">Blocked</a>
			</body>
		</html>
	);
}

/** A spread overriding a literal URL still owns the final attribute value. */
export function LiteralUrlSpread(props: { href?: string }) {
	return () => (
		<main>
			<a href="/fallback" {...props}>
				Link
			</a>
			<a {...props} href="/fixed">
				Fixed
			</a>
		</main>
	);
}

/** Static document scripts retain adoption identity while dynamic sources retain URL policy. */
export function LiteralScriptDocument(props: { src: string }) {
	return () => (
		<html>
			<head>
				<script type="module" src="/app.js?first=1&second=2" />
				<script src={props.src} />
			</head>
			<body>
				<main>Application</main>
				<script src="https://example.test/tail.js" />
			</body>
		</html>
	);
}
