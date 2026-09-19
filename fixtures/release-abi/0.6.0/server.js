import { createPreparedServerComponentReference as __exactComponentReceipt, createPreparedServerKeyedChild as __exactKeyedChild, createPreparedServerRenderProgram as __exactPreparedServerRenderProgram, prepareCompiledRenderProgram as __exactPrepareRenderProgram } from "@exactjs/core/framework/server-render-structure";
import { registerDirectSsrLifecycleHandler as __exactRegisterDirectSsrLifecycle } from "@exactjs/ssr/runtime/direct-lifecycle";
import { issueExactServerComponent as __exactIssueServerComponent_1, writeExactServerComponent as __exactWriteServerComponent_1, disposeExactServerComponent as __exactDisposeServerComponent_1 } from "@exactjs/core/runtime/component-operations";
import { rejectDirectServerComponentConstruction as __exactRejectDirectServerConstruction_1 } from "@exactjs/core/runtime/component-construction/direct-server";
import { directSsrLifecycle as __exactDirectSsrLifecycle_1 } from "@exactjs/ssr/runtime/direct-lifecycle";
const __exactComponentContract_1 = /* @__PURE__ */ Symbol.for("@exactjs/component-contract");
const __exact_render_program_1 = /* @__PURE__ */ __exactPrepareRenderProgram({ version: 2, id: "xq4fcKEnCFSmShiD2oYmtqI", namespace: "html", ssrRootStatic: [" id=\"positive\"", ["id"], []], ssr: (__exactSsr, __exactContext, __exactInvocation, __exactOutput) => {
        const __exactValue_0 = __exactInvocation.eagerValues[0];
        __exactSsr.begin(__exactContext, 1, 1, 25, 25);
        let __exactCharacters = 25;
        __exactCharacters = __exactSsr.rootOpening(__exactContext, __exactOutput, __exactValue_0, "strong", "<strong", ">positive</strong>", __exactCharacters, __exactInvocation.program.ssrRootStatic);
        const __exactDrain = __exactOutput.sink.ready();
        if (__exactDrain)
            return __exactDrain.then(() => __exactOutput);
        return __exactOutput;
    }, ssrHost: "strong" });
const __exact_server_invocation_1 = /* @__PURE__ */ __exactPreparedServerRenderProgram(__exact_render_program_1, [{ id: "positive" }]);
const __exact_render_program_2 = /* @__PURE__ */ __exactPrepareRenderProgram({ version: 2, id: "xaECfS9R8QZ6nCyQ9Zf4pQU", namespace: "html", ssrRootStatic: ["", [], [[0, "data-id", "data-id"]], __exactRootValue => ({ "data-id": __exactRootValue })], ssr: function __exactRun(__exactSsr, __exactContext, __exactInvocation, __exactOutput, __exactFrame) {
        let __exactValue_0, __exactValue_1, __exactCharacters, __exactStage = 0, __exactSettled, __exactPending;
        if (__exactFrame) {
            __exactValue_0 = __exactFrame[6];
            __exactValue_1 = __exactFrame[7];
            __exactCharacters = __exactFrame[8];
            __exactStage = __exactFrame[4];
            __exactSettled = __exactFrame[5];
        }
        else {
            __exactValue_0 = __exactInvocation.eagerValues[0];
            __exactValue_1 = __exactSsr.prepareText(__exactInvocation, 1);
            if (__exactValue_1 === __exactSsr.unprepared)
                return;
            __exactSsr.begin(__exactContext, 1, 2, 9, 9);
            __exactCharacters = 9;
        }
        switch (__exactStage) {
            case 0: __exactSettled = __exactSsr.rootOpening(__exactContext, __exactOutput, __exactValue_0, "li", "<li", ">", __exactCharacters, __exactInvocation.program.ssrRootStatic);
            case 1:
                __exactCharacters = __exactSettled;
                const __exactDrain_0 = __exactOutput.sink.ready();
                if (__exactDrain_0) {
                    __exactPending = __exactDrain_0;
                    __exactStage = 2;
                    break;
                }
            case 2: __exactSettled = __exactSsr.text(__exactContext, __exactOutput, __exactValue_1, "0", __exactCharacters, true, "", "</li>");
            case 3:
                __exactCharacters = __exactSettled;
                const __exactDrain_1 = __exactOutput.sink.ready();
                if (__exactDrain_1) {
                    __exactPending = __exactDrain_1;
                    __exactStage = 4;
                    break;
                }
            case 4: return __exactOutput;
        }
        {
            const __exactSaved = [__exactSsr, __exactContext, __exactInvocation, __exactOutput, __exactStage, void 0, __exactValue_0, __exactValue_1, __exactCharacters];
            return (__exactPending).then(__exactResult => {
                __exactSaved[5] = __exactResult;
                return __exactRun(__exactSaved[0], __exactSaved[1], __exactSaved[2], __exactSaved[3], __exactSaved);
            });
        }
    }, ssrHost: "li" });
const __exact_render_program_3 = /* @__PURE__ */ __exactPrepareRenderProgram({ version: 2, id: "xTBvyKkmxmyM17MZIkk2OoQ", namespace: "html", ssrRootStatic: [" data-exact-id=\"xqA1LrqzuljjoRDu-k9F_es\"", ["data-exact-id"], []], ssr: function __exactRun(__exactSsr, __exactContext, __exactInvocation, __exactOutput, __exactFrame) {
        let __exactValue_0, __exactValue_1, __exactValue_2, __exactValue_3, __exactCharacters, __exactStage = 0, __exactSettled, __exactPending;
        if (__exactFrame) {
            __exactValue_0 = __exactFrame[6];
            __exactValue_1 = __exactFrame[7];
            __exactValue_2 = __exactFrame[8];
            __exactValue_3 = __exactFrame[9];
            __exactCharacters = __exactFrame[10];
            __exactStage = __exactFrame[4];
            __exactSettled = __exactFrame[5];
        }
        else {
            __exactValue_0 = __exactInvocation.eagerValues[0];
            __exactValue_1 = __exactSsr.prepareText(__exactInvocation, 1);
            if (__exactValue_1 === __exactSsr.unprepared)
                return;
            __exactValue_2 = __exactSsr.prepareChild(__exactInvocation, 2);
            if (__exactValue_2 === __exactSsr.unprepared)
                return;
            __exactValue_3 = __exactSsr.prepareChild(__exactInvocation, 3);
            if (__exactValue_3 === __exactSsr.unprepared)
                return;
            __exactSsr.begin(__exactContext, 4, 4, 103, 103);
            __exactCharacters = 103;
        }
        switch (__exactStage) {
            case 0: __exactSettled = __exactSsr.rootOpening(__exactContext, __exactOutput, __exactValue_0, "section", "<section", "><button id=\"increment\">", __exactCharacters, __exactInvocation.program.ssrRootStatic);
            case 1:
                __exactCharacters = __exactSettled;
                const __exactDrain_0 = __exactOutput.sink.ready();
                if (__exactDrain_0) {
                    __exactPending = __exactDrain_0;
                    __exactStage = 2;
                    break;
                }
            case 2: __exactSettled = __exactSsr.text(__exactContext, __exactOutput, __exactValue_1, "0", __exactCharacters, true, "Count ", "</button><button id=\"reverse\">Reverse</button>");
            case 3:
                __exactCharacters = __exactSettled;
                const __exactDrain_1 = __exactOutput.sink.ready();
                if (__exactDrain_1) {
                    __exactPending = __exactDrain_1;
                    __exactStage = 4;
                    break;
                }
            case 4:
                __exactSettled = __exactSsr.child(__exactContext, __exactOutput, __exactValue_2, "1", __exactCharacters);
                if (__exactSettled instanceof __exactSsr.promise) {
                    __exactPending = __exactSettled;
                    __exactStage = 5;
                    break;
                }
            case 5:
                __exactCharacters = __exactSettled;
                const __exactDrain_2 = __exactOutput.sink.ready();
                if (__exactDrain_2) {
                    __exactPending = __exactDrain_2;
                    __exactStage = 6;
                    break;
                }
            case 6: __exactSettled = __exactSsr.static(__exactOutput, "<ul>");
            case 7:
                const __exactDrain_3 = __exactOutput.sink.ready();
                if (__exactDrain_3) {
                    __exactPending = __exactDrain_3;
                    __exactStage = 8;
                    break;
                }
            case 8:
                __exactSettled = __exactSsr.keyedChild(__exactOutput, __exactValue_3);
                if (__exactSettled instanceof __exactSsr.promise) {
                    __exactPending = __exactSettled;
                    __exactStage = 9;
                    break;
                }
            case 9:
                const __exactDrain_4 = __exactOutput.sink.ready();
                if (__exactDrain_4) {
                    __exactPending = __exactDrain_4;
                    __exactStage = 10;
                    break;
                }
            case 10: __exactSettled = __exactSsr.static(__exactOutput, "</ul></section>");
            case 11:
                const __exactDrain_5 = __exactOutput.sink.ready();
                if (__exactDrain_5) {
                    __exactPending = __exactDrain_5;
                    __exactStage = 12;
                    break;
                }
            case 12: return __exactOutput;
        }
        {
            const __exactSaved = [__exactSsr, __exactContext, __exactInvocation, __exactOutput, __exactStage, void 0, __exactValue_0, __exactValue_1, __exactValue_2, __exactValue_3, __exactCharacters];
            return (__exactPending).then(__exactResult => {
                __exactSaved[5] = __exactResult;
                return __exactRun(__exactSaved[0], __exactSaved[1], __exactSaved[2], __exactSaved[3], __exactSaved);
            });
        }
    }, targetSlots: [2, 3], ssrHost: "section" });
const __exactImplementation_Counter_1 = function Counter() {
    this.state.count = 0;
    this.state.rows = [
        { id: 1, label: 'one' },
        { id: 2, label: 'two' }
    ];
    __exactRegisterDirectSsrLifecycle(this, "unmount", () => {
        globalThis.exactAbiDisposals++;
    });
    ;
    return (__exactPreparedServerRenderProgram(__exact_render_program_3, [{ "data-exact-id": "xqA1LrqzuljjoRDu-k9F_es" }, this.state.count, this.state.count > 0 && __exact_server_invocation_1, this.state.rows.map((row) => __exactKeyedChild((__exactPreparedServerRenderProgram(__exact_render_program_2, [row.id, row.label])), row.id, true))]));
};
const Counter = /* @__PURE__ */ (() => Object.assign(__exactImplementation_Counter_1, {
    [Symbol.for("@exactjs/component")]: "xxaa9X1HXUH62UXr0WszX5B",
    [__exactComponentContract_1]: {
        version: 2,
        placement: "isomorphic",
        role: "executor",
        implementations: [
            { id: "xVJkE5HNRiiG4fIPdvMPhYf", name: "Counter_ExactServer_1", role: "server-part", implementation: __exactImplementation_Counter_1 }
        ],
        continuations: [],
        executors: [],
        boundaries: [],
        artifact: {
            version: 2,
            target: "server",
            id: "xxaa9X1HXUH62UXr0WszX5B",
            instantiate: __exactImplementation_Counter_1,
            construct: __exactRejectDirectServerConstruction_1,
            abi: 3,
            capabilities: [
                "resumption"
            ],
            state: [
                "count",
                "rows"
            ],
            props: [],
            issue: __exactIssueServerComponent_1,
            write: __exactWriteServerComponent_1,
            dispose: __exactDisposeServerComponent_1,
            execution: {
                version: 1,
                classification: "synchronous",
                lane: "direct",
                render: __exactImplementation_Counter_1,
                mode: "direct",
                lifecycle: __exactDirectSsrLifecycle_1
            },
            tasks: [],
            reactive: [
                {
                    name: "increment",
                    provenance: "unknown",
                    allocation: "constant",
                    dependencies: []
                },
                {
                    name: "this",
                    provenance: "state",
                    allocation: "live-slot",
                    dependencies: []
                }
            ],
            render: "returned-function"
        },
        resumption: {
            componentId: "xxaa9X1HXUH62UXr0WszX5B",
            statePaths: [
                "count",
                "rows"
            ],
            stateInputs: [],
            valueCaptures: [],
            contexts: [],
            boundaries: [],
            stateDefaults: [
                [
                    "count",
                    0
                ]
            ]
        }
    }
}))();
/** Supplies a compiler-branded root operation from the preserved baseline component. */
export function view() {
    return __exactComponentReceipt(Counter, {});
}
export { Counter as Counter_ExactServer_1 };
