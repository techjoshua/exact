import type { Component } from '@exactjs/core';
import { Document, documentOutput } from '@exactjs/core/document';

function ComposedDocument(this: Component<{ count: number }>) {
	this.state.count = 1;
	return () => (
		<Document doctype={{ systemId: 'about:legacy-compat' }}>
			<html lang={this.state.count === 1 ? 'en' : 'fr'}>
				<head>
					<title>Count {this.state.count}</title>
					<meta name="theme-color" content={this.state.count === 1 ? 'white' : 'black'} />
				</head>
				<body className:dark={this.state.count > 1}>
					<button onClick={() => this.state.count++}>Count {this.state.count}</button>
				</body>
			</html>
		</Document>
	);
}

/** Complete reactive document composed through the framework shell. */
export const composedDocument = <ComposedDocument />;

function ExplicitSlotsDocument(this: Component<{ count: number }>) {
	this.state.count = 1;
	return () => (
		<html lang={this.state.count === 1 ? 'en' : 'fr'}>
			<head>
				<title>Count {this.state.count}</title>
				<meta name="theme-color" content={this.state.count === 1 ? 'white' : 'black'} />
				{documentOutput.styles}
				{documentOutput.headScripts}
			</head>
			<body className:dark={this.state.count > 1}>
				<button onClick={() => this.state.count++}>Count {this.state.count}</button>
				{documentOutput.hydrationData}
				{documentOutput.bootstrap}
			</body>
		</html>
	);
}

/** Explicit framework output also works with the legacy automatic declaration. */
export const explicitSlotsDocument = <ExplicitSlotsDocument />;
