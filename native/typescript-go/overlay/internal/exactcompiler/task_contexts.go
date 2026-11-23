package exactcompiler

import (
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// taskBodyContextEffects separates executor lookup authority from captured
// defaults. Ordinary called helpers contribute their transitive context effects.
func taskBodyContextEffects(work *ast.Node, source *ast.SourceFile, typeChecker *checker.Checker, callables callableAnalysis, writes *taskContextBindingWrites) []ContextEffect {
	result := []ContextEffect{}
	called := make(map[*ast.Node][]ContextEffect)
	for index := range callables.facts {
		fact := &callables.facts[index]
		if fact.node != work {
			continue
		}
		for _, targetIndex := range fact.targets {
			target := &callables.facts[targetIndex]
			if len(target.summary.Contexts) == 0 || target.progressReceiver {
				continue
			}
			for _, edge := range fact.summary.Calls {
				operation := fact.fieldEdgeOperations[edge.ID]
				if operation != nil && edge.Resolved && edge.TargetID == target.summary.ID {
					called[operation] = append(called[operation], target.summary.Contexts...)
				}
			}
		}
		break
	}
	walkNode(work.Body(), func(node *ast.Node) bool {
		if ast.IsFunctionLike(node) {
			return false
		}
		if ast.IsIdentifier(node) && !ast.IsPartOfTypeNode(node) {
			symbol := taskLexicalReferenceSymbol(node, typeChecker)
			if effect, exists := contextBindingReferenceEffect(symbol, source, typeChecker); exists && !writes.replacedOutside(symbol, work) {
				result = append(result, effect)
			}
		}
		if !ast.IsCallExpression(node) {
			return true
		}
		result = append(result, called[node]...)
		call := node.AsCallExpression()
		if effect, exists := contextEffect(call, source, typeChecker); exists {
			result = append(result, effect)
		}
		if summary, exists := callables.expressionSummary(call.Expression, typeChecker); exists {
			result = append(result, summary.Contexts...)
		}

		return true
	})
	result = uniqueContextEffects(result)
	// Only a module binding remains available when the emitted executor leaves setup.
	locals := source.AsNode().Locals()
	for index := range result {
		effect := &result[index]
		if effect.Kind == "write" && effect.rootDeclaration != 0 {
			root, _, _ := strings.Cut(effect.Token, ".")
			binding := contextRootBinding(locals[root], typeChecker)
			effect.receiverWrite = binding != nil && ast.GetNodeId(binding) == effect.rootDeclaration
		}
	}
	return result
}

// taskContextBindingWrites borrows or builds checked syntax for one source task
// collection. An executor-local write does not supply a replacement from setup.
type taskContextBindingWrites struct {
	source  *ast.SourceFile
	checker *checker.Checker
	writes  map[ast.SymbolId][]policyAliasWrite
}

func (inventory *taskContextBindingWrites) replacedOutside(symbol *ast.Symbol, work *ast.Node) bool {
	if ast.GetSourceFileOfNode(symbol.ValueDeclaration) != inventory.source {
		return false
	}
	if inventory.writes == nil {
		inventory.writes = policyAliasWrites(inventory.source, inventory.checker)
	}
	for _, write := range inventory.writes[ast.GetSymbolId(symbol)] {
		if write.target.Pos() < work.Pos() || write.target.End() > work.End() {
			return true
		}
	}
	return false
}
