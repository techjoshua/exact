import { JSDOM } from 'jsdom';

/** Installs the explicit browser globals used by isolated client performance workers. */
export function installPerformanceDom(target = globalThis) {
	const dom = new JSDOM('<!doctype html><body></body>', {
		url: 'https://performance.exact.test/'
	});
	Object.assign(target, {
		window: dom.window,
		document: dom.window.document,
		Node: dom.window.Node,
		Comment: dom.window.Comment,
		Text: dom.window.Text,
		Document: dom.window.Document,
		DocumentFragment: dom.window.DocumentFragment,
		Element: dom.window.Element,
		HTMLElement: dom.window.HTMLElement,
		CharacterData: dom.window.CharacterData,
		HTMLButtonElement: dom.window.HTMLButtonElement,
		HTMLDialogElement: dom.window.HTMLDialogElement,
		HTMLFormElement: dom.window.HTMLFormElement,
		HTMLInputElement: dom.window.HTMLInputElement,
		HTMLScriptElement: dom.window.HTMLScriptElement,
		HTMLSelectElement: dom.window.HTMLSelectElement,
		HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
		Event: dom.window.Event,
		MouseEvent: dom.window.MouseEvent
	});
	return dom;
}
