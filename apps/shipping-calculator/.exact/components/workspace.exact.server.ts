import { writeReactiveLazy as __exactWrite } from "@exactjs/core";
import { peek, type Component } from '@exactjs/core';
import type { InitialModel, ProviderResult, RouteResult, ShipmentDraft } from "../../src/types.js";
import { renderWorkspace } from "./workspace/view.exact.server.js";
import type { WorkspaceState } from "../../src/components/workspace/contracts.js";
import { cloneDraft, createWorkspaceInputs } from "../../src/components/workspace/inputs.js";
/** Performs the calculator workspace domain operation. */
export function CalculatorWorkspace(this: Component<WorkspaceState>, props: {
    initial: InitialModel;
}) {
    __exactWrite(this.state, ["draft"], () => peek(() => cloneDraft(props.initial.draft)));
    __exactWrite(this.state, ["providers"], () => peek(() => props.initial.providers));
    __exactWrite(this.state, ["route"], () => peek(() => props.initial.route));
    __exactWrite(this.state, ["revision"], () => 0);
    __exactWrite(this.state, ["loading"], () => []);
    __exactWrite(this.state, ["error"], () => undefined);
    __exactWrite(this.state, ["sort"], () => 'recommended');
    __exactWrite(this.state, ["enabledFilters"], () => peek(() => [...props.initial.configuredProviders]));
    __exactWrite(this.state, ["restored"], () => false);
    void 0;
    void 0;
    const inputs = createWorkspaceInputs(this.state);
    return () => renderWorkspace(this.state, props, inputs);
}
//# sourceMappingURL=workspace.exact.server.ts.map
