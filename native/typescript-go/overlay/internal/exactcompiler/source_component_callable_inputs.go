package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"strconv"
)

// sourceComponentCallableInput is a declaration-relative Call dependency. The
// source Call retains receiver, argument and capture syntax, never a query frame.
// Only direct named props calls in the returned render function enter this pilot.
type sourceComponentCallableInput struct {
	declaration, slot, operation *ast.Node
	key                          string
}

// collectComponentCallableInputs records invocation, not mere callback storage.
// Nested deferred functions are excluded even when their source contains a Call.
func collectComponentCallableInputs(node *ast.Node, c *checker.Checker, owner *executableBodyOwner) []sourceComponentCallableInput {
	props := componentPropsParameterIdentifier(node)
	if props == nil {
		return nil
	}
	symbol := c.GetSymbolAtLocation(props)
	if symbol == nil || owner == nil || owner.values == nil || owner.values.bindingWritten(symbol) {
		return nil
	}
	var rows []sourceComponentCallableInput
	for _, returned := range directCallableReturns(node) {
		render := unwrapRenderExpression(returned)
		if render == nil || !ast.IsArrowFunction(render) {
			continue
		}
		walkNode(render.Body(), func(use *ast.Node) bool {
			if ast.IsFunctionLike(use) {
				return false
			}
			if !ast.IsCallExpression(use) || use.AsCallExpression().QuestionDotToken != nil {
				return true
			}
			callee := use.Expression()
			if !ast.IsPropertyAccessExpression(callee) || callee.AsPropertyAccessExpression().QuestionDotToken != nil {
				return true
			}
			receiver := callee.Expression()
			if !ast.IsIdentifier(receiver) || c.GetSymbolAtLocation(receiver) != symbol {
				return true
			}
			rows = append(rows, sourceComponentCallableInput{node, symbol.ValueDeclaration, use, callee.Name().Text()})
			return true
		})
	}
	return rows
}

// componentInputRequirements retains independent unknown beside known donors.
// Placement is a projection of these facts and cannot erase either alternative.
type componentInputRequirements struct{ browser, server, unknown bool }

func (r componentInputRequirements) join(other componentInputRequirements) componentInputRequirements {
	return componentInputRequirements{r.browser || other.browser, r.server || other.server, r.unknown || other.unknown}
}
func (r componentInputRequirements) placement(base string) string {
	if base == "unknown" || r.unknown || r.browser && r.server {
		return "unknown"
	}
	if r.browser {
		if base == "server" {
			return "unknown"
		}
		return "client"
	}
	if r.server {
		if base == "client" {
			return "unknown"
		}
		return "server"
	}
	return base
}

// componentCallableInputRequirements uses existing declaration summaries. It
// does not execute a callback, synthesize a Call or specialize the target body.
// Unmodeled selections remain unknown rather than invoking every possible prop.
func componentCallableInputRequirements(site *ast.Node, demands []sourceComponentCallableInput, analysis callableAnalysis, c *checker.Checker, owner *executableBodyOwner) componentInputRequirements {
	var result componentInputRequirements
	for _, demand := range demands {
		var expression *ast.Node
		ambiguous := false
		if site.Attributes() != nil {
			for _, input := range site.Attributes().AsJsxAttributes().Properties.Nodes {
				if !ast.IsJsxAttribute(input) {
					ambiguous = true
					continue
				}
				if jsxAttributeText(input.Name()) != demand.key {
					continue
				}
				if expression != nil {
					ambiguous = true
				}
				init := input.AsJsxAttribute().Initializer
				if init != nil && ast.IsJsxExpression(init) {
					expression = init.AsJsxExpression().Expression
				}
			}
		}
		if ambiguous || expression == nil {
			result.unknown = true
			continue
		}
		declaration := expression
		if ast.IsIdentifier(expression) {
			symbol := resolvedCallableSymbol(c.GetSymbolAtLocation(expression), c)
			if symbol == nil || symbol.ValueDeclaration == nil || !ast.IsFunctionDeclaration(symbol.ValueDeclaration) || owner == nil || owner.values == nil || owner.values.bindingWritten(symbol) {
				result.unknown = true
				continue
			}
			declaration = symbol.ValueDeclaration
		} else if !ast.IsFunctionExpression(expression) && !ast.IsArrowFunction(expression) {
			result.unknown = true
			continue
		}
		summary, known := analysis.byNode[declaration]
		if !known {
			result.unknown = true
			continue
		}
		browser, server := knownEffectEnvironments(summary.EffectSources)
		result.browser = result.browser || browser || summary.Effect == "browser"
		result.server = result.server || server || summary.Effect == "server"
		result.unknown = result.unknown || summary.Kind == "component" || summary.Effect == "unknown" || containsEnvironment(summary.EffectSources, "unknown")
	}
	return result
}

// componentCallableBodyRequirements keeps ordinary Call uncertainty independent
// of the exact relative props Calls. It reads the existing graph without
// discharging field obligations or proving successful invocation.
func componentCallableBodyRequirements(target projectComponent, analysis callableAnalysis, targets map[string]*callableFacts, c *checker.Checker) componentInputRequirements {
	var result componentInputRequirements
	owners := map[*ast.Node]bool{target.candidate.node: true}
	for _, returned := range directCallableReturns(target.candidate.node) {
		render := unwrapRenderExpression(returned)
		if render != nil && ast.IsArrowFunction(render) {
			owners[render] = true
		}
	}
	for _, fact := range analysis.facts {
		if !owners[fact.node] {
			continue
		}
		for _, edge := range fact.summary.Calls {
			operation := fact.fieldEdgeOperations[edge.ID]
			relative := false
			for _, demand := range target.callableInputDemands {
				relative = relative || demand.operation == operation
			}
			if relative {
				continue
			}
			selected := targets[edge.TargetID]
			if !edge.Resolved || selected == nil || !ast.IsFunctionLike(selected.node) || selected.node.Body() == nil {
				callee := fact.callExpressions[edge.ID]
				if callee == nil || unresolvedCallEnvironment(callee, fact.sourceFile, c, nil) == "unknown" {
					result.unknown = true
				}
				continue
			}
			summary := selected.summary
			result.unknown = result.unknown || summary.Effect == "unknown" || containsEnvironment(summary.EffectSources, "unknown")
		}
	}
	return result
}

// applyComponentCallableInputs delivers relative demands only to the selected
// composition edge. The target's facts, code and invocation semantics stay intact.
func applyComponentCallableInputs(project *projectState, records []projectComponent, c *checker.Checker) {
	targets := make(map[string]*callableFacts, len(project.callableCache.merged.facts))
	for i := range project.callableCache.merged.facts {
		fact := &project.callableCache.merged.facts[i]
		targets[fact.summary.ID] = fact
	}
	byID := make(map[string]int, len(records))
	bodyRequirements := make([]componentInputRequirements, len(records))
	for i := range records {
		byID[records[i].component.ID] = i
		if len(records[i].callableInputDemands) != 0 {
			bodyRequirements[i] = componentCallableBodyRequirements(records[i], project.callableCache.merged, targets, c)
		}
	}
	for i := range records {
		record := &records[i]
		_, known := project.callableCache.bySource[record.sourceFile]
		analysis := project.callableCache.merged
		if !known {
			continue
		}
		walkNode(record.candidate.node, func(site *ast.Node) bool {
			if jsxTagNode(site) == nil {
				return true
			}
			for j := range record.component.RenderEdges {
				edge := &record.component.RenderEdges[j]
				if edge.Path != strconv.Itoa(site.Pos()) {
					continue
				}
				target, exists := byID[edge.ComponentID]
				if !exists {
					continue
				}
				demands := records[target].callableInputDemands
				if len(demands) == 0 {
					continue
				}
				requirements := componentCallableInputRequirements(site, demands, analysis, c, project.callableCache.owner)
				requirements = requirements.join(bodyRequirements[target])
				if requirements.unknown {
					appendComponentDiagnostic(&record.component, "warning: invoked callable input for "+edge.Tag+" has unresolved environment requirements. Ordinary JavaScript is preserved. Supply a compiler-visible callable to establish its render requirements")
				}
				if records[target].component.SubgraphPlacement == "unknown" {
					requirements.unknown = true
				}
				record.callableInputRequirements = record.callableInputRequirements.join(requirements)
				edge.Placement = requirements.placement(edge.Placement)
				edge.Boundary = edge.Placement
			}
			return true
		})
	}
}
