import type { Component } from '@exactjs/core';

function ProfiledRoot(this: Component<{}>) {
	return () => <p>profiled</p>;
}

function DocumentRoot(this: Component<{ count: number }>) {
	this.state.count = 1;
	return () => (
		<html lang="en">
			<head>
				<title>{`Count ${this.state.count}`}</title>
			</head>
			<body>
				<button onClick={() => this.state.count++}>Count {this.state.count}</button>
			</body>
		</html>
	);
}

/** Compiler-issued profiling root. */
export const profiledRoot = <ProfiledRoot />;

/** Compiler-issued complete-document root. */
export const documentRoot = <DocumentRoot />;
