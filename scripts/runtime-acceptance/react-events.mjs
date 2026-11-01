import { observedRootFactorySource } from './browser-errors.mjs';
import path from 'node:path';
import { build } from 'esbuild';

/** Builds the React 18 event journey for an isolated browser realm without changing the main target. */
export async function prepareReactEvent18Source(root) {
	const result = await build({
		stdin: {
			contents: `${observedRootFactorySource()}
import * as refApi from '@exactjs/react-compat/react18';
import * as refOwnership from '@exactjs/react-compat/exact';
const {act,createElement}=refApi;
import {createRoot,hydrateRoot} from '@exactjs/react-dom-compat/client18';
import {verifyReactHostEvents} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/react-event-journey.ts'))};
import {verifyReactCleanup} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/react-cleanup-journey.ts'))};
import {verifyReactRefCleanup} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/react-ref-journey.ts'))};
import {verifyReactHookCleanup} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/react-hook-cleanup-journey.ts'))};
import {verifyReactEffectErrors} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/react-effect-error-journey.ts'))};
import {verifyReactPreparation} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/react-preparation-journey.ts'))};
import {verifyReactSuspensePublication} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/react-suspense-publication-journey.ts'))};
import {verifyReactChildArrayClient} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/react-child-array-journey.ts'))};
import {verifyReactBoundedHydration} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/react-bounded-hydration-journey.ts'))};
import {verifyReactHydrationOwnership} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/react-hydration-ownership-journey.ts'))};
import * as boundedHydrationApi from ${JSON.stringify(path.join(root, 'packages/react-dom-compat/dist/renderer/root.js'))};
import {createPortal as createPreparationPortal} from '@exactjs/react-dom-compat';
window.verifyReactHostEvents=async()=>{const api={act,createElement,createRoot:observedRoot(createRoot),hydrateRoot:observedRoot(hydrateRoot,2)};await verifyReactHostEvents(api,document);await verifyReactCleanup(api,document);await verifyReactRefCleanup({...refApi,...refOwnership,...api},document);await verifyReactHookCleanup({...refApi,...refOwnership,...api},document);await verifyReactEffectErrors({...refApi,...api},document);await verifyReactPreparation({...refApi,...api,createPortal:createPreparationPortal},document);await verifyReactSuspensePublication({...refApi,...api},document);
 const {html}=await(await fetch('/react-child-arrays')).json();
 verifyReactChildArrayClient({...refApi,...refOwnership,...api},document,html);
 verifyReactBoundedHydration({...refApi,...boundedHydrationApi},document);
 verifyReactHydrationOwnership({...refApi,...api,createPortal:createPreparationPortal},document);};`,
			resolveDir: root,
			sourcefile: 'react-events18.ts'
		},
		bundle: true,
		platform: 'browser',
		format: 'iife',
		write: false
	});
	return result.outputFiles[0].text;
}

/** Installs actual React 19 and isolated React 18 browser event acceptance in the main harness. */
export function reactEventClientSource(root, react18Code) {
	return `import {verifyReactHostEvents} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/react-event-journey.ts'))};
import {verifyReactCleanup} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/react-cleanup-journey.ts'))};
import {verifyReactRefCleanup} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/react-ref-journey.ts'))};
import {verifyReactHookCleanup} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/react-hook-cleanup-journey.ts'))};
import {verifyReactEffectErrors} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/react-effect-error-journey.ts'))};
import {verifyReactPreparation} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/react-preparation-journey.ts'))};
import {verifyReactSuspensePublication} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/react-suspense-publication-journey.ts'))};
import {verifyReactChildArrayClient} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/react-child-array-journey.ts'))};
import {verifyReactBoundedHydration} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/react-bounded-hydration-journey.ts'))};
import {verifyReactHydrationOwnership} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/react-hydration-ownership-journey.ts'))};
import * as boundedHydrationApi from ${JSON.stringify(path.join(root, 'packages/react-dom-compat/dist/renderer/root.js'))};
import {createPortal as createPreparationPortal} from '@exactjs/react-dom-compat';
import * as refApi from '@exactjs/react-compat/react19';
import * as refOwnership from '@exactjs/react-compat/exact';
import {hydrateRoot as hydrateCompatibilityRoot} from '@exactjs/react-dom-compat/client19';
window.verifyReactHostEvents=async()=>{
 const api={act,createElement,createRoot:observedRoot(createCompatibilityRoot),hydrateRoot:observedRoot(hydrateCompatibilityRoot,2)};
 await verifyReactHostEvents(api,document);
 await verifyReactCleanup(api,document);
 await verifyReactRefCleanup({...refApi,...refOwnership,...api},document);
 await verifyReactHookCleanup({...refApi,...refOwnership,...api},document);
 await verifyReactEffectErrors({...refApi,...api},document);
 await verifyReactPreparation({...refApi,...api,createPortal:createPreparationPortal},document);await verifyReactSuspensePublication({...refApi,...api},document);
 const {html}=await(await fetch('/react-child-arrays')).json();
 verifyReactChildArrayClient({...refApi,...refOwnership,...api},document,html);
 verifyReactBoundedHydration({...refApi,...boundedHydrationApi},document);
 verifyReactHydrationOwnership({...refApi,...api,createPortal:createPreparationPortal},document);
 const frame=document.createElement('iframe');
 let verified=false;
 try {
  const ready=new Promise(resolve=>{frame.onload=resolve;});
  frame.srcdoc='<!doctype html><html><body></body></html>';
  document.body.append(frame);
  await ready;
  const script=frame.contentDocument.createElement('script');
  script.textContent=${JSON.stringify(react18Code)};
  frame.contentDocument.body.append(script);
  await frame.contentWindow.verifyReactHostEvents();
  (window.exactAcceptanceFrames??=[]).push(frame);
  verified=true;
 } finally {if(!verified)frame.remove();}
};`;
}
