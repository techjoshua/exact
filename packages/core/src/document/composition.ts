import { childrenOf, partitionChildren, withChildren } from '../children/composition.js';
import {
	createCompiledIntrinsicReceipt as element,
	readCompiledIntrinsicReceipt
} from '../component-abi/intrinsic-receipt.js';
import type { Child } from '../component/contracts.js';
import { documentOutput } from './output.js';
import { doctype, type DoctypeOptions } from './doctype.js';
import { createCompiledFragmentReceipt } from '../component-abi/fragment-receipt.js';

/** Issues the document composition selected by the compiler without creating a component instance. */
export function createCompiledDocumentReceipt(
	props: Record<string, unknown> | null,
	...children: unknown[]
): Child {
	return composeDocument(
		children.length ? children : props?.children,
		props?.doctype as DoctypeOptions | undefined
	);
}

/** Completes immediate authored document structure without traversing application components. */
export function composeDocument(children: unknown, declaration?: DoctypeOptions): Child {
	const outer = partitionChildren(children, { html: 'html' });
	const html = single(outer.html, 'html');
	if (html && outer.remaining.length)
		throw new TypeError('Document html cannot have sibling content');
	const sections = partitionChildren(html ? childrenOf(html) : children, {
		head: 'head',
		body: 'body'
	});
	const head = single(sections.head, 'head');
	const body = single(sections.body, 'body');
	const headChildren = head ? childrenOf(head) : [];
	const titles = partitionChildren(headChildren, { title: 'title' });
	const charset = headChildren.some((child) => {
		const intrinsic = readCompiledIntrinsicReceipt(child);
		return (
			intrinsic?.tag === 'meta' && ('charSet' in intrinsic.props || 'charset' in intrinsic.props)
		);
	});
	const completedHead = [
		...(!charset ? [element('meta', { charset: 'utf-8' })] : []),
		...(!titles.title.length ? [element('title', null, 'eXact application')] : []),
		...headChildren,
		documentOutput.styles,
		documentOutput.headScripts
	];
	const completedBody = [
		...(body ? childrenOf(body) : []),
		...sections.remaining,
		documentOutput.hydrationData,
		documentOutput.bootstrap
	];
	const content = [
		head ? withChildren(head, completedHead) : element('head', null, completedHead),
		body ? withChildren(body, completedBody) : element('body', null, completedBody)
	];
	return createCompiledFragmentReceipt(
		null,
		doctype(declaration),
		html ? withChildren(html, content) : element('html', { lang: 'en' }, content)
	);
}

function single(children: readonly Child[], tag: string): Child | undefined {
	if (children.length > 1) throw new TypeError(`Document requires at most one <${tag}> element`);
	return children[0];
}
