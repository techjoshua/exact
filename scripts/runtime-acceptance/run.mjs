import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium, firefox, webkit } from 'playwright';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as acceptanceEvidence from './evidence.mjs';
import { checkSharedCompositionBrowser } from './shared-composition.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const sharedCompositionOnly = process.argv.includes('--shared-composition');
if (process.argv.slice(2).some((argument) => argument !== '--shared-composition'))
	throw new Error('Unknown native runtime acceptance profile');
const evidenceFile =
	process.env.EXACT_ACCEPTANCE_REPORT ??
	path.join(
		root,
		sharedCompositionOnly
			? '.tmp/runtime-acceptance/shared-composition.json'
			: '.tmp/runtime-acceptance/evidence.json'
	);
await rm(evidenceFile, { force: true });
const evidence = await acceptanceEvidence.createRuntimeAcceptanceEvidence(root);
const fixture = path.join(
	root,
	'packages/component-composition-corpus/test-support/runtime-acceptance'
);
await mkdir(path.join(root, '.tmp'), { recursive: true });
const temporary = await mkdtemp(path.join(root, '.tmp/runtime-acceptance-'));
let control;
let browser;
let worker;
let primaryFailure;
try {
	if (sharedCompositionOnly) {
		assert.equal(evidence.browser, 'chromium', 'Shared composition profile requires Chromium');
		browser = await chromium.launch();
		evidence.profile = 'shared-composition';
		evidence.scope =
			'Current compiled component with retained browser runtime providers. Provider build provenance unverified. No full runtime matrix, installed framework, fresh Core or hydration acceptance.';
		evidence.executions.push(await checkSharedCompositionBrowser(root, browser));
	} else {
		const { checkHydrationHandoff } = await import('./hydration-handoff.mjs');
		const { verifyNativeRuntimeHost } = await import('./host-journey.mjs');
		const { prepareChildInputs } = await import('./child-inputs.mjs');
		const { copyAccessibilityFixture, accessibilityClientSource } = await import(
			'./accessibility.mjs'
		);
		const { copyMountWorkFixture, mountWorkArtifact, mountWorkClientSource } = await import(
			'./mount-work.mjs'
		);
		const { prepareReactEvent18Source, reactEventClientSource } = await import(
			'./react-events.mjs'
		);
		const { serializationClientSource } = await import('./serialization-client.mjs');
		const { checkNativePreflight } = await import('./runtime-preflight.mjs');
		const { ownedProtocolIslandSource } = await import(
			'../../framework-adapters/test-support/owned-protocol-island-source.mjs'
		);
		const {
			compileFileArtifacts,
			compileProjectArtifacts,
			createExactArtifactGraph,
			createExactHydrationRegistrationModule
		} = await import('@exactjs/compiler');
		const { materializeExactPhysicalEnhancementFacades } = await import(
			'@exactjs/compiler/adapter-support'
		);
		const { createControl } = await import('./control.mjs');
		const { withNativeHost } = await import('./host.mjs');
		const { progressSource } = await import(
			'../../packages/component-composition-corpus/test-support/runtime-acceptance/progress-source.mjs'
		);
		const { prepareTaskCaptures } = await import('./task-captures.mjs');
		const { prepareValueContracts } = await import('./value-contracts.mjs');
		const { preparePortalEvents } = await import('./portal-events.mjs');
		const { prepareEagerReplay } = await import('./eager-replay.mjs');
		const { hostSource } = await import('./runtime-hosts.mjs');
		const { preparePendingOwnerBrowser } = await import('./pending-owner-browser.mjs');
		const { checkAssignmentListBrowser } = await import('./assignment-list.mjs');
		evidence.executions.push(...(await checkNativePreflight(root, temporary)));
		control = await createControl();
		const engine = process.env.EXACT_ACCEPTANCE_BROWSER ?? 'chromium';
		assert.ok(
			['chromium', 'firefox', 'webkit'].includes(engine),
			'Unknown acceptance browser: ' + engine
		);
		browser = await { chromium, firefox, webkit }[engine].launch();
		await checkHydrationHandoff(root, temporary, browser, evidence);
		if (engine === 'chromium') {
			evidence.sharedCompositionBrowser = await checkSharedCompositionBrowser(root, browser);
			evidence.authoredAssignmentListBrowser = await checkAssignmentListBrowser(root, browser);
		}
		const progressFile = path.join(temporary, 'Progress.tsx');
		await writeFile(progressFile, progressSource(control.origin));
		const progress = await compileFileArtifacts(progressFile, {
			rootDir: temporary,
			outDir: path.join(temporary, 'progress')
		});
		for (const name of [
			'render-attribute-order',
			'keyed-prop-replacement',
			'keyed-spread-updates',
			'render-namespace',
			'time-plan',
			'cancelled-task-catch',
			'collection-projection',
			'intl-numeric-range',
			'intl-projection',
			'source-normalization',
			'computed-component-members',
			'form-binding',
			'derived-pattern',
			'mutation-contract',
			'target-attribute-ownership'
		])
			await writeFile(
				path.join(temporary, name + '.tsx'),
				await readFile(
					path.join(
						root,
						'packages/component-composition-corpus/src/test-support',
						name + '.fixtures.tsx'
					)
				)
			);
		for (const name of [
			'conditional-class-keys',
			'event-argument-ownership',
			'native-mathml-properties',
			'nested-input-relationships',
			'applied-component-surface',
			'source-normalization-server'
		])
			await writeFile(
				path.join(temporary, name + '.fixtures.tsx'),
				await readFile(
					path.join(
						root,
						'packages/component-composition-corpus/src/test-support',
						name + '.fixtures.tsx'
					)
				)
			);
		await writeFile(
			path.join(temporary, 'event-function-declaration.js'),
			await readFile(
				path.join(
					root,
					'packages/component-composition-corpus/src/test-support/event-function-declaration.js'
				),
				'utf8'
			)
		);
		await writeFile(
			path.join(temporary, 'event-function-declaration.d.ts'),
			await readFile(
				path.join(
					root,
					'packages/component-composition-corpus/src/test-support/event-function-declaration.d.ts'
				)
			)
		);
		await writeFile(
			path.join(temporary, 'intl-numeric-range-values.ts'),
			await readFile(
				path.join(
					root,
					'packages/component-composition-corpus/src/test-support/intl-numeric-range-values.ts'
				)
			)
		);
		await writeFile(
			path.join(temporary, 'intl-projection-values.ts'),
			await readFile(
				path.join(
					root,
					'packages/component-composition-corpus/src/test-support/intl-projection-values.ts'
				)
			)
		);
		await writeFile(path.join(temporary, 'owned-protocol-islands.tsx'), ownedProtocolIslandSource);
		const pageFile = await copyMountWorkFixture(root, temporary, fixture, control.origin);
		await copyAccessibilityFixture(root, temporary);
		const pages = await compileProjectArtifacts([pageFile], {
			rootDir: temporary,
			outDir: path.join(temporary, 'page')
		});
		const page = pages.find((artifact) => artifact.inputFile === pageFile);
		assert.ok(page, 'Missing runtime page artifact');
		const mountWork = mountWorkArtifact(pages);
		const normalization = pages.find((artifact) =>
			artifact.inputFile.endsWith('source-normalization-server.fixtures.tsx')
		);
		assert.ok(normalization, 'Missing normalization task contract artifact');
		// Exercise same-build server setup through the extracted hydration projection as well as
		// the full component loopback used by the composition corpus.
		Object.assign(
			normalization,
			await compileFileArtifacts(normalization.inputFile, {
				rootDir: temporary,
				outDir: path.join(temporary, 'page'),
				serverComponents: true
			})
		);
		const ownedProtocol = pages.find((artifact) =>
			artifact.inputFile.endsWith('owned-protocol-islands.tsx')
		);
		assert.ok(ownedProtocol, 'Missing owned protocol island artifact');
		Object.assign(
			ownedProtocol,
			await compileFileArtifacts(ownedProtocol.inputFile, {
				rootDir: temporary,
				outDir: path.join(temporary, 'page'),
				serverComponents: true
			})
		);
		const ownedProtocolRegistration = path.join(
			temporary,
			'page',
			'owned-protocol-registration.ts'
		);
		await writeFile(
			ownedProtocolRegistration,
			createExactHydrationRegistrationModule(
				createExactArtifactGraph([ownedProtocol], {
					packageRoot: temporary,
					sourceRoot: temporary,
					rootDir: path.join(temporary, 'page')
				})
			)
		);
		// This harness consumes portable artifacts without a bundler adapter's virtual-module hooks.
		// Select installed providers through the shared physical-facade implementation instead.
		for (const artifact of pages) {
			for (const target of ['client', 'server']) {
				const outputFile = artifact[target + 'File'];
				const physical = materializeExactPhysicalEnhancementFacades(
					await readFile(outputFile, 'utf8'),
					artifact[target].rendererEnhancements,
					artifact.inputFile,
					temporary,
					target === 'client' ? '@exactjs/dom/framework/enhancements' : undefined,
					outputFile
				);
				await writeFile(outputFile, physical.code);
			}
		}
		const { handler: taskCaptureHandler, clearClient } = await prepareTaskCaptures(root, temporary);
		const valueContractsHandler = await prepareValueContracts(root, temporary);
		const eagerHandler = await prepareEagerReplay(temporary, fixture);
		const childInputHandler = await prepareChildInputs(root, temporary);
		const pendingOwnerHandler = await preparePendingOwnerBrowser(root, temporary);
		const inputArtifact = pages.find((artifact) =>
			artifact.inputFile.endsWith('nested-input-relationships.fixtures.tsx')
		);
		assert.ok(inputArtifact, 'Missing input relationship client artifact');
		const computedMembers = pages.find((artifact) =>
			artifact.inputFile.endsWith('computed-component-members.tsx')
		);
		assert.ok(computedMembers, 'Missing computed component member artifact');
		const client = path.join(temporary, 'client.ts');
		const portalEvents = await preparePortalEvents(root, fixture, temporary);
		const dormant = await compileFileArtifacts(
			path.join(
				root,
				'packages/component-composition-corpus/src/test-support/dormant-islands.fixtures.tsx'
			),
			{
				rootDir: path.join(root, 'packages/component-composition-corpus/src/test-support'),
				outDir: path.join(temporary, 'dormant')
			}
		);
		const react18Code = await prepareReactEvent18Source(root);
		await writeFile(
			client,
			`import {RuntimePage,RuntimeIsland,RuntimeScope,InspectionPanel} from ${JSON.stringify(page.clientFile)};
${mountWorkClientSource(mountWork)}
${accessibilityClientSource(pages)}
${portalEvents}
import {NormalizationServerSnapshotProbe,NormalizationAsyncInputProbe} from ${JSON.stringify(normalization.clientFile)};
import {inputRelationshipOwner} from ${JSON.stringify(inputArtifact.clientFile)};
import {computedMemberTrace} from ${JSON.stringify(computedMembers.clientFile)};
import {exactHydrationRegistration as ownedProtocolRegistration} from ${JSON.stringify(ownedProtocolRegistration)};
window.computedMemberTrace=computedMemberTrace;
import {DormantIslandShell,EagerHoverIsland,resetDormantIslandNotifications,readDormantIslandNotifications} from ${JSON.stringify(dormant.clientFile)};
import {verifyDormantIslandActivation} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/dormant-island-journey.mjs'))};
window.verifyDormantIslandActivation=()=>verifyDormantIslandActivation({createExactClient,lazyClientIsland,Shell:DormantIslandShell,Hover:EagerHoverIsland,reset:resetDormantIslandNotifications,read:readDormantIslandNotifications});
${serializationClientSource(root)}
${reactEventClientSource(root, react18Code)}
import {captureHydrationDom,restoreFormState} from ${JSON.stringify(path.join(root, 'packages/hydrate/dist/adoption/form-state.js'))};
import {createDomWorkBudget} from '@exactjs/dom/framework/component-root';
import {verifyHydrationFormRecovery} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/hydration-form-recovery-journey.mjs'))};
window.verifyHydrationFormRecovery=()=>verifyHydrationFormRecovery({captureHydrationDom,restoreFormState,createDomWorkBudget});
import {render,unmount,createExactDomInspectionHost,setExactDomInspectionOwnerFactory} from '@exactjs/dom';
import {createExactRuntimeInspectionOwner} from '@exactjs/core';
import {verifyDomInspectionIdentity} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/dom-inspection-identity-journey.mjs'))};
import {verifyDomRootOptions} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/dom-root-options-journey.mjs'))};
import {verifyHydrationOptions} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/hydration-options-journey.mjs'))};
import {createCompiledIntrinsicReceipt} from '@exactjs/core/runtime/component-operations';
import {renderCompiledIntrinsicRoot} from '@exactjs/dom/framework/intrinsic-root';
import {installExactDevtoolsRuntime} from ${JSON.stringify(path.join(root, 'packages/devtools-runtime/dist/runtime.js'))};
import {verifyDevtoolsConnectionLifecycle} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/devtools-connection-lifecycle-journey.mjs'))};
import {createExactClientInspectionQueryService as createQueryService} from ${JSON.stringify(path.join(root, 'packages/devtools-runtime/dist/query-service.js'))};
import {createExactClientEventStore as createEventStore} from ${JSON.stringify(path.join(root, 'packages/devtools-runtime/dist/client-events.js'))};
window.verifyDomInspectionIdentity=async()=>{
 for(const hydrateRoot of [hydrate,hydrateFull,hydrateOnly])await verifyHydrationOptions({Panel:InspectionPanel,operation:createCompiledComponentInputReceipt,hydrate:hydrateRoot});
 verifyPartitionObservations({inspect:inspectExactPartitionInstances});
 verifyDomRootOptions({Panel:InspectionPanel,operation:createCompiledComponentInputReceipt,intrinsic:createCompiledIntrinsicReceipt,renderIntrinsic:renderCompiledIntrinsicRoot,render,unmount,createExactRuntimeInspectionOwner,setExactDomInspectionOwnerFactory});
 await verifyDomInspectionIdentity({Panel:InspectionPanel,operation:createCompiledComponentInputReceipt,render,unmount,createExactDomInspectionHost,setExactDomInspectionOwnerFactory,createExactRuntimeInspectionOwner,createQueryService,createEventStore});
 await verifyDevtoolsConnectionLifecycle({Panel:InspectionPanel,operation:createCompiledComponentInputReceipt,render,unmount,installExactDevtoolsRuntime});
};
import {inspectExactPartitionInstances,hydrate as hydrateFull} from '@exactjs/hydrate';
import {hydrate as hydrateOnly} from '@exactjs/hydrate/root';
import {verifyPartitionObservations} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/partition-observation-journey.mjs'))};
import {applyDomProp} from ${JSON.stringify(path.join(root, 'packages/dom/dist/props.js'))};
window.applyRuntimeDomProp=applyDomProp;
import {flushSync} from '@exactjs/reactive';
window.propsProbeOwner=()=>inputRelationshipOwner;window.flushPropsProbe=flushSync;
import {createCompiledComponentInputReceipt} from '@exactjs/core/runtime/component-operations';
import {composePreparedExactComponentContracts} from '@exactjs/core/framework/component-contracts';
import {exactEnhancementCatalog} from '@exactjs/core/framework/enhancement-catalog';
import {createExactClient,lazyClientIsland,hydrate,readExactHydrationConfig} from '@exactjs/hydrate/enhanced';
window.hydrationObservations=[];window.responseObservations=0;
const options={
 onHydration(observation){observation.outcome=observation.outcome;window.hydrationObservations.push(observation);},
 onResponse(observation){observation.status=observation.status;window.responseObservations++;},
 enhancementCatalog:new Map([...exactEnhancementCatalog,['runtime-scope',RuntimeScope],['runtime-scope-peer',RuntimeScope]]),
 ...readExactHydrationConfig(document),continuations:composePreparedExactComponentContracts([RuntimePage,NormalizationServerSnapshotProbe,NormalizationAsyncInputProbe],'client').continuations,endpoint:'/__exact',islands:{...ownedProtocolRegistration.islands,RuntimeIsland},onErrorReport:report=>console.error(report.error),onDiagnostic:diagnostic=>console.error(diagnostic.message)
};
window.runtimeClient=location.pathname.includes('island-page')?createExactClient(document.getElementById('root'),options):hydrate(createCompiledComponentInputReceipt(RuntimeIsland,{}),document.getElementById('root'),options);
await window.runtimeClient.whenSettled();window.runtimeReady=true;`
		);
		const clientFile = path.join(temporary, 'client.js');
		await build({
			entryPoints: [client],
			outfile: clientFile,
			bundle: true,
			platform: 'browser',
			format: 'esm'
		});
		const clientCode = await readFile(clientFile, 'utf8');
		for (const runtime of ['node', 'bun', 'deno', 'cloudflare']) {
			const entry = path.join(temporary, runtime + '.mjs');
			const adapter = runtime === 'node' ? 'fetch' : runtime;
			const exported = {
				fetch: 'createExactFetchHandler',
				bun: 'createExactBunHandler',
				deno: 'createExactDenoHandler',
				cloudflare: 'createExactCloudflareHandler'
			}[adapter];
			await writeFile(
				entry,
				`import {taskCaptureResponse,taskCaptureContexts} from ${JSON.stringify(taskCaptureHandler)};
import {valueContractsResponse} from ${JSON.stringify(valueContractsHandler)};
import {pendingOwnerResponse} from ${JSON.stringify(pendingOwnerHandler)};
import {eagerReplayResponse} from ${JSON.stringify(eagerHandler)};
import {childInputResponse} from ${JSON.stringify(childInputHandler)};
import {NativeProgress,runCount} from ${JSON.stringify(progress.serverFile)};
import {RuntimePage,RuntimeShell,RuntimeIsland,RuntimeViews,RuntimeScope,RuntimeDeadline,deadlineState} from ${JSON.stringify(page.serverFile)};
import {NormalizationServerSnapshotProbe,NormalizationAsyncInputProbe} from ${JSON.stringify(normalization.serverFile)};
import {createApplication} from ${JSON.stringify(path.join(fixture, 'application.mjs'))};
import {${exported} as createHandler} from '@exactjs/${adapter}-adapter';
const app=createApplication({AsyncSsrScheduler,ssrPropAcceptanceApi:{prepareComponentProps,prepareDirectComponentProps,markContinuationDependencyValue,createContinuationDependencySlot,produceProgressiveHtml},serverCancellationApi:{readBody,createProgressStream,dispatchExactBatch,createTaskOwner,taskAwait,createTaskProgressReceiver,createTaskOwnerRecord,executeTaskFrame},normalizationComponents:[NormalizationServerSnapshotProbe,NormalizationAsyncInputProbe],valueContractsResponse,taskCaptureResponse,taskCaptureContexts,pendingOwnerResponse,eagerReplayResponse,childInputResponse,RuntimePage,RuntimeShell,RuntimeIsland,RuntimeViews,RuntimeScope,RuntimeDeadline,deadlineState,NativeProgress,runCount,createHandler,clientCode:${JSON.stringify(clientCode)},control:${JSON.stringify(control.origin)}});
${hostSource(runtime, { reactPipeableAcceptance: true, ssrSchedulerAcceptance: true, serverCancellationAcceptance: true })}`
			);
			const output = path.join(temporary, runtime + '-bundle.mjs');
			await build({
				entryPoints: [entry],
				outfile: output,
				bundle: true,
				platform: 'neutral',
				format: 'esm',
				conditions: ['worker'],
				mainFields: ['module', 'main'],
				external: ['node:*'],
				target: 'es2022'
			});
			const verify = (origin, label = runtime) =>
				verifyNativeRuntimeHost({
					origin,
					label,
					runtime,
					control,
					browser,
					clearClient,
					evidence
				});
			if (runtime === 'cloudflare') {
				const { Miniflare, convertV4MiniflareOptions } = await import('miniflare');
				worker = new Miniflare(
					convertV4MiniflareOptions({
						modules: true,
						unsafeDirectSockets: [{ host: '127.0.0.1', port: 0 }],
						scriptPath: output,
						compatibilityDate: '2026-07-30',
						compatibilityFlags: ['enable_request_signal'],
						host: '127.0.0.1',
						port: 0
					})
				);
				await verify(await worker.unsafeGetDirectURL());
				await worker.dispose();
				worker = undefined;
			} else if (runtime === 'deno') {
				const executable = createRequire(import.meta.url)('deno/install_api.cjs').runInstall();
				for (const flags of [[], ['--unstable-no-legacy-abort']])
					await withNativeHost(
						executable,
						[
							'run',
							'--no-config',
							'--no-lock',
							'--cached-only',
							...flags,
							'--allow-net=127.0.0.1',
							output
						],
						(origin) =>
							verify(origin, flags.length ? 'deno (modern abort)' : 'deno (default abort)')
					);
			} else
				await withNativeHost(
					runtime === 'node' ? process.execPath : (process.env.BUN_EXECUTABLE ?? 'bun'),
					[output],
					verify
				);
		}
	}
} catch (error) {
	primaryFailure = { error };
} finally {
	const cleanup = await Promise.allSettled(
		[
			() => worker?.dispose(),
			() => browser?.close(),
			() => control?.close(),
			() => rm(temporary, { recursive: true, force: true })
		].map((clean) => Promise.resolve().then(clean))
	);
	const failures = cleanup
		.filter((result) => result.status === 'rejected')
		.map((result) => result.reason);
	if (failures.length) {
		const cleanupError = new AggregateError(failures, 'Native acceptance cleanup failed');
		if (primaryFailure) console.error(cleanupError);
		else primaryFailure = { error: cleanupError };
	}
}

if (primaryFailure) throw primaryFailure.error;
await mkdir(path.dirname(evidenceFile), { recursive: true });
if (!sharedCompositionOnly) {
	const { checkInstalledIslands } = await import('./installed-islands.mjs');
	evidence.executions.push(
		...(await checkInstalledIslands(root, evidenceFile + '.installed.json'))
	);
} else {
	evidence.browserClosed = !browser.isConnected();
}
await acceptanceEvidence.verifyRuntimeAcceptanceSources(root, evidence);
await writeFile(
	evidenceFile,
	JSON.stringify(
		{
			...evidence,
			finished: new Date().toISOString(),
			success: true,
			provenanceLimit: evidence.dirty
				? 'Uncommitted sources were executed. This SHA does not reproduce the tested variant.'
				: undefined
		},
		null,
		2
	) + '\n'
);
