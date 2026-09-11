import { TaskContext, type Component } from '@exactjs/core';

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

function IndependentSibling(props: { value: number; advance?: () => void }) {
	return () => <button onClick={() => props.advance?.()}>Item {props.value}</button>;
}

function IndependentSiblingDocument(this: Component<{ value: number }>) {
	this.state.value = 1;
	return () => (
		<html>
			<head />
			<body>
				<IndependentSibling value={this.state.value} advance={() => this.state.value++} />
				<IndependentSibling value={10} />
			</body>
		</html>
	);
}

/** Complete document whose sibling component props remain reactive after adoption. */
export const independentSiblingDocument = <IndependentSiblingDocument />;

function ResumableDocumentChild(this: Component<{ count: number }>) {
	this.state.count = 0;
	const prepare = (_task: TaskContext = TaskContext.server().blocking()) => {
		void _task;
		this.state.count = 4;
	};
	prepare();
	return () => <button onClick={() => this.state.count++}>Nested {this.state.count}</button>;
}

function DocumentWithAssets(props: { assets: string[] }) {
	return () => (
		<html>
			<head>
				{props.assets.map((href) => (
					<link rel="stylesheet" href={href} />
				))}
			</head>
			<body>
				<ResumableDocumentChild />
			</body>
		</html>
	);
}

/** Document fixture covering native head lists and root-owned nested resumption. */
export const documentWithAssets = <DocumentWithAssets assets={['/one.css', '/two.css']} />;
