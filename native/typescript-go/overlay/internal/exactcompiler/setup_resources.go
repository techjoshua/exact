package exactcompiler

import (
	"fmt"
	"sort"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

// collectSetupResourceTasks transfers directly invoked setup resources into
// synthetic client tasks. Only standalone expression statements are eligible:
// wrapping a value-producing declaration would change its lexical result, so
// those cases are rejected and require explicit authored task ownership.
func collectSetupResourceTasks(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	authoredTasks []Task,
) []Task {
	var tasks []Task
	for _, candidate := range componentCandidates(sourceFile) {
		if len(componentSignals(candidate, sourceFile)) == 0 {
			continue
		}
		walkNode(candidate.node, func(statement *ast.Node) bool {
			if !setupOwnedNode(statement, candidate.node) ||
				insideTaskSpan(statement.Pos(), authoredTasks, candidate.name) ||
				statementContainsTask(statement, authoredTasks, candidate.name) {
				return false
			}
			if ast.IsExpressionStatement(statement) {
				task, owned := setupExpressionTask(
					statement,
					candidate,
					sourceFile,
					typeChecker,
				)
				if owned {
					tasks = append(tasks, task)
				}
				return true
			}
			if ast.IsVariableStatement(statement) {
				if diagnostic, start, length := setupValueResourceDiagnostic(
					statement,
					candidate,
					sourceFile,
					typeChecker,
				); diagnostic != "" {
					task := setupResourceTask(candidate.name, statement)
					task.Start = start
					task.Length = length
					task.Diagnostics = append(task.Diagnostics, diagnostic)
					tasks = append(tasks, task)
				}
				return false
			}
			return true
		})
	}
	sort.Slice(tasks, func(left int, right int) bool {
		return tasks[left].Start < tasks[right].Start
	})
	return tasks
}

func statementContainsTask(
	statement *ast.Node,
	tasks []Task,
	component string,
) bool {
	for _, task := range tasks {
		if task.Component == component &&
			task.Start >= statement.Pos() &&
			task.Start+task.Length <= statement.End() {
			return true
		}
	}
	return false
}

func setupExpressionTask(
	statement *ast.Node,
	candidate componentCandidate,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) (Task, bool) {
	task := setupResourceTask(candidate.name, statement)
	visitDirectComponentSyntax(statement.AsExpressionStatement().Expression, func(node *ast.Node) {
		if ast.IsCallExpression(node) {
			if signal, ok := taskSignalCall(node, sourceFile, typeChecker); ok {
				task.SignalCalls = append(task.SignalCalls, signal)
			}
		}
		resource, ok := taskResourceCandidate(node, sourceFile, typeChecker)
		if !ok {
			return
		}
		ownership := taskResourceOwnership(candidate.node, node, resource, typeChecker)
		switch ownership {
		case "owned":
			task.Resources = append(task.Resources, TaskResource{
				Kind:        resource.kind,
				Disposal:    resource.disposal,
				Description: resource.description,
				Start:       node.Pos(),
				Length:      node.End() - node.Pos(),
			})
		case "escape":
			task.Diagnostics = append(
				task.Diagnostics,
				setupResourceEscapeMessage(resource),
			)
		}
	})
	return task, len(task.Resources) != 0 ||
		len(task.SignalCalls) != 0 ||
		len(task.Diagnostics) != 0
}

func setupValueResourceDiagnostic(
	statement *ast.Node,
	candidate componentCandidate,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) (string, int, int) {
	message, start, length := "", 0, 0
	visitDirectComponentSyntax(statement, func(node *ast.Node) {
		if message != "" {
			return
		}
		resource, ok := taskResourceCandidate(node, sourceFile, typeChecker)
		if !ok {
			return
		}
		message = setupResourceEscapeMessage(resource)
		start = node.Pos()
		length = node.End() - node.Pos()
	})
	return message, start, length
}

func setupResourceTask(component string, statement *ast.Node) Task {
	task := normalizeTaskFacets(component, []string{"client"})
	task.SyntheticSetup = true
	task.BrowserEffects = true
	task.EnvironmentEffect = "browser"
	task.Placement = "client"
	task.Start = statement.Pos()
	task.Length = statement.End() - statement.Pos()
	return task
}

func setupResourceEscapeMessage(candidate resourceCandidate) string {
	description := candidate.description
	if description == "" {
		description = candidate.kind
	}
	return fmt.Sprintf(
		"error: setup-created %s cannot be owned without changing its expression result; wrap its creation in this.task.client()",
		description,
	)
}
