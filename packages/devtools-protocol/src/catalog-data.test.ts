import { it } from 'vitest';
import { isExactBuildInspectionCatalog, isExactInspectionRuntimeId } from './identity.js';
import { verifyInspectionCatalogData } from '../../component-composition-corpus/test-support/inspection-catalog-data-journey.js';
it('rejects authored catalog fields and array slots without executing them', () =>
	verifyInspectionCatalogData({ isExactBuildInspectionCatalog, isExactInspectionRuntimeId }));
