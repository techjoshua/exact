import { createPreparedRenderProgram as __exactPreparedRenderProgram, prepareCompiledRenderProgram as __exactPrepareRenderProgram } from "@exactjs/core/runtime/render-operations";
import { readIndexedReactiveSlot as __exactReadState, writeIndexedReactiveValue as __exactWriteState, updateIndexedReactiveValueWithResult as __exactUpdateStateResult, mutateReactiveArray as __exactArrayMutation } from "@exactjs/core/runtime/reactivity";
import { defineTask as __exactDefineTask, bindTaskForHost as __exactBindTask } from "@exactjs/core/runtime/tasks";
import { mapExactCompiledKeyedChildren as __exactMapKeyedChildren } from "@exactjs/core/runtime/lists";
import "@exactjs/core/runtime/component-execution";
import { applyCompiledProgramText as __exactApplyProgramText } from "@exactjs/dom/runtime/render-program";
import { registerComponentLifecycleHandler as __exactRegisterLifecycle } from "@exactjs/core/framework/component-lifecycle";
import { createCompiledComponentReceipt as __exactComponentReceipt } from "@exactjs/core/runtime/component-operations";
import { attachExactCompiledClientComponent as __exactAttachClientComponent_1, receiveExactClientComponentProps as __exactReceiveClientProps_1, disposeExactClientComponent as __exactDisposeClientComponent_1 } from "@exactjs/core/runtime/component-operations";
import { constructDurableComponentInstance as __exactConstructDurableComponent_1 } from "@exactjs/core/runtime/component-construction/durable";
const __exactComponentContract_1 = /* @__PURE__ */ Symbol.for("@exactjs/component-contract");
const __exact_component_updates_1 = { bindings: [[0, 1, 0]], apply: (__exactTargets, __exactDirtyLow, __exactDirtyHigh) => {
        const __exactTarget0 = __exactTargets[0];
        if (__exactTarget0) {
            if ((__exactDirtyLow & 1) !== 0)
                __exactApplyProgramText(__exactTarget0, 1, 0, 0, "Count ", "");
        }
    } };
const __exact_render_program_1 = /* @__PURE__ */ __exactPrepareRenderProgram({ version: 2, id: "xq4fcKEnCFSmShiD2oYmtqI", namespace: "html", ssrRootStatic: [" id=\"positive\"", ["id"], []], template: "<strong id=\"positive\">positive</strong>", root: ["strong"], work: [1, 0], directClaims: true, ssr: (__exactSsr, __exactContext, __exactInvocation, __exactOutput) => {
        __exactSsr.begin(__exactContext, 1, 0, 39, 39);
        let __exactCharacters = 39;
        __exactSsr.static(__exactOutput, "<strong id=\"positive\">positive</strong>");
        const __exactDrain = __exactOutput.sink.ready();
        if (__exactDrain)
            return __exactDrain.then(() => __exactOutput);
        return __exactOutput;
    } });
const __exact_render_program_2 = /* @__PURE__ */ __exactPrepareRenderProgram({ version: 2, id: "xaECfS9R8QZ6nCyQ9Zf4pQU", namespace: "html", ssrRootStatic: ["", [], [[0, "data-id", "data-id"]]], template: "<li><!---->\uE000exact:1\uE001<!----></li>", wire: [["li", "html", 1, 2], [[3, 1, 0, true], [7, 0, 0]], [[0, 1], [5, 0, 0]]], directClaims: true, ssr: function __exactRun(__exactSsr, __exactContext, __exactInvocation, __exactOutput, __exactFrame) {
        let __exactValue_0, __exactValue_1, __exactCharacters, __exactStage = 0, __exactSettled, __exactPending;
        if (__exactFrame) {
            __exactValue_0 = __exactFrame[6];
            __exactValue_1 = __exactFrame[7];
            __exactCharacters = __exactFrame[8];
            __exactStage = __exactFrame[4];
            __exactSettled = __exactFrame[5];
        }
        else {
            __exactValue_0 = __exactSsr.prepareAttribute(__exactInvocation, 0);
            if (__exactValue_0 === __exactSsr.unprepared)
                return;
            __exactValue_1 = __exactSsr.prepareText(__exactInvocation, 1);
            if (__exactValue_1 === __exactSsr.unprepared)
                return;
            __exactSsr.begin(__exactContext, 1, 2, 9, 9);
            __exactCharacters = 9;
        }
        switch (__exactStage) {
            case 0: __exactSettled = __exactSsr.static(__exactOutput, "<li");
            case 1:
                const __exactDrain_0 = __exactOutput.sink.ready();
                if (__exactDrain_0) {
                    __exactPending = __exactDrain_0;
                    __exactStage = 2;
                    break;
                }
            case 2: __exactSettled = __exactSsr.compiledAttribute(__exactContext, __exactOutput, __exactValue_0, 0, "data-id", "data-id", "li", __exactCharacters);
            case 3:
                __exactCharacters = __exactSettled;
                const __exactDrain_1 = __exactOutput.sink.ready();
                if (__exactDrain_1) {
                    __exactPending = __exactDrain_1;
                    __exactStage = 4;
                    break;
                }
            case 4: __exactSettled = __exactSsr.text(__exactContext, __exactOutput, __exactValue_1, "0", __exactCharacters, true, ">", "</li>");
            case 5:
                __exactCharacters = __exactSettled;
                const __exactDrain_2 = __exactOutput.sink.ready();
                if (__exactDrain_2) {
                    __exactPending = __exactDrain_2;
                    __exactStage = 6;
                    break;
                }
            case 6: return __exactOutput;
        }
        {
            const __exactSaved = [__exactSsr, __exactContext, __exactInvocation, __exactOutput, __exactStage, void 0, __exactValue_0, __exactValue_1, __exactCharacters];
            return (__exactPending).then(__exactResult => {
                __exactSaved[5] = __exactResult;
                return __exactRun(__exactSaved[0], __exactSaved[1], __exactSaved[2], __exactSaved[3], __exactSaved);
            });
        }
    } });
const __exact_render_program_3 = /* @__PURE__ */ __exactPrepareRenderProgram({ version: 2, id: "xTBvyKkmxmyM17MZIkk2OoQ", namespace: "html", ssrRootStatic: ["", [], []], template: "<section><button id=\"increment\"><!---->\uE000exact:1\uE001<!----></button><button id=\"reverse\">Reverse</button><!--x:1--><!--/x:1--><ul></ul></section>", wire: [["section", "html", 4, 5], [[0, 1, 0, "button"], [1, 1], [3, 1, 0, true], [2], [5, 3, 1, "1"], [0, 3, 0, "ul"], [1, 3], [4, 4, 0], [2], [7, 0, 1], [6, 2, 17, "button"], [7, 2, 2]], [[11, 1, ["Count ", "", true, 0, 0]], [1, 3], [3, 4], [5, 0, 0], [5, 1, 2], [9, 0, __exact_component_updates_1]]], directClaims: true, keyedChildren: 16, ssr: function __exactRun(__exactSsr, __exactContext, __exactInvocation, __exactOutput, __exactFrame) {
        let __exactValue_0, __exactValue_1, __exactValue_2, __exactValue_3, __exactValue_4, __exactCharacters, __exactStage = 0, __exactSettled, __exactPending;
        if (__exactFrame) {
            __exactValue_0 = __exactFrame[6];
            __exactValue_1 = __exactFrame[7];
            __exactValue_2 = __exactFrame[8];
            __exactValue_3 = __exactFrame[9];
            __exactValue_4 = __exactFrame[10];
            __exactCharacters = __exactFrame[11];
            __exactStage = __exactFrame[4];
            __exactSettled = __exactFrame[5];
        }
        else {
            __exactValue_0 = __exactSsr.prepareAttribute(__exactInvocation, 0);
            if (__exactValue_0 === __exactSsr.unprepared)
                return;
            __exactValue_1 = __exactSsr.prepareText(__exactInvocation, 1);
            if (__exactValue_1 === __exactSsr.unprepared)
                return;
            __exactValue_2 = __exactSsr.prepareAttribute(__exactInvocation, 2);
            if (__exactValue_2 === __exactSsr.unprepared)
                return;
            __exactValue_3 = __exactSsr.prepareChild(__exactInvocation, 3);
            if (__exactValue_3 === __exactSsr.unprepared)
                return;
            __exactValue_4 = __exactSsr.prepareChild(__exactInvocation, 4);
            if (__exactValue_4 === __exactSsr.unprepared)
                return;
            __exactSsr.begin(__exactContext, 4, 5, 103, 103);
            __exactCharacters = 103;
        }
        switch (__exactStage) {
            case 0: __exactSettled = __exactSsr.static(__exactOutput, "<section><button id=\"increment\"");
            case 1:
                const __exactDrain_0 = __exactOutput.sink.ready();
                if (__exactDrain_0) {
                    __exactPending = __exactDrain_0;
                    __exactStage = 2;
                    break;
                }
            case 2: __exactSettled = __exactSsr.compiledAttribute(__exactContext, __exactOutput, __exactValue_0, 0, "__exactClosedInteraction:onClick", "__exactClosedInteraction:onClick", "button", __exactCharacters);
            case 3:
                __exactCharacters = __exactSettled;
                const __exactDrain_1 = __exactOutput.sink.ready();
                if (__exactDrain_1) {
                    __exactPending = __exactDrain_1;
                    __exactStage = 4;
                    break;
                }
            case 4: __exactSettled = __exactSsr.text(__exactContext, __exactOutput, __exactValue_1, "0", __exactCharacters, true, ">Count ", "</button><button id=\"reverse\"");
            case 5:
                __exactCharacters = __exactSettled;
                const __exactDrain_2 = __exactOutput.sink.ready();
                if (__exactDrain_2) {
                    __exactPending = __exactDrain_2;
                    __exactStage = 6;
                    break;
                }
            case 6: __exactSettled = __exactSsr.compiledAttribute(__exactContext, __exactOutput, __exactValue_2, 0, "__exactClosedInteraction:onClick", "__exactClosedInteraction:onClick", "button", __exactCharacters);
            case 7:
                __exactCharacters = __exactSettled;
                const __exactDrain_3 = __exactOutput.sink.ready();
                if (__exactDrain_3) {
                    __exactPending = __exactDrain_3;
                    __exactStage = 8;
                    break;
                }
            case 8: __exactSettled = __exactSsr.static(__exactOutput, ">Reverse</button>");
            case 9:
                const __exactDrain_4 = __exactOutput.sink.ready();
                if (__exactDrain_4) {
                    __exactPending = __exactDrain_4;
                    __exactStage = 10;
                    break;
                }
            case 10:
                __exactSettled = __exactSsr.child(__exactContext, __exactOutput, __exactValue_3, "1", __exactCharacters);
                if (__exactSettled instanceof __exactSsr.promise) {
                    __exactPending = __exactSettled;
                    __exactStage = 11;
                    break;
                }
            case 11:
                __exactCharacters = __exactSettled;
                const __exactDrain_5 = __exactOutput.sink.ready();
                if (__exactDrain_5) {
                    __exactPending = __exactDrain_5;
                    __exactStage = 12;
                    break;
                }
            case 12: __exactSettled = __exactSsr.static(__exactOutput, "<ul>");
            case 13:
                const __exactDrain_6 = __exactOutput.sink.ready();
                if (__exactDrain_6) {
                    __exactPending = __exactDrain_6;
                    __exactStage = 14;
                    break;
                }
            case 14:
                __exactSettled = __exactSsr.keyedChild(__exactOutput, __exactValue_4);
                if (__exactSettled instanceof __exactSsr.promise) {
                    __exactPending = __exactSettled;
                    __exactStage = 15;
                    break;
                }
            case 15:
                const __exactDrain_7 = __exactOutput.sink.ready();
                if (__exactDrain_7) {
                    __exactPending = __exactDrain_7;
                    __exactStage = 16;
                    break;
                }
            case 16: __exactSettled = __exactSsr.static(__exactOutput, "</ul></section>");
            case 17:
                const __exactDrain_8 = __exactOutput.sink.ready();
                if (__exactDrain_8) {
                    __exactPending = __exactDrain_8;
                    __exactStage = 18;
                    break;
                }
            case 18: return __exactOutput;
        }
        {
            const __exactSaved = [__exactSsr, __exactContext, __exactInvocation, __exactOutput, __exactStage, void 0, __exactValue_0, __exactValue_1, __exactValue_2, __exactValue_3, __exactValue_4, __exactCharacters];
            return (__exactPending).then(__exactResult => {
                __exactSaved[5] = __exactResult;
                return __exactRun(__exactSaved[0], __exactSaved[1], __exactSaved[2], __exactSaved[3], __exactSaved);
            });
        }
    }, targetSlots: [3, 4] });
const __exactImplementation_Counter_1 = function Counter() {
    __exactWriteState(this.state, 0, 0);
    __exactWriteState(this.state, 1, [
        { id: 1, label: 'one' },
        { id: 2, label: 'two' }
    ]);
    __exactRegisterLifecycle(this, "unmount", () => {
        globalThis.exactAbiDisposals++;
    });
    const increment = __exactBindTask(this, __exactDefineTask({
        label: "increment",
        placement: "client",
        priority: "normal",
        concurrency: "parallel",
        readiness: "nonblocking"
    }, (_task) => {
        __exactUpdateStateResult(this.state, 0, previous => {
            const result = previous++;
            return [previous, result];
        });
    }));
    return () => (__exactPreparedRenderProgram(__exact_render_program_3, __exactSlot => __exactSlot === 0 ? () => increment() : __exactSlot === 2 ? () => __exactArrayMutation(this.state, ["rows"], "reverse", () => []) : __exactSlot === 3 ? __exactReadState(this.state, 0) > 0 && __exactPreparedRenderProgram(__exact_render_program_1, [], this) : __exactSlot === 4 ? __exactMapKeyedChildren(this, __exactReadState(this.state, 1), row => row.id, (row) => (__exactPreparedRenderProgram(__exact_render_program_2, __exactSlot => __exactSlot === 0 ? row.id : row.label, this, (__exactGroup, __exactApply) => {
        if (__exactGroup === 0) {
            __exactApply("data-id", row.id);
        }
    })), "xj1i1Hr1hGbTXyCdxCkb2Uu", undefined, "member:id") : undefined, this, (__exactGroup, __exactApply) => {
        if (__exactGroup === 0) {
            __exactApply("__exactClosedInteraction:onClick", () => increment());
        }
        if (__exactGroup === 1) {
            __exactApply("__exactClosedInteraction:onClick", () => __exactArrayMutation(this.state, ["rows"], "reverse", () => []));
        }
    }));
};
const Counter = /* @__PURE__ */ (() => Object.assign(__exactImplementation_Counter_1, {
    [Symbol.for("@exactjs/component")]: "xxaa9X1HXUH62UXr0WszX5B",
    [__exactComponentContract_1]: {
        version: 2,
        placement: "isomorphic",
        role: "client",
        implementations: [
            { id: "x9Qx0Zk_hlso7nzlPFgHy4-", name: "Counter", role: "root", implementation: __exactImplementation_Counter_1 }
        ],
        continuations: [],
        executors: [],
        boundaries: [],
        artifact: {
            version: 2,
            target: "client",
            id: "xxaa9X1HXUH62UXr0WszX5B",
            instantiate: __exactImplementation_Counter_1,
            construct: __exactConstructDurableComponent_1,
            abi: 15,
            capabilities: [
                "tasks",
                "resumption",
                "interactions"
            ],
            state: [
                "count",
                "rows"
            ],
            props: [],
            attach: __exactAttachClientComponent_1,
            receive: __exactReceiveClientProps_1,
            dispose: __exactDisposeClientComponent_1,
            updates: __exact_component_updates_1,
            tasks: [
                "xw_hRmEuX6pTogJbyx6pvOs"
            ],
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
        execution: {
            version: 1,
            ports: [
                [
                    "state",
                    "count",
                    "output"
                ]
            ],
            transitions: [
                [
                    "xw_hRmEuX6pTogJbyx6pvOs",
                    "xw_hRmEuX6pTogJbyx6pvOs",
                    "interaction",
                    "client",
                    "nonblocking",
                    "parallel",
                    [],
                    [
                        0
                    ]
                ]
            ],
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
            ]
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
            boundaries: []
        }
    }
}))();
/** Supplies a compiler-branded root operation from the preserved baseline component. */
export function view() {
    return __exactComponentReceipt(Counter, {});
}
