package exactcompiler

import (
	"encoding/base64"
	"strings"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/core"
	"github.com/microsoft/TypeScript/tsc/internal/printer"
)

// The emitted fixture is also executed by the Node/Bun continuation audit. Go tests keep
// native compiler validation independent of installed JavaScript runtimes.
func TestSsrSinkContinuationEmission(t *testing.T) {
	context := printer.NewEmitContext()
	lowering := jsxLowering{factory: context.Factory}
	writer := lowering.directRenderProgramSsrSinkWriter(&renderProgramBuild{
		serverSegments: []string{"<main>", "|", "</main>"},
		serverSlots:    []int{0, 1},
		slots:          []renderProgramSlot{{kind: "child", id: "first"}, {kind: "child", id: "second"}},
	})
	emitter := printer.NewPrinter(printer.PrinterOptions{NewLine: core.NewLineKindLF, Target: core.ScriptTargetES2022}, printer.PrintHandlers{}, context)
	text := printer.NewTextWriter("\n", 0)
	emitter.Write(writer, nil, text, nil)
	code := text.String()
	if strings.Contains(code, ".output()") || strings.Contains(code, "await ") || strings.Count(code, "instanceof __exactSsr.promise") != 2 {
		t.Fatalf("writer lost caller-owned output or conditional settlement: %s", code)
	}
	t.Log("SSR_CONTINUATION_BASE64=" + base64.StdEncoding.EncodeToString([]byte(code)))
	terminal := lowering.directRenderProgramSsrSinkWriter(&renderProgramBuild{serverSegments: []string{"<main></main>"}})
	terminalText := printer.NewTextWriter("\n", 0)
	emitter.Write(terminal, nil, terminalText, nil)
	if strings.Contains(terminalText.String(), "__exactResume") || strings.Contains(terminalText.String(), "instanceof Promise") {
		t.Fatal("synchronous terminal write retained unnecessary continuation state")
	}
	t.Log("SSR_TERMINAL_BASE64=" + base64.StdEncoding.EncodeToString([]byte(terminalText.String())))
}

func TestSsrSinkSiblingPreparation(t *testing.T) {
	context := printer.NewEmitContext()
	lowering := jsxLowering{factory: context.Factory}
	writer := lowering.directRenderProgramSsrSinkWriter(&renderProgramBuild{
		serverSegments: []string{"<main>", "", "</main>"}, serverSlots: []int{0, 1},
		slots: []renderProgramSlot{
			{kind: "component", id: "first", serverComponent: context.Factory.NewIdentifier("Child")},
			{kind: "component", id: "second", serverComponent: context.Factory.NewIdentifier("Child")},
		},
	})
	emitter := printer.NewPrinter(printer.PrinterOptions{NewLine: core.NewLineKindLF, Target: core.ScriptTargetES2022}, printer.PrintHandlers{}, context)
	text := printer.NewTextWriter("\n", 0)
	emitter.Write(writer, nil, text, nil)
	code := text.String()
	if strings.Count(code, ".reference(Child,") != 2 || strings.Contains(code, ".directComponent(") ||
		!strings.Contains(code, "prepareReferences([__exactSibling_0, __exactSibling_1])") ||
		strings.Index(code, ".reference(") < strings.LastIndex(code, ".unprepared") ||
		strings.Index(code, "prepareReferences([") == -1 || strings.Index(code, "prepareReferences([") > strings.Index(code, ".begin(") {
		t.Fatalf("sibling preparation lost validated references or startup ordering: %s", code)
	}
}

func TestSsrSinkContinuationEmptyAndWidePlans(t *testing.T) {
	for _, count := range []int{0, 512} {
		context := printer.NewEmitContext()
		lowering := jsxLowering{factory: context.Factory}
		build := &renderProgramBuild{serverSegments: make([]string, count+1)}
		for index := 0; index < count; index++ {
			build.serverSlots = append(build.serverSlots, index)
			build.slots = append(build.slots, renderProgramSlot{kind: "child", id: "item"})
		}
		writer := lowering.directRenderProgramSsrSinkWriter(build)
		emitter := printer.NewPrinter(printer.PrinterOptions{NewLine: core.NewLineKindLF, Target: core.ScriptTargetES2022}, printer.PrintHandlers{}, context)
		text := printer.NewTextWriter("\n", 0)
		emitter.Write(writer, nil, text, nil)
		expected := 1
		if count == 0 {
			expected = 0
		}
		if strings.Count(text.String(), "function __exactRun(") != expected {
			t.Fatal("continuation nesting grows with the number of writes")
		}
		if count > 0 && strings.Count(text.String(), "const __exactSaved: unknown[] = [") != 1 {
			t.Fatal("saved locals are duplicated at every write instead of one suspension postlude")
		}
	}
}
