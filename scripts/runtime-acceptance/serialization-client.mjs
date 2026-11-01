import { observedRootFactorySource } from './browser-errors.mjs';
import path from 'node:path';

/** Installs built serialization and collection journeys in the acceptance browser realm. */
export function serializationClientSource(root) {
	return `${observedRootFactorySource()}
import {isJsonSafe as validateRuntimeJsonData} from ${JSON.stringify(path.join(root, 'packages/hydrate/dist/validation.js'))};
window.validateRuntimeJsonData=validateRuntimeJsonData;
import * as inspectionQueryDataApi from '@exactjs/devtools-protocol';
import {verifyInspectionQueryData} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/inspection-query-journey.ts'))};
import {verifyInspectionCatalogData} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/inspection-catalog-data-journey.ts'))};
import {verifyInspectionQueryLimits} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/inspection-query-limits-journey.ts'))};
window.verifyInspectionQueryData=()=>{verifyInspectionQueryData(inspectionQueryDataApi);verifyInspectionCatalogData(inspectionQueryDataApi);verifyInspectionQueryLimits(inspectionQueryDataApi);};
import {verifyReactiveProtocolCollections} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/reactive-protocol-journey.ts'))};
import * as reactiveProtocolApi from '@exactjs/reactive';
import {encodeValidatedReactiveCollection} from '@exactjs/reactive/framework/protocol';
import {verifyArrayEndMutations} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/array-end-mutation-journey.ts'))};
window.verifyReactiveProtocolCollections=()=>verifyReactiveProtocolCollections({...reactiveProtocolApi,encodeValidatedReactiveCollection});
import {verifyHydrationRecordState} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/hydration-record-journey.ts'))};
import {readExactHydrationConfig as readRecordConfig} from '@exactjs/hydrate';
window.verifyHydrationRecords=async()=>{
 const {script}=await(await fetch('/hydration-records')).json();
 const root=document.createElement('main');root.innerHTML=script;
 verifyHydrationRecordState(readRecordConfig(root).state);
};
window.verifyArrayEndMutations=()=>verifyArrayEndMutations(reactiveProtocolApi);
import {verifyListMarkerKeys,verifyMarkerEncoding,verifyMarkerSnapshots} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/list-marker-journey.ts'))};
import {applyPatches} from ${JSON.stringify(path.join(root, 'packages/hydrate/dist/patches.js'))};
import {encodeExactMarkerPart,decodeExactMarkerPart} from '@exactjs/core';
window.verifyListMarkerKeys=()=>{verifyMarkerEncoding({encodeExactMarkerPart,decodeExactMarkerPart});verifyListMarkerKeys({encodeExactMarkerPart,applyPatches},document);};
window.verifyMarkerSnapshots=(snapshots)=>verifyMarkerSnapshots({encodeExactMarkerPart,applyPatches},document,snapshots);
import * as collectionInvocationApi from ${JSON.stringify(path.join(root, 'packages/hydrate/dist/invocations.js'))};
import {verifyInvocationCollectionTransports,verifyStatePatchPublication} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/invocation-collection-journey.ts'))};
window.verifyInvocationCollectionTransports=async()=>{await verifyInvocationCollectionTransports({...collectionInvocationApi,encodeReactiveProtocolValue:reactiveProtocolApi.encodeReactiveProtocolValue},new URL('/operations',location.href).href);verifyStatePatchPublication({applyPatches,...reactiveProtocolApi},document);};
import {verifyContinuationStateResponses} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/continuation-state-journey.ts'))};
import {createExactClient as createStateClient} from '@exactjs/hydrate';
import {verifyHydrationCancellation} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/hydration-cancellation-journey.ts'))};
import {readNdjsonEvents} from ${JSON.stringify(path.join(root, 'packages/hydrate/dist/response/ndjson.js'))};
window.verifyContinuationStateResponses=async()=>{await verifyContinuationStateResponses({createExactClient:createStateClient},document);await verifyHydrationCancellation({createExactClient:createStateClient,readNdjsonEvents},document);};
import {verifyFetcherFormLifecycle,verifyGetFormSubmission,verifyNavigationFormFailure} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/router-fetcher-form-journey.ts'))};
import {verifyRouterRelativePaths,verifyMemoDestinations} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/router-relative-journey.ts'))};
import {verifyFormActionDefaults,verifyIndexFormActions,verifySubmissionEncodings} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/router-form-action-journey.ts'))};
import {verifyFetcherTargets,verifyFetcherDataTargets,verifyDataActionTargets} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/router-fetcher-target-journey.ts'))};
import {verifyFetcherPublication,verifyFetcherAbortReplacement,verifyFetcherPublicationFailure} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/router-fetcher-publication-journey.ts'))};
import {verifyNavigationAbortOwnership,verifyRevalidationAbortOwnership} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/router-operation-ownership-journey.ts'))};
import {verifyStaticQueryCancellation,verifyHandlerRequestSignals,verifyStaticRequestDetails,verifyCallerRequestCancellation,verifyDelegatedRequestCancellation} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/router-request-cancellation-journey.ts'))};
import {verifySingleRouteQueries} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/static-route-query-journey.ts'))};
import {verifyRouteMatching,verifyRouteMatchingTransitions,verifyParentRoutePresentation,verifyCompatibilityBasenames} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/router-matching-journey.ts'))};
import {verifyRouteRecords,verifyRouteRecordReaders} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/router-record-journey.ts'))};
import * as routerFormApi from ${JSON.stringify(path.join(root, 'component-libraries/router/src/modern.ts'))};
import {act,createElement,memo} from '@exactjs/react-compat';
import {createRoot as createCompatibilityRoot} from '@exactjs/react-dom-compat/client19';
window.verifyRouterFormJourneys=async()=>{
 const api={...routerFormApi,act,createElement,memo,createRoot:observedRoot(createCompatibilityRoot)};
 for(const mode of ['history','hash']){
  const paths={...api,...routerNavigationApi};
  await verifyRouterRelativePaths(paths,document,mode);
  await verifyMemoDestinations(paths,document,mode);
  await verifyFormActionDefaults(paths,document,mode);
  await verifyIndexFormActions(paths,document,mode);
 }
 await verifySubmissionEncodings({...api,...routerNavigationApi},document);
 await verifyFetcherTargets(api,document);
 await verifyFetcherDataTargets(routerNavigationApi);
 await verifyDataActionTargets(routerNavigationApi);
 await verifyFetcherPublication(routerNavigationApi);
 await verifyFetcherAbortReplacement(routerNavigationApi);
 await verifyFetcherPublicationFailure(routerNavigationApi);
 await verifyNavigationAbortOwnership(routerNavigationApi);
 await verifyRevalidationAbortOwnership(routerNavigationApi);
 await verifyStaticQueryCancellation(routerFormApi);
 await verifyStaticRequestDetails(routerFormApi);
 await verifyHandlerRequestSignals(routerNavigationApi);
 await verifyCallerRequestCancellation(routerNavigationApi);
 await verifyDelegatedRequestCancellation(routerNavigationApi);
 await verifySingleRouteQueries(routerFormApi);
 verifyRouteMatching(routerNavigationApi);
 verifyCompatibilityBasenames(routerFormApi);
 await verifyRouteMatchingTransitions(routerNavigationApi);
 await verifyParentRoutePresentation(api,document);
 await verifyRouteRecords({...routerNavigationApi,createStaticHandler:routerFormApi.createStaticHandler});
 await verifyRouteRecordReaders(api,document);
 await verifyFetcherFormLifecycle(api,document);
 await verifyGetFormSubmission(api,document,false);
 await verifyGetFormSubmission(api,document,true);
 await verifyNavigationFormFailure(api,document);
};
import {verifyRouterRedirectFailures,verifyRouterPublicationData,verifyRouterFailureOwnership} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/router-navigation-journey.ts'))};
import * as routerNavigationApi from ${JSON.stringify(path.join(root, 'component-libraries/router/src/core.ts'))};
window.verifyRouterNavigation=async()=>{
 await verifyRouterRedirectFailures(routerNavigationApi);
 await verifyRouterPublicationData(routerNavigationApi);
 await verifyRouterFailureOwnership(routerNavigationApi);
};`;
}
