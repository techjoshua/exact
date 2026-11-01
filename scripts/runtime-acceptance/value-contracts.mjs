import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { request, json } from './test-support.mjs';

/** Bundles the same public-package runtime value journeys for native hosts and the browser. */
export async function prepareValueContracts(root, temporary) {
	const { compileFileArtifacts } = await import('@exactjs/compiler');
	const constructionFixture = path.join(
		root,
		'packages/dom/src/test-support/roots/construction-errors.fixtures.tsx'
	);
	const construction = await compileFileArtifacts(constructionFixture, {
		rootDir: path.dirname(constructionFixture),
		outDir: path.join(temporary, 'construction-errors')
	});
	const registryObservation = await compileFileArtifacts(
		path.join(path.dirname(constructionFixture), 'registry-observations.fixtures.tsx'),
		{
			rootDir: path.dirname(constructionFixture),
			outDir: path.join(temporary, 'registry-observations')
		}
	);
	const journey = path.join(
		root,
		'packages/component-composition-corpus/test-support/gravity-readonly-journey.mjs'
	);
	const physicsJourney = path.join(
		root,
		'packages/component-composition-corpus/test-support/physics-force-recovery-journey.mjs'
	);
	const chartJourney = path.join(
		root,
		'packages/component-composition-corpus/test-support/chart-numeric-journey.mjs'
	);
	const refJourney = path.join(
		root,
		'packages/component-composition-corpus/test-support/ref-root-value-journey.mjs'
	);
	const timeJourney = path.join(
		root,
		'packages/component-composition-corpus/test-support/time-lifecycle-journey.mjs'
	);
	const intlJourney = path.join(
		root,
		'packages/component-composition-corpus/test-support/intl-protocol-journey.mjs'
	);
	const inspectionFailureJourney = path.join(
		root,
		'packages/component-composition-corpus/test-support/inspection-failure-journey.mjs'
	);
	const themeJourney = path.join(
		root,
		'packages/component-composition-corpus/test-support/theme-derivation-journey.mjs'
	);
	const intlMeasurementJourney = path.join(
		root,
		'packages/component-composition-corpus/test-support/intl-measurement-journey.mjs'
	);
	const intlPatternJourney = path.join(
		root,
		'packages/component-composition-corpus/test-support/intl-pattern-journey.mjs'
	);
	const inspectionEventJourney = path.join(
		root,
		'packages/component-composition-corpus/test-support/inspection-event-journey.mjs'
	);
	const inspectionObservationJourney = path.join(
		root,
		'packages/component-composition-corpus/test-support/inspection-observation-journey.mjs'
	);
	const { analyzeIntlSource } = await import(
		path.join(root, 'packages/intl-analyzer/dist/index.js')
	);
	const { relinkExactIntlDescriptorModule } = await import(
		path.join(root, 'packages/intl-build/dist/index.js')
	);
	const analyzedIntl = analyzeIntlSource(
		'export function Greeting(){return () => <p intl:message>Hello</p>;}',
		{
			filename: '/src/GeneratedObservation.tsx',
			owner: 'generated-observation',
			sourceLocale: 'en-US',
			descriptorModuleId: 'virtual:corpus/intl-generated',
			generation: 1
		}
	);
	const companion = analyzedIntl.companions[0];
	const data = await import('data:text/javascript,' + encodeURIComponent(companion.code));
	const generatedIntlModule = path.join(temporary, 'intl-generated-observation.mjs');
	const linkedIntl = relinkExactIntlDescriptorModule(
		companion.id,
		companion.code,
		data.descriptors,
		[],
		1,
		'/src/GeneratedObservation.tsx',
		[]
	);
	await writeFile(generatedIntlModule, linkedIntl.code);
	const checks = `import {readExactPackageParticipation} from '@exactjs/plugin-api';
import {resolveDiscoveryPolicy} from ${JSON.stringify(path.join(root, 'packages/plugin-host/dist/discovery/policy.js'))};
import {verifyPluginMetadataValues,verifyPluginMetadataCapture} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/plugin-metadata-journey.mjs'))};
import {defineGesture,defineDrag,GestureSession,installGestureClock,defaultGestureSettings} from '@exactjs/gestures';
import {createPointerGestureSample,createIdleGestureSample} from ${JSON.stringify(path.join(root, 'component-libraries/gestures/dist/server/gesture-samples.js'))};
import {resolveKeyboardGestureIntent} from ${JSON.stringify(path.join(root, 'component-libraries/gestures/dist/server/keyboard-intent.js'))};
import {verifyGestureValues,verifyGestureSessionOwnership} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/gesture-ownership-journey.mjs'))};
import {invokeExact,invokeExactBatch} from ${JSON.stringify(path.join(root, 'packages/hydrate/dist/invocations.js'))};
import {ExactProtocolRecorder as recordedProtocol,mountClientServerTest as mountRecordedProtocol} from '@exactjs/testing';
import {createClientServerTransport as recordedTransport} from ${JSON.stringify(path.join(root, 'packages/testing/dist/internal/client-server-transport.js'))};
import {linkExactObservationOwner as recordResponseOwner} from '@exactjs/core/framework/inspection-transport';
import {verifyProtocolObservationConcurrency,verifyProtocolObservationTransport} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/protocol-observation-journey.mjs'))};
import {createExactClient as createWideExactClient} from '@exactjs/hydrate';
import {diffBoundaryHtml as wideStyleDiff} from ${JSON.stringify(path.join(root, 'packages/ssr/dist/diff.js'))};
import {paginateInspectionSources as wideInspectionPage} from ${JSON.stringify(path.join(root, 'packages/devtools-runtime/dist/query/collection-pagination.js'))};
import {verifyWideStyleDiff,verifyWideInspectionPage,verifyWideHydrationOrdering,verifyFiniteInspectionSources} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/wide-runtime-collections.mjs'))};
import {handleExactRequest as clientRequestHandler,defineExactOperationContract as clientOperationContract} from '@exactjs/server';
import {mergeStateForContract as authorityMerge} from ${JSON.stringify(path.join(root, 'packages/hydrate/dist/state.js'))};
import {stateNodeMatchesWrites as authorityLookup,stateOutputPathsMatchWrites,stateDeletionPathsMatchWrites} from '@exactjs/core/framework/protocol-records';
import {verifyStateAuthority,verifyStateAuthorityLookup,verifyStatePathSelections} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/state-authority-journey.mjs'))};
import {verifyJsonResponseOwnership} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/response-reader-journey.mjs'))};
import {verifyClientRequestBodyPolicy} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/request-body-policy-journey.mjs'))};
import {animate,defineMotion,resolveMotionEffect,createViewTransitionCoordinator,defaultMotionSettings} from '@exactjs/motion';
import {createWebAnimationDriver} from ${JSON.stringify(path.join(root, 'component-libraries/motion/dist/server/driver.js'))};
import {verifyMotionValues,verifyMotionPlacement} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/motion-ownership-journey.mjs'))};
import {defineConfig} from '@exactjs/config';
import {verifyAuthoredConfigValues} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/authored-config-journey.mjs'))};
import {loadExactRemoteModule} from '@exactjs/microfrontends/client';
import {RemoteComponent as RemoteLoadClientComponent} from ${JSON.stringify(path.join(root, 'plugins/microfrontends/dist/client-artifact/client.js'))};
import {verifyRemoteLoadOwnership} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/remote-load-ownership-journey.mjs'))};
import {afterReactiveSettlement} from '@exactjs/reactive/framework/settlement';
import {verifySettlementIsolation} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/reactive-settlement-journey.mjs'))};
import {installExactDevtoolsRuntime,exactDevtoolsHookSymbol} from '@exactjs/devtools-runtime';
import {verifyInspectionSessionObservations} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/inspection-session-journey.mjs'))};
import {verifyClientInspectionValues} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/client-inspection-values-journey.mjs'))};
import {verifyInspectionPreviewOwnership,verifyInspectionObservationOwnership} from ${JSON.stringify(inspectionObservationJourney)};
import {previewExactValue,redactExactValue,paginateExactInspection,EXACT_INSPECTION_METHODS,parseExactInspectionRequest} from '@exactjs/devtools-protocol';
import {createExactClientEventStore} from ${JSON.stringify(path.join(root, 'packages/devtools-runtime/dist/client-events.js'))};
import {verifyClientEventOwnership} from ${JSON.stringify(inspectionEventJourney)};
import {uniformGravity,defineGravityField,defineGravityAttractor} from '@exactjs/gravity';
import {resolveTheme,createThemeDeriver,deriveTheme,deriveDataColors, builtInTemperaments,exactThemeContract,serializeThemeOverrides} from '@exactjs/theme';
import {createThemeScopeDefinition,createThemeScopePresentation,resolveThemeScope} from ${JSON.stringify(path.join(root, 'packages/theme/dist/server/system-theme.js'))};
import {verifyThemeDerivationValues,verifyThemeCacheOwnership,verifyThemeSourceCapture} from ${JSON.stringify(themeJourney)};
import {createContext,inspectExactRuntimeComponent,createExactRuntimeInspectionOwner} from '@exactjs/core';
import {defineInteropContext,bridgeReactContext,exactContextToken} from '@exactjs/react-compat/interop';
import {verifyReactContextObservations} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/react-context-observation-journey.mjs'))};
import {createFrameworkComponentDomain} from '@exactjs/core/framework/component-domains';
import {defineTask,bindTaskForHost,withTaskSignal,withAbortSignal,withExistingTaskSignal,withExistingAbortSignal} from '@exactjs/core/runtime/tasks';
import {verifyTaskNativeOptions} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/task-native-options-journey.mjs'))};
import {verifyInspectedFailureOwnership} from ${JSON.stringify(inspectionFailureJourney)};
import {validateIntlPackageMetadata,projectIntlTranslationContract,materializeIntlTranslation,createIntlEnvironment,intlLocaleMetadata,resolveIntlMeasurementPresentation,convertIntlMeasurementValue,formatIntlMeasurementValue} from '@exactjs/intl';
import {verifyIntlPatternObservations} from ${JSON.stringify(intlPatternJourney)};
import {verifyIntlMeasurementOwnership,verifyIntlPolicyOwnership,verifyIntlCatalogOwnership,verifyIntlScopedSources} from ${JSON.stringify(intlMeasurementJourney)};
import {validateIntlRuntimeDescriptor,validateIntlCatalog,prepareIntlActivation,registerIntlArtifacts,snapshotIntlArtifacts} from '@exactjs/intl/internal';
import {canonicalizeIntlValue} from '@exactjs/intl';
import * as generatedIntlObservations from ${JSON.stringify(generatedIntlModule)};
import {verifyIntlProtocolValues,verifyIntlValidationLimits,verifyIntlArtifactObservations,verifyIntlGeneratedObservations} from ${JSON.stringify(intlJourney)};
import {createTimeActivation,validateTimeChangePlan,timeInstant,wallTimeClock} from '@exactjs/time/internal';
import {inspectTimeClock,createManualTimeClock} from '@exactjs/time/testing';
import {verifyTimeLifecycle,verifyTimeValues,verifyTimeWakeFailures,verifyTimeTimerRetirement} from ${JSON.stringify(timeJourney)};
import {sampleGravity} from '@exactjs/gravity/testing';
import {linearTicks,scaleLinear} from '@exactjs/charts/scales';
import {verifyChartNumericValues} from ${JSON.stringify(chartJourney)};
import {createPhysicsWorld,definePhysicsProjection,definePhysicsCollisionListener} from '@exactjs/physics';
import '@exactjs/core/runtime/refs';
import '@exactjs/core/runtime/component-tasks';
import '@exactjs/core/runtime/component-reactivity';
import {createFrameworkFixtureComponentInstance} from '@exactjs/core/testing';
import {publishComponentRoot,publishComponentRootRelease,reverseComponentRootRelease,disposeComponentRoot} from '@exactjs/core/framework/component-roots';
import {directSsrRef,directSsrRefs,directSsrRoot} from '@exactjs/ssr/runtime/direct-refs';
import {verifyRefRootValues} from ${JSON.stringify(refJourney)};
import {captureReactiveMutations,batch,publishBatch,ref,reactive,encodeReactiveProtocolValue,decodeReactiveProtocolValue,registerReactiveListKey,writeReactive,mutateReactiveCollection,indexedReactive,readReactiveOwnProperty,watch,flushSync,unwrap} from '@exactjs/reactive';
import {reactiveObjects} from '@exactjs/reactive/framework/objects';
import {indexedReactiveObjects} from '@exactjs/reactive/framework/indexed-objects';
import {updateReactive,updateReactiveShallow,deleteReactiveValue,writeReactiveLazy,writeIndexedReactiveValue,deleteIndexedReactiveValue,readIndexedReactiveSource} from '@exactjs/reactive/framework/runtime';
import {verifyCustomArrayReferenceReplacement,verifyReactiveReflection,verifyReconciliationNativeAcceptance,verifyIndexedDescriptorAcceptance,verifyNativeDescriptorAcceptance} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/reactive-native-descriptor-journey.mjs'))};
import {createPendingReactiveTransaction} from '@exactjs/reactive/framework/transactions';
import {assignmentIdentityCases,verifyAssignmentIdentity} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/assignment-identity-journey.mjs'))};
import {assignmentPendingCases,verifyAssignmentPending} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/assignment-pending-journey.mjs'))};
import {mapNativeValueCases,verifyMapNativeValue} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/map-native-value-journey.mjs'))};
import {collectionClearCases,verifyCollectionClear,hashRollbackCases,verifyHashRollback,hashOwnerKinds,verifyHashOwner} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/collection-hash-journey.mjs'))};
import {arrayPropertyJournalCases,verifyArrayPropertyJournal,verifyReactiveReceiverOwnership} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/array-property-journal-journey.mjs'))};
import {verifyWideTransactions} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/wide-transaction-journey.mjs'))};
import {verifyArraySegments} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/array-segment-journey.mjs'))};
import {verifyDomRangeObservations} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/dom-range-observation-journey.mjs'))};
import {renderTestTree as rangeRender,inspectDomRoot as rangeInspect} from '@exactjs/dom/testing';
import {render as rangePublicRender,unmount as rangeUnmount} from '@exactjs/dom';
import '@exactjs/dom/unsafe-html';
import {unsafeHtml as rangeHtml} from '@exactjs/core';
import {componentRootLifecycle as rangeRoot} from ${JSON.stringify(path.join(root, 'packages/core/dist/client/component/root-lifecycle.js'))};
import {defaultErrorContext as rangeErrors} from ${JSON.stringify(path.join(root, 'packages/core/dist/client/component/errors.js'))};
import {createCompiledComponentInputReceipt as constructionOperation} from '@exactjs/core/runtime/component-operations';
import * as constructionFixtures from ${JSON.stringify(construction.clientFile)};
import {verifyConstructionErrors} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/construction-error-journey.mjs'))};
import {verifyPhysicsForceRecovery,verifyPhysicsReadonlyValues,verifyPhysicsFiniteCorrections,verifyPhysicsClockArithmetic} from ${JSON.stringify(physicsJourney)};
import {verifyGravityReadonlyValues} from ${JSON.stringify(journey)};
import {verifyServerContractValues,verifyContinuationContractCache,verifyServerContextValues} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/server-contract-journey.mjs'))};
import {defineExactBoundaryContract,composeExactExecutorContract,createExactHydrationConfig} from '@exactjs/server';
import {verifyComputedObservationValues,verifyRegistryObservationValues,verifyRecorderObservationValues} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/observation-values-journey.mjs'))};
import {computed,inspectComputed,createEffectScope,withEffectScope} from '@exactjs/reactive';
import {inspectComponentRegistry,hasComponent} from '@exactjs/core';
import {ObservationRegistry} from ${JSON.stringify(registryObservation.clientFile)};
import {ExactProtocolRecorder as ClientProtocolRecorder} from ${JSON.stringify(path.join(root, 'packages/testing/dist/client-artifact/protocol.js'))};
import {ExactProtocolRecorder as ServerProtocolRecorder} from ${JSON.stringify(path.join(root, 'packages/testing/dist/server-artifact/protocol.js'))};
export async function runChecks(){
await verifyProtocolObservationTransport({ExactProtocolRecorder:recordedProtocol,createClientServerTransport:recordedTransport,handleExactRequest:clientRequestHandler,defineExactOperationContract:clientOperationContract,invokeExact,invokeExactBatch,linkExactObservationOwner:recordResponseOwner});
if(typeof document!=='undefined') await verifyProtocolObservationConcurrency({ExactProtocolRecorder:recordedProtocol,mountClientServerTest:mountRecordedProtocol,handleExactRequest:clientRequestHandler,defineExactOperationContract:clientOperationContract},document);
verifyComputedObservationValues({reactive,computed,inspectComputed,createEffectScope,withEffectScope});
verifyRegistryObservationValues({inspectComponentRegistry,hasComponent},ObservationRegistry);
for(const ExactProtocolRecorder of [ClientProtocolRecorder,ServerProtocolRecorder])await verifyRecorderObservationValues({ExactProtocolRecorder});
for(const count of [3,256])await verifyFiniteInspectionSources({paginateInspectionSources:wideInspectionPage},count);
verifyServerContractValues({defineExactOperationContract:clientOperationContract,defineExactBoundaryContract,composeExactExecutorContract,createExactHydrationConfig});
await verifyContinuationContractCache({handleExactRequest:clientRequestHandler,defineExactOperationContract:clientOperationContract});
await verifyServerContextValues({createContext,handleExactRequest:clientRequestHandler,defineExactOperationContract:clientOperationContract});
verifyReactContextObservations({createContext,defineInteropContext,bridgeReactContext,exactContextToken});
await verifyStateAuthority({handleExactRequest:clientRequestHandler,defineExactOperationContract:clientOperationContract,mergeStateForContract:authorityMerge});
for(const count of [3,2000]){
verifyStateAuthorityLookup({stateNodeMatchesWrites:authorityLookup},count);
verifyStatePathSelections({stateOutputPathsMatchWrites,stateDeletionPathsMatchWrites},count);
}
if(typeof document!=='undefined')for(const nested of [false,true])for(const replacement of [false,true])verifyConstructionErrors({render:rangePublicRender,renderTestTree:rangeRender,unmount:rangeUnmount,componentOperation:constructionOperation,defaultErrorContext:rangeErrors},constructionFixtures,document,nested,replacement);
if(typeof document!=='undefined')for(const count of [3,140000])verifyDomRangeObservations({renderTestTree:rangeRender,unmount:rangeUnmount,unsafeHtml:rangeHtml,inspectDomRoot:rangeInspect,componentRootLifecycle:rangeRoot,defaultErrorContext:rangeErrors},document,count);
for(const count of [3,140000]) {
verifyWideStyleDiff({diffBoundaryHtml:wideStyleDiff},count);
await verifyWideInspectionPage({paginateInspectionSources:wideInspectionPage},count);
if(typeof document!=='undefined')await verifyWideHydrationOrdering({createExactClient:createWideExactClient},document,count);
}
verifyWideTransactions({reactive,batch,publishBatch,captureReactiveMutations,watch,flushSync},3);
verifyWideTransactions({reactive,batch,publishBatch,captureReactiveMutations,watch,flushSync});
verifyArraySegments({reactive,batch,captureReactiveMutations},3);
verifyArraySegments({reactive,batch,captureReactiveMutations});
verifyTaskNativeOptions({withTaskSignal,withAbortSignal,withExistingTaskSignal,withExistingAbortSignal});
verifyCustomArrayReferenceReplacement({reactive,reactiveObjects,watch,flushSync});
verifyReactiveReflection({reactive,reactiveObjects,indexedReactive,indexedReactiveObjects,watch,flushSync,batch});
verifyReconciliationNativeAcceptance({reactive,reactiveObjects,indexedReactive,indexedReactiveObjects,updateReactive,updateReactiveShallow});
verifyNativeDescriptorAcceptance({reactive,reactiveObjects,writeReactiveLazy});
for(const kind of arrayPropertyJournalCases) verifyArrayPropertyJournal({reactive,captureReactiveMutations,batch,watch,flushSync,unwrap,writeReactiveLazy,deleteReactiveValue},kind);
verifyReactiveReceiverOwnership({reactive,watch,flushSync});
const assignmentApi={reactive,indexedReactive,watch,ref,flushSync,unwrap,writeReactive,writeIndexedReactiveValue,createPendingReactiveTransaction};
for(const mode of assignmentIdentityCases)verifyAssignmentIdentity(assignmentApi,mode);
for(const mode of assignmentPendingCases)verifyAssignmentPending(assignmentApi,mode);
const collectionHashApi={reactive,indexedReactive,captureReactiveMutations,batch,watch,flushSync,unwrap,mutateReactiveCollection,registerReactiveListKey,encodeReactiveProtocolValue,decodeReactiveProtocolValue,writeReactive};
for(const kind of ['Map','Set'])for(const mode of collectionClearCases)verifyCollectionClear(collectionHashApi,kind,mode);
for(const mode of hashRollbackCases)verifyHashRollback(collectionHashApi,mode);
for(const mode of mapNativeValueCases)verifyMapNativeValue({...collectionHashApi,createPendingReactiveTransaction},mode);
for(const kind of hashOwnerKinds)for(const operation of ['set','define','delete','equal','refused','rollback'])verifyHashOwner(collectionHashApi,kind,operation);

verifyIndexedDescriptorAcceptance({indexedReactive,readReactiveOwnProperty,writeIndexedReactiveValue,deleteIndexedReactiveValue,readIndexedReactiveSource,watch,flushSync,batch});
verifyAuthoredConfigValues({defineConfig});
verifyPluginMetadataValues({readExactPackageParticipation,resolveDiscoveryPolicy});
verifyPluginMetadataCapture({readExactPackageParticipation,resolveDiscoveryPolicy});
verifyGestureValues({defineGesture,defineDrag,createPointerGestureSample,createIdleGestureSample,resolveKeyboardGestureIntent,defaultGestureSettings});
if(typeof document!=='undefined') await verifyGestureSessionOwnership({GestureSession,defineGesture,installGestureClock,defaultGestureSettings});
await verifyClientRequestBodyPolicy({invokeExact,invokeExactBatch,handleExactRequest:clientRequestHandler,defineExactOperationContract:clientOperationContract});
await verifyJsonResponseOwnership({invokeExact,invokeExactBatch});
verifyMotionValues({defineMotion,resolveMotionEffect,createViewTransitionCoordinator,defaultMotionSettings,createWebAnimationDriver});
await verifyMotionPlacement({createWebAnimationDriver,animate});
await verifyRemoteLoadOwnership({load:loadExactRemoteModule,component:RemoteLoadClientComponent});
await verifyInspectionSessionObservations({installExactDevtoolsRuntime,exactDevtoolsHookSymbol});
await verifyClientInspectionValues({installExactDevtoolsRuntime,exactDevtoolsHookSymbol,createFrameworkFixtureComponentInstance,createFrameworkComponentDomain,inspectExactRuntimeComponent,createContext});
verifyInspectionPreviewOwnership({previewExactValue,redactExactValue,paginateExactInspection,EXACT_INSPECTION_METHODS,parseExactInspectionRequest});
await verifyInspectionObservationOwnership({createExactRuntimeInspectionOwner,createFrameworkComponentDomain,createFrameworkFixtureComponentInstance,defineTask,inspectExactRuntimeComponent});
verifyClientEventOwnership({createExactClientEventStore});
verifyIntlPatternObservations({validateIntlPackageMetadata,createIntlEnvironment,projectIntlTranslationContract,materializeIntlTranslation});
verifyIntlScopedSources({createIntlEnvironment,registerIntlArtifacts,snapshotIntlArtifacts});
verifyIntlCatalogOwnership({createIntlEnvironment,registerIntlArtifacts,snapshotIntlArtifacts,captureReactiveMutations});
verifyIntlPolicyOwnership({createIntlEnvironment,captureReactiveMutations,watch,flushSync});
verifyIntlMeasurementOwnership({intlLocaleMetadata,createIntlEnvironment,resolveIntlMeasurementPresentation,convertIntlMeasurementValue,formatIntlMeasurementValue,captureReactiveMutations});
verifyThemeSourceCapture({resolveTheme,builtInTemperaments});
verifyThemeCacheOwnership({resolveTheme,createThemeScopeDefinition,createThemeScopePresentation,resolveThemeScope,builtInTemperaments,exactThemeContract,serializeThemeOverrides});
verifyThemeDerivationValues({resolveTheme,createThemeDeriver,deriveTheme,deriveDataColors, builtInTemperaments,exactThemeContract,serializeThemeOverrides});
await verifyInspectedFailureOwnership({createExactRuntimeInspectionOwner,createFrameworkComponentDomain,createFrameworkFixtureComponentInstance,defineTask,bindTaskForHost});
verifyIntlValidationLimits({validateIntlRuntimeDescriptor,validateIntlCatalog});
verifyIntlProtocolValues({validateIntlRuntimeDescriptor,validateIntlCatalog,prepareIntlActivation,registerIntlArtifacts,canonicalizeIntlValue});
verifyIntlArtifactObservations({registerIntlArtifacts,snapshotIntlArtifacts});
verifyIntlGeneratedObservations(generatedIntlObservations);
await verifyTimeValues({createTimeActivation,validateTimeChangePlan,timeInstant,wallTimeClock,createManualTimeClock});
await verifyTimeLifecycle({createTimeActivation,inspectTimeClock});
await verifyTimeWakeFailures({createTimeActivation});
await verifyTimeTimerRetirement({createTimeActivation});
await verifySettlementIsolation({afterReactiveSettlement});
verifyRefRootValues({directSsrRef,directSsrRefs,directSsrRoot,createFrameworkFixtureComponentInstance,publishComponentRoot,publishComponentRootRelease,reverseComponentRootRelease,disposeComponentRoot,batch});
verifyPhysicsClockArithmetic({createPhysicsWorld});
verifyPhysicsFiniteCorrections({createPhysicsWorld});
verifyChartNumericValues({linearTicks,scaleLinear});
verifyPhysicsReadonlyValues({createPhysicsWorld,definePhysicsProjection,definePhysicsCollisionListener});
verifyPhysicsForceRecovery({createPhysicsWorld,captureReactiveMutations});
return verifyGravityReadonlyValues({uniformGravity,defineGravityField,defineGravityAttractor,sampleGravity});
}`;
	const asset = path.join(temporary, 'value-contracts-client.mjs');
	await build({
		stdin: {
			contents: checks.replace(
				JSON.stringify(path.join(root, 'packages/theme/dist/server/system-theme.js')),
				JSON.stringify(path.join(root, 'packages/theme/dist/client/system-theme.js'))
			),
			resolveDir: root
		},
		bundle: true,
		platform: 'browser',
		format: 'esm',
		outfile: asset,
		logLevel: 'silent'
	});
	const handler = path.join(temporary, 'value-contracts-handler.mjs');
	await writeFile(
		handler,
		`${checks}
import {createExactServerDebugRuntime,handleExactRequest,defineExactOperationContract,createExactContextRuntime,openExactRequestScope} from '@exactjs/server';
import {renderToString,renderToHydratableString,renderToStream,renderToDocumentStream,renderToProgressiveHtmlStream} from '@exactjs/ssr';
import {createCompiledIntrinsicReceipt} from '@exactjs/core/runtime/component-operations';
import {verifySsrOptionOwnership,verifySsrOutputPolicy,verifySsrTraversalPolicy} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/ssr-option-ownership-journey.mjs'))};
import {verifySsrResultLinks,verifySsrHydrationObservations} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/ssr-result-observation-journey.mjs'))};
import {createChunkedStringResult,createChunkedHydratableResult} from ${JSON.stringify(path.join(root, 'packages/ssr/dist/render/output-result.js'))};
import {SsrHydrationTable} from ${JSON.stringify(path.join(root, 'packages/ssr/dist/render/hydration-table.js'))};
import {verifyRequestBodyPolicy} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/request-body-policy-journey.mjs'))};
import {readGatewayBody} from ${JSON.stringify(path.join(root, 'packages/server/dist/gateway/body.js'))};
import {verifyServerSecurity} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/server-security-journey.mjs'))};
import {verifyServerEventOwnership} from ${JSON.stringify(inspectionEventJourney)};
import {verifyServerRequestInspectionLifetime,verifyServerObservationByteBounds} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/server-request-inspection-journey.mjs'))};
import {verifyServerCatalogOwnership} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/server-catalog-journey.mjs'))};
export async function valueContractsResponse(request){
 if(new URL(request.url).pathname==='/value-contracts/client')return new Response(${JSON.stringify(await readFile(asset, 'utf8'))},{headers:{'content-type':'text/javascript'}});
 await verifySsrOptionOwnership({intrinsic:createCompiledIntrinsicReceipt,renderToString,renderToHydratableString,renderToStream,renderToDocumentStream,renderToProgressiveHtmlStream});
 await verifySsrOutputPolicy({intrinsic:createCompiledIntrinsicReceipt,renderToString,renderToHydratableString,renderToStream,renderToDocumentStream,renderToProgressiveHtmlStream});
 await verifySsrTraversalPolicy({intrinsic:createCompiledIntrinsicReceipt,renderToString});
 verifySsrResultLinks({createChunkedStringResult,createChunkedHydratableResult});
 verifySsrHydrationObservations({SsrHydrationTable});
 await verifyRequestBodyPolicy({handleExactRequest,defineExactOperationContract,readGatewayBody});
 await verifyServerEventOwnership({createExactServerDebugRuntime});
 await verifyServerRequestInspectionLifetime({createExactServerDebugRuntime,defineExactOperationContract,handleExactRequest});
 await verifyServerObservationByteBounds({createExactServerDebugRuntime,defineExactOperationContract,handleExactRequest});
 await verifyServerCatalogOwnership({createExactServerDebugRuntime});
 await verifyServerSecurity({handleExactRequest,defineExactOperationContract,createExactServerDebugRuntime,createExactContextRuntime,openExactRequestScope});
 return Response.json(await runChecks());
}`
	);
	return handler;
}

/** Executes the public scalar-value journey in the native host and Chromium with real package exports. */
export async function checkValueContracts(origin, browser) {
	assert.equal(await json(await request(new URL('/value-contracts', origin))), true);
	const page = await browser.newPage();
	try {
		await page.goto(new URL('/value-contracts', origin).href);
		assert.equal(
			await page.evaluate(async () => (await import('/value-contracts/client')).runChecks()),
			true
		);
	} finally {
		await page.close();
	}
}
