package exactcompiler

import (
	"fmt"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

// Action is the compiler-owned invocation contract for one explicit
// component action registration.
type Action struct {
	ID          string
	Label       string
	Component   string
	Placement   string
	Priority    string
	Concurrency string
	Arguments   []TaskDependency
	Reads       []StateEffect
	Writes      []StateEffect
	Contexts    []ContextEffect
	Start       int
	Length      int
}

// collectActions analyzes explicit action work with the same callable effect
// graph used for tasks while keeping invocation arguments separate from setup
// dependencies.
func collectActions(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	stateReads []StateRead,
	stateWrites []StateWrite,
	callables callableAnalysis,
) []Action {
	var actions []Action
	for _, candidate := range componentCandidates(sourceFile) {
		if len(componentSignals(candidate, sourceFile)) == 0 {
			continue
		}
		walkNode(candidate.node, func(node *ast.Node) bool {
			if !ast.IsCallExpression(node) {
				return true
			}
			call := node.AsCallExpression()
			facets, actionCall := actionFacets(call.Expression)
			if !actionCall || call.Arguments == nil ||
				len(call.Arguments.Nodes) < 2 {
				return true
			}
			work := call.Arguments.Nodes[1]
			if !ast.IsArrowFunction(work) && !ast.IsFunctionExpression(work) {
				return true
			}
			action := Action{
				Label:       strings.Trim(strings.TrimSpace(sourceText(sourceFile, call.Arguments.Nodes[0])), "'\""),
				Component:   candidate.name,
				Placement:   actionRequestedPlacement(facets),
				Priority:    actionPriority(facets),
				Concurrency: "parallel",
				Reads:       taskReadEffects(stateReads, candidate.name, work),
				Writes:      taskWriteEffects(stateWrites, candidate.name, work),
				Contexts:    []ContextEffect{},
				Start:       node.Pos(),
				Length:      node.End() - node.Pos(),
			}
			if len(call.Arguments.Nodes) >= 3 {
				action.Concurrency = strings.Trim(
					strings.TrimSpace(sourceText(
						sourceFile,
						call.Arguments.Nodes[2],
					)),
					"'\"",
				)
			}
			argumentCount := len(work.Parameters())
			if actionWorkHasContextParameter(work, sourceFile) {
				argumentCount--
			}
			for index := 0; index < argumentCount; index++ {
				action.Arguments = append(action.Arguments, TaskDependency{
					Index:  index,
					Source: "argument",
				})
			}
			if callable, exists := callables.byNode[work]; exists {
				action.Reads = uniqueStateEffects(
					append(action.Reads, callable.StateReads...),
				)
				action.Writes = uniqueStateEffects(
					append(action.Writes, callable.StateWrites...),
				)
				action.Contexts = append(
					[]ContextEffect(nil),
					callable.Contexts...,
				)
				if action.Placement == "" {
					switch callable.Effect {
					case "server":
						action.Placement = "server"
					case "browser":
						action.Placement = "client"
					case "mixed", "unknown":
						action.Placement = "unknown"
					}
				}
			}
			if action.Placement == "" {
				if len(action.Writes) != 0 {
					action.Placement = "isomorphic"
				} else {
					action.Placement = "client"
				}
			}
			actions = append(actions, action)
			return false
		})
	}
	sort.Slice(actions, func(left int, right int) bool {
		return actions[left].Start < actions[right].Start
	})
	return actions
}

func actionRequestedPlacement(facets []string) string {
	for _, facet := range facets {
		if facet == "client" || facet == "server" {
			return facet
		}
	}
	return ""
}

func actionPriority(facets []string) string {
	for _, facet := range facets {
		if facet == "deferred" {
			return "deferred"
		}
	}
	return "normal"
}

// assignActionIDs creates opaque operation identities independently from
// authored diagnostic labels and source names.
func assignActionIDs(
	actions []Action,
	components []Component,
	identityFilename string,
) {
	componentOrder := make(map[string]int, len(components))
	for index, component := range components {
		componentOrder[component.Name] = index
	}
	sort.SliceStable(actions, func(left int, right int) bool {
		leftOwner, leftExists := componentOrder[actions[left].Component]
		rightOwner, rightExists := componentOrder[actions[right].Component]
		if leftExists && rightExists && leftOwner != rightOwner {
			return leftOwner < rightOwner
		}
		return actions[left].Start < actions[right].Start
	})
	indices := make(map[string]int, len(components))
	for index := range actions {
		component := actions[index].Component
		actionIndex := indices[component]
		actions[index].ID = exactStableID(
			identityFilename,
			fmt.Sprintf("%s:action:%d", component, actionIndex),
		)
		indices[component] = actionIndex + 1
	}
}

func indexActions(actions []Action) map[string]Action {
	result := make(map[string]Action, len(actions))
	for _, action := range actions {
		result[fmt.Sprintf("%d:%d", action.Start, action.Length)] = action
	}
	return result
}
