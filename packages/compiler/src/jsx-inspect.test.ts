import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import {
	clientComponentChildrenProp,
	clientComponentHasServerSlotChildren,
	jsxElementIsClientIsland,
	jsxTagIsIntrinsicElement
} from './jsx-inspect.js';

function source(text: string): ts.SourceFile {
	return ts.createSourceFile('sample.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function firstJsxElement(node: ts.Node): ts.JsxElement {
	let result: ts.JsxElement | undefined;
	function visit(node: ts.Node): void {
		if (!result && ts.isJsxElement(node)) result = node;
		ts.forEachChild(node, visit);
	}
	visit(node);
	if (!result) throw new Error('Expected JSX element');
	return result;
}

function firstSelfClosingElement(text: string): ts.JsxSelfClosingElement {
	let result: ts.JsxSelfClosingElement | undefined;
	function visit(node: ts.Node): void {
		if (!result && ts.isJsxSelfClosingElement(node)) result = node;
		ts.forEachChild(node, visit);
	}
	visit(source(text));
	if (!result) throw new Error('Expected JSX self-closing element');
	return result;
}

function printChildrenProp(text: string): string | undefined {
	const file = source(text);
	const printer = ts.createPrinter({ removeComments: true });
	let printed: string | undefined;
	ts.transform(file, [
		(context) => (root) => {
			const element = firstJsxElement(root);
			const prop = clientComponentChildrenProp(context, element);
			printed = prop ? printer.printNode(ts.EmitHint.Expression, prop, file) : undefined;
			return root;
		}
	]);
	return printed;
}

describe('jsx inspection helpers', () => {
	it('detects client islands from event handlers and refs', () => {
		expect(
			jsxElementIsClientIsland(
				firstSelfClosingElement('const x = <Panel onClick={save} />;').attributes
			)
		).toBe(true);
		expect(
			jsxElementIsClientIsland(
				firstSelfClosingElement('const x = <Panel ref={node} />;').attributes
			)
		).toBe(true);
		expect(
			jsxElementIsClientIsland(
				firstSelfClosingElement('const x = <Panel title="Work" />;').attributes
			)
		).toBe(false);
	});

	it('classifies intrinsic tags without treating components as intrinsic', () => {
		expect(jsxTagIsIntrinsicElement(firstSelfClosingElement('const x = <div />;').tagName)).toBe(
			true
		);
		expect(jsxTagIsIntrinsicElement(firstSelfClosingElement('const x = <Panel />;').tagName)).toBe(
			false
		);
	});

	it('serializes simple client component children props', () => {
		expect(printChildrenProp('const x = <Panel>Hello {name}</Panel>;')).toBe('["Hello", name]');
	});

	it('marks nested JSX children as server slot children', () => {
		const element = firstJsxElement(source('const x = <Panel><span>{name}</span></Panel>;'));
		expect(clientComponentChildrenProp({} as ts.TransformationContext, element)).toBeUndefined();
		expect(clientComponentHasServerSlotChildren(element)).toBe(true);
	});
});
