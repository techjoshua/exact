package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

func unknownComponentRenderCapability() ComponentRenderCapability {
	return ComponentRenderCapability{Server: "unknown", Client: "unknown"}
}

// componentRenderCapability keeps incompatible requirements beside independent uncertainty.
// It describes rendering only. Artifact reachability and publication retain separate owners.
func componentRenderCapability(browser, server, incomplete bool) ComponentRenderCapability {
	status := func(conflict bool) string {
		if conflict {
			return "unsupported"
		}
		if incomplete {
			return "unknown"
		}
		return "supported"
	}
	return ComponentRenderCapability{Server: status(browser), Client: status(server)}
}

// componentRenderProofIncomplete requires a known render shape and direct-effect coverage.
// Deferred task, lifecycle and dormant bodies do not execute as ordinary render work.
// Child composition is deliberately unknown until its target-local proof is available.
func componentRenderProofIncomplete(component Component, node *ast.Node, callables callableAnalysis, tasks []Task, lifecycle, dormant []SourceSpan, elements []componentElement) bool {
	if !component.CompiledRender || !component.ClientCompiledRender {
		return true
	}
	if _, found := callables.byNode[node]; !found {
		return true
	}
	for _, element := range elements {
		if !element.intrinsic {
			return true
		}
	}
	for _, fact := range callables.facts {
		if fact.sourceFile != ast.GetSourceFileOfNode(node) || fact.node.Pos() < node.Pos() || fact.node.End() > node.End() ||
			insideTaskSpan(fact.node.Pos(), tasks, component.Name) ||
			insideSourceSpans(fact.node.Pos(), lifecycle) || insideSourceSpans(fact.node.Pos(), dormant) {
			continue
		}
		for _, source := range fact.summary.DirectEffectSources {
			if source.Environment == "unknown" {
				return true
			}
		}
	}
	return false
}

// componentRenderInputTask identifies compiler-owned setup inputs rather than dormant
// authored task definitions. Synthetic resource setup retains its existing browser constraint.
func componentRenderInputTask(task Task) bool {
	return task.SyntheticSetup || ((task.CompilerComputation || task.CompilerSetup) &&
		(len(task.Writes) != 0 || len(task.ResultWritePath) != 0))
}
