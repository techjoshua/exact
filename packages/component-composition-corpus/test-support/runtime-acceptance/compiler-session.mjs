import { createCompilerSession, inspectExactClientArtifactIsolation } from '@exactjs/compiler';
import { createExactPublishedComponentBuildFacts } from '@exactjs/compiler/component-library-build';
import {
	exactEnhancementFacadeRequest,
	parseExactEnhancementFacadeRequest
} from '@exactjs/compiler/adapter-support';
import {
	verifyCompilerBuildValues,
	verifyCompilerSessionValues
} from '../compiler-observation-journey.mjs';

verifyCompilerSessionValues({ createCompilerSession });

verifyCompilerBuildValues({
	createExactPublishedComponentBuildFacts,
	inspectExactClientArtifactIsolation,
	exactEnhancementFacadeRequest,
	parseExactEnhancementFacadeRequest
});
