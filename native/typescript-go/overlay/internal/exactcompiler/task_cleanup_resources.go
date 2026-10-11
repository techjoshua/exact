package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// Cleanup retains native resource ownership after producer closure. Explicit
// signals still observe the resource lifetime used by producer-side helpers.
func collectTaskCleanupResources(callback *ast.Node, sourceFile *ast.SourceFile, typeChecker *checker.Checker) ([]TaskSignalCall, []string) {
	var signals []TaskSignalCall
	var diagnostics []string
	walkNode(callback.Body(), func(node *ast.Node) bool {
		missingSignal := false
		if signal, ok := taskSignalCall(node, sourceFile, typeChecker); ok {
			call := node.AsCallExpression()
			missingSignal = true
			if call.Arguments != nil && len(call.Arguments.Nodes) > signal.Parameter {
				signal.ExistingOnly = true
				signals = append(signals, signal)
				missingSignal = !taskCleanupSuppliesSignal(call.Arguments.Nodes[signal.Parameter], signal.Mode, typeChecker)
			}
		}
		if _, resource := taskResourceCandidate(node, sourceFile, typeChecker); resource {
			diagnostics = append(diagnostics, "warning: resources created inside task cleanup have native lifetime after the producer closes. Dispose or cancel them in that callback or an ordinary helper. Create resources before cleanup registration when generation ownership is required")
		} else if missingSignal {
			diagnostics = append(diagnostics, "warning: task cleanup does not supply missing cancellation signals. Give new work its own lifetime or create it during the task producer. Explicit signals retain their existing task adaptation")
		}
		return true
	})
	return signals, diagnostics
}

// Warn when the authored argument cannot establish an explicit signal. Optional
// fields and nullable values remain runtime choices, not implicit ownership.
func taskCleanupSuppliesSignal(argument *ast.Node, mode string, typeChecker *checker.Checker) bool {
	value := typeChecker.GetTypeAtLocation(argument)
	if value == nil {
		return false
	}
	if mode == "options" {
		property := typeChecker.GetPropertyOfType(value, "signal")
		if property == nil || property.Flags&ast.SymbolFlagsOptional != 0 {
			return false
		}
		value = typeChecker.GetTypeOfSymbolAtLocation(property, argument)
	}
	return value != nil && !typeHasNullishMember(value)
}
