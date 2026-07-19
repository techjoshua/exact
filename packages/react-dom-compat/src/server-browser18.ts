import '@exact/react-compat/react18';
import * as Server from './server-shared.js';
export * from './server-shared.js';
export const version = '18.3.1-exact';
export function renderToNodeStream(): never {
	throw new Error(
		'ReactDOMServer.renderToNodeStream(): The streaming API is not available in the browser. Use ReactDOMServer.renderToString() instead.'
	);
}
export function renderToStaticNodeStream(): never {
	throw new Error(
		'ReactDOMServer.renderToStaticNodeStream(): The streaming API is not available in the browser. Use ReactDOMServer.renderToStaticMarkup() instead.'
	);
}
export default { ...Server, renderToNodeStream, renderToStaticNodeStream, version };
