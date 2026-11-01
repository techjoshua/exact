import path from 'node:path';
import { compileFileArtifacts } from '@exactjs/compiler';

/** Prepares the compiler-issued portal fixture and browser ownership journey imports. */
export async function preparePortalEvents(root, fixture, temporary) {
	const artifacts = await compileFileArtifacts(path.join(fixture, 'portal-event-ownership.tsx'), {
		rootDir: fixture,
		outDir: path.join(temporary, 'portal-events')
	});
	const eventArtifact = await compileFileArtifacts(
		path.join(root, 'packages/dom/src/event-responsibility.fixtures.tsx'),
		{
			rootDir: path.join(root, 'packages/dom/src'),
			outDir: path.join(temporary, 'event-responsibility')
		}
	);
	const eventJourney = path.join(
		root,
		'packages/component-composition-corpus/test-support/event-responsibility-journey.mjs'
	);
	const journey = path.join(
		root,
		'packages/component-composition-corpus/test-support/portal-event-ownership-journey.mjs'
	);
	return `import {EventResponsibilityPanel} from ${JSON.stringify(eventArtifact.clientFile)};
import {verifyEventResponsibility} from ${JSON.stringify(eventJourney)};
window.verifyEventResponsibility=()=>verifyEventResponsibility({mount(container,action,fail,errors){render(createCompiledComponentInputReceipt(EventResponsibilityPanel,{action,fail,errors}),container,{onErrorReport:({error})=>{throw error;}});},unmount,flushSync});
import {PortalEventPanel,PortalParentPanel} from ${JSON.stringify(artifacts.clientFile)};
import {verifyPortalEventOwnership} from ${JSON.stringify(journey)};
window.verifyPortalEventOwnership=()=>verifyPortalEventOwnership({Portal:PortalEventPanel,Parent:PortalParentPanel,operation:createCompiledComponentInputReceipt,render,unmount,flushSync});`;
}
