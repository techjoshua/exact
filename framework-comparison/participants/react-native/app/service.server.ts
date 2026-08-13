import { createNativeIncidentService } from '../../../src/native-incident-service.mjs';

/** Process-local domain service reached exclusively through React Router loaders and actions. */
export const incidentService = createNativeIncidentService();
