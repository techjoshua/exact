import type { Child, Component } from '@exactjs/core';
import { partitionChildren } from '@exactjs/core/children';
import { Document, doctype, documentOutput } from '@exactjs/core/document';

let pendingBody = Promise.resolve();

/** Owns the body gate so a test can observe head publication before application readiness. */
export function gateComposedBody(): () => void {
	let release!: () => void;
	pendingBody = new Promise<void>((resolve) => {
		release = resolve;
	});
	return release;
}

async function PendingBody() {
	await pendingBody;
	return () => <main>Ready body</main>;
}

/** The shell can stream its completed head while an immediate body component is pending. */
export function PendingDocument() {
	return () => (
		<Document>
			<head>
				<title>Early head</title>
			</head>
			<body>
				<PendingBody />
			</body>
		</Document>
	);
}

/** Exercises compiler-authored intrinsic children through the reusable document shell. */
export function ComposedDocument(this: Component<{ title: string }>) {
	this.state.title = 'Composed title';
	return () => (
		<Document>
			<html lang="fr">
				<head>
					<title>{this.state.title}</title>
				</head>
				<body className="custom">
					<main>Hello</main>
				</body>
			</html>
		</Document>
	);
}

/** Uses only application content and lets the shell fill every structural default. */
export function MinimalDocument() {
	return () => (
		<Document>
			<main>Minimal</main>
		</Document>
	);
}

function DialogTitle() {
	return () => <h1>Heading</h1>;
}

function Dialog(props: { children?: Child }) {
	const parts = partitionChildren(props.children, { title: DialogTitle });
	return () => (
		<section>
			<header>{parts.title}</header>
			<main>{parts.remaining}</main>
		</section>
	);
}

/** Component selectors match compiler identity without invoking children during partitioning. */
export function PartitionedDialog() {
	return () => (
		<Dialog>
			<p>Content</p>
			<DialogTitle />
		</Dialog>
	);
}

/** A replacement shell owns its declaration and the framework output placement. */
export function CustomDocument() {
	return () => (
		<>
			{doctype({ systemId: 'about:legacy-compat' })}
			<html>
				<head>
					<title>Custom</title>
					{documentOutput.styles}
					{documentOutput.headScripts}
				</head>
				<body>
					<main>Custom body</main>
					{documentOutput.hydrationData}
					{documentOutput.bootstrap}
				</body>
			</html>
		</>
	);
}
