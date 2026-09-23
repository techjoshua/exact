package exactcompiler

import (
	"fmt"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// Task indexes connect analyzed definitions to source spans, symbols, and unambiguous
// authored names before lowering. They do not determine runtime operation identity.
func indexInvokedTasks(tasks []Task) map[int]Task {
	result := make(map[int]Task)
	for _, task := range tasks {
		if task.Invoked {
			result[task.WorkStart] = task
		}
	}
	return result
}

func indexFunctionTasks(tasks []Task) map[int]Task {
	result := make(map[int]Task)
	for _, task := range tasks {
		if task.FunctionDefined {
			if previous, exists := result[task.WorkStart]; !exists || !previous.Invoked {
				result[task.WorkStart] = task
			}
		}
	}
	return result
}

func indexFunctionTaskSymbols(
	tasks []Task,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) map[ast.SymbolId]Task {
	result := make(map[ast.SymbolId]Task)
	byStart := indexFunctionTasks(tasks)
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		task, exists := byStart[node.Pos()]
		if !exists || node.End()-node.Pos() != task.WorkLength {
			return true
		}
		var name *ast.Node
		if ast.IsFunctionDeclaration(node) {
			name = node.Name()
		} else if node.Parent != nil && ast.IsVariableDeclaration(node.Parent) {
			name = node.Parent.AsVariableDeclaration().Name()
		}
		if name == nil || !ast.IsIdentifier(name) {
			return true
		}
		symbol := resolvedCallableSymbol(typeChecker.GetSymbolAtLocation(name), typeChecker)
		if symbol != nil {
			result[ast.GetSymbolId(symbol)] = task
		}
		return true
	})
	return result
}

func indexFunctionTaskNames(
	tasks []Task,
	sourceFile *ast.SourceFile,
) map[string]Task {
	result := make(map[string]Task)
	ambiguous := make(map[string]struct{})
	byStart := indexFunctionTasks(tasks)
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		task, exists := byStart[node.Pos()]
		if !exists || node.End()-node.Pos() != task.WorkLength {
			return true
		}
		name := ""
		if ast.IsFunctionDeclaration(node) && node.Name() != nil {
			name = node.Name().Text()
		} else if node.Parent != nil && ast.IsVariableDeclaration(node.Parent) {
			declarationName := node.Parent.AsVariableDeclaration().Name()
			if ast.IsIdentifier(declarationName) {
				name = declarationName.Text()
			}
		}
		if name == "" {
			return true
		}
		if _, duplicate := result[name]; duplicate {
			delete(result, name)
			ambiguous[name] = struct{}{}
		} else if _, duplicate := ambiguous[name]; !duplicate {
			result[name] = task
		}
		return true
	})
	return result
}

func indexTasks(tasks []Task) map[string]Task {
	result := make(map[string]Task, len(tasks))
	for _, task := range tasks {
		result[fmt.Sprintf("%d:%d", task.Start, task.Length)] = task
	}
	return result
}
