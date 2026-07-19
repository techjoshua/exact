import {
	createPortal,
	createRoot,
	findDOMNode,
	flushSync,
	hydrate,
	hydrateRoot,
	render,
	unmountComponentAtNode,
	unstable_batchedUpdates,
	unstable_renderSubtreeIntoContainer,
	version
} from './client-api.js';
import { requestFormReset, useFormState, useFormStatus } from './forms.js';
import {
	preconnect,
	prefetchDNS,
	preinit,
	preinitModule,
	preload,
	preloadModule
} from './resources.js';

const ReactDOM = {
	createPortal,
	createRoot,
	findDOMNode,
	flushSync,
	hydrate,
	hydrateRoot,
	preconnect,
	prefetchDNS,
	preinit,
	preinitModule,
	preload,
	preloadModule,
	render,
	requestFormReset,
	unmountComponentAtNode,
	unstable_batchedUpdates,
	unstable_renderSubtreeIntoContainer,
	useFormState,
	useFormStatus,
	version
};

export default ReactDOM;
