package exactcompiler

import (
	"time"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/core"
	"github.com/microsoft/TypeScript/tsc/internal/parser"
	"github.com/microsoft/TypeScript/tsc/internal/tspath"
)

// ExecutableSlotsVersion advertises the optional syntax-only host acquisition path.
// It grants no executable selection, effect, value or emitted artifact authority.
const ExecutableSlotsVersion = 2

// helperSourceDiscovery is only a necessary-callsite result for helper search.
// CompleteNegative says nothing about module execution, values or effect purity.
type helperSourceDiscovery struct {
	SourceRevision   string `json:"sourceRevision"`
	CompleteNegative bool   `json:"completeNegative"`
}

func helperSourceDiscoveryFor(source *ast.SourceFile) *helperSourceDiscovery {
	fact := &helperSourceDiscovery{SourceRevision: preparedContentRevision(source.Text()), CompleteNegative: len(source.Diagnostics()) == 0}
	walkNode(source.AsNode(), func(node *ast.Node) bool {
		if helperMutationCallCandidate(node) != nil {
			fact.CompleteNegative = false
		}
		return fact.CompleteNegative
	})
	return fact
}

// executableSyntaxSlots indexes exactly the supplied source with the ordinary
// native parser. It creates no Program/checker and does not touch session state.
func executableSyntaxSlots(request Request, response Response, started time.Time) Response {
	if _, _, err := request.Analysis.warningThreshold(); err != nil {
		response.Error = err.Error()
		return response
	}
	if request.ExecutableSelection != nil || len(request.Sources) != 0 {
		response.Error = "executable-slots accepts one source, not a project selection"
		return response
	}
	if request.Target != "" && request.Target != TargetDefault {
		response.Error = "executable-slots requires a target-neutral request"
		return response
	}
	if request.Diagnostics != "" && request.Diagnostics != "syntax" {
		response.Error = "executable-slots provides syntax diagnostics only"
		return response
	}
	fileName, err := normalizeFileName(request.ID, request.Root)
	if err != nil {
		response.Error = err.Error()
		return response
	}
	source := parser.ParseSourceFile(ast.SourceFileParseOptions{FileName: fileName, Path: tspath.ToPath(fileName, tspath.GetDirectoryPath(fileName), true)}, request.Source, core.EnsureScriptKindFromFileName(fileName))
	response.Timings.ParseMicroseconds = time.Since(started).Microseconds()
	response.ExecutableSlots = executableSlotFacts(source)
	response.HelperSourceDiscovery = helperSourceDiscoveryFor(source)
	if response.HelperSourceDiscovery.CompleteNegative {
		// The final planner sees canonical native source. Do not let a raw
		// negative cover edits which could introduce another candidate call.
		_, normalized, err := normalizeSynchronizedSource(ProjectSource{ID: fileName, Source: request.Source, PackageEnhancementBoundary: request.PackageEnhancementBoundary}, request.Root)
		if err != nil || normalized.text != request.Source {
			response.HelperSourceDiscovery.CompleteNegative = false
		}
	}
	for _, diagnostic := range source.Diagnostics() {
		response.Diagnostics = append(response.Diagnostics, projectDiagnostic(diagnostic))
	}
	response.Timings.TotalMicroseconds = time.Since(started).Microseconds()
	return response
}
