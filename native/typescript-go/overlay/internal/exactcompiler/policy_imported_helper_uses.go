package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"github.com/microsoft/TypeScript/tsc/internal/printer"
	"sort"
)

// importedHelperUse is pass-local original-edge provenance. Only lowering's
// projected tree can retain it; demand membership and import names cannot.
type importedHelperUse struct {
	edge, helper *ast.Node
	source       *ast.SourceFile
	target       Target
	retained     bool
	routed       *ast.Node
	consumptions []*ast.Node
}

type importedHelperPolicyPlan struct {
	source  *ast.SourceFile
	checker *checker.Checker
	owner   *executableBodyOwner
	uses    map[*ast.Node]*importedHelperUse
}

// planImportedHelperPolicy snapshots resolved component edges before lowering
// reparents originals. It issues no execution or artifact-retention authority.
func planImportedHelperPolicy(source *ast.SourceFile, c *checker.Checker, owner *executableBodyOwner, components []Component) *importedHelperPolicyPlan {
	if owner == nil || owner.checker != c {
		return nil
	}
	p := &importedHelperPolicyPlan{source: source, checker: c, owner: owner, uses: make(map[*ast.Node]*importedHelperUse)}
	// Cache only completed root walks in this pass; cyclic partial results are never cached.
	consumptions := make(map[*ast.Node][]*ast.Node)
	for _, component := range components {
		root := componentSourceNode(source, component)
		if root == nil {
			continue
		}
		walkNode(root, func(n *ast.Node) bool {
			if ast.IsPartOfTypeNode(n) {
				return false
			}
			if !ast.IsCallExpression(n) {
				return true
			}
			helper := owner.invocationBody(n, c)
			if helper == nil || !ast.IsFunctionLike(helper) || helper.Body() == nil {
				return true
			}
			file := ast.GetSourceFileOfNode(helper)
			if file != nil && file != source && !file.IsDeclarationFile {
				calls, complete := consumptions[helper]
				if !complete {
					calls = p.ordinaryHelperConsumptions(helper)
					consumptions[helper] = calls
				}
				if len(calls) == 0 {
					return true
				}
				p.uses[n] = &importedHelperUse{edge: n, helper: helper, source: file, consumptions: calls}
			}
			return true
		})
	}
	if len(p.uses) == 0 {
		return nil
	}
	return p
}

// ordinaryHelperConsumptions follows only stable identifier-bound ordinary
// declarations, using existing source-owned normal-node inventories. It neither
// visits unrelated functions nor infers bodies from a callable signature. Task
// and component boundaries need their own projection and are not inherited.
func (p *importedHelperPolicyPlan) ordinaryHelperConsumptions(root *ast.Node) []*ast.Node {
	var calls []*ast.Node
	seen := make(map[*ast.Node]bool)
	var visit func(*ast.Node)
	visit = func(helper *ast.Node) {
		if seen[helper] {
			return
		}
		seen[helper] = true
		for _, call := range p.owner.values.summary(helper).nodes {
			if !ast.IsCallExpression(call) {
				continue
			}
			if isImportedSecretConsume(call.Expression(), p.checker) {
				calls = append(calls, call)
				continue
			}
			expression := unwrapSourceCallableReference(call.Expression())
			if !ast.IsIdentifier(expression) {
				continue
			}
			// An explicitly selected opaque edge must not fall back to a typed body.
			next, owned := p.owner.body(expression)
			if !owned {
				symbol := resolvedCallableSymbol(p.checker.GetSymbolAtLocation(expression), p.checker)
				next, _ = p.owner.uniqueSymbolDefinition(symbol)
			}
			if next == nil || !ast.IsFunctionDeclaration(next) || next.Body() == nil || p.owner.values.erasedTaskPolicyParameter(next) != nil {
				continue
			}
			if _, component := p.owner.values.components[next]; component {
				continue
			}
			source := ast.GetSourceFileOfNode(next)
			if source == nil || source.IsDeclarationFile {
				continue
			}
			visit(next)
		}
	}
	visit(root)
	return calls
}

// recordPendingHelper preserves only the exact replacement made by pending
// helper lowering. Registration is not retention: an erased server-task body
// leaves its replacement absent from project/final audit just like normal work.
func (p *importedHelperPolicyPlan) recordPendingHelper(original, replacement, selection *ast.Node, emit *printer.EmitContext) {
	if p == nil {
		return
	}
	use := p.uses[emit.MostOriginal(original)]
	if use == nil {
		return
	}
	routed := *use
	routed.retained = false
	routed.routed = selection
	p.uses[replacement] = &routed
}

// calleeCurrent validates the selected original function carried by ctx.helper.
// A routed member/other selection is deliberately not reattributed to a function
// reference; retained unsupported or identity-losing routes fail coverage.
func (use *importedHelperUse) calleeCurrent(call *ast.Node, emit *printer.EmitContext) bool {
	callee := call.Expression()
	if use.routed == nil {
		return emit.MostOriginal(callee) == use.edge.Expression()
	}
	if !ast.IsCallExpression(callee) || emit.MostOriginal(callee) != use.routed {
		return false
	}
	args := callee.AsCallExpression().Arguments
	return args != nil && len(args.Nodes) > 0 && emit.MostOriginal(args.Nodes[0]) == use.edge.Expression()
}

// project commits/discards edges after ordinary-work/continuation selection.
// Factory MostOriginal links are the existing retained-secret artifact law.
func (p *importedHelperPolicyPlan) project(file *ast.SourceFile, emit *printer.EmitContext, target Target) {
	if p == nil {
		return
	}
	for _, use := range p.uses {
		use.target = target
		use.retained = false
	}
	walkNode(file.AsNode(), func(n *ast.Node) bool {
		if ast.IsPartOfTypeNode(n) {
			return false
		}
		if ast.IsCallExpression(n) {
			if use := p.uses[emit.MostOriginal(n)]; use != nil && (use.routed != nil && emit.MostOriginal(n.Expression()) == use.routed || use.routed == nil && emit.MostOriginal(n.Expression()) == use.edge.Expression()) {
				use.retained = true
			}
		}
		return true
	})
}

// audit consumes only client uses surviving final pruning. Helper-local
// qualification and consumer coordinates remain owned by the helper source;
// a diagnostic attaches to the requested original edge, never foreign spans.
// This audits consumes reached through resolved ordinary direct declarations;
// callbacks and framework task/component bodies are not inherited by this walk.
func (p *importedHelperPolicyPlan) audit(file *ast.SourceFile, emit *printer.EmitContext, request Request, policy *policyAnalysis) []Diagnostic {
	if p == nil {
		return nil
	}
	if p.owner.checker != p.checker {
		panic("Compiler analysis coverage gap: stale imported policy checker")
	}
	var diagnostics []Diagnostic
	seenHelpers := make(map[*ast.Node]bool)
	seenConsumptions := make(map[*ast.Node]bool)
	subjects := make(map[string]bool)
	for _, s := range policy.graph.Subjects {
		subjects[s.ID] = true
	}
	walkNode(file.AsNode(), func(n *ast.Node) bool {
		if ast.IsPartOfTypeNode(n) {
			return false
		}
		if !ast.IsCallExpression(n) {
			return true
		}
		use := p.uses[emit.MostOriginal(n)]
		if use == nil || !use.retained || use.target != TargetClient {
			return true
		}
		if !use.calleeCurrent(n, emit) {
			panic("Compiler analysis coverage gap: retained imported policy callee identity changed")
		}
		if seenHelpers[use.helper] {
			return true
		}
		// Compare checked original identities, not names or cross-file positions.
		if ast.GetSourceFileOfNode(use.edge) != p.source || ast.GetSourceFileOfNode(use.helper) != use.source || p.owner.invocationBody(use.edge, p.checker) != use.helper {
			panic("Compiler analysis coverage gap: stale retained imported policy edge")
		}
		seenHelpers[use.helper] = true
		local := policyAnalysis{owner: p.owner, graph: newPolicyAnalysis(), sourceTypes: policy.sourceTypes, subjects: policySubjects{symbols: make(map[ast.SymbolId]PolicySubject), calls: make(map[string]PolicySubject)}, selectorsByID: make(map[string]string)}
		addSubject := func(s PolicySubject) {
			if !subjects[s.ID] {
				subjects[s.ID] = true
				policy.graph.Subjects = append(policy.graph.Subjects, s)
			}
		}
		// Each original consume is qualified in its own callee source. Root
		// retention still comes exclusively from final component lowering.
		for _, call := range use.consumptions {
			if seenConsumptions[call] {
				continue
			}
			seenConsumptions[call] = true
			callSource := ast.GetSourceFileOfNode(call)
			if callSource == nil || callSource.IsDeclarationFile {
				panic("Compiler analysis coverage gap: missing imported policy source")
			}
			args := call.AsCallExpression().Arguments
			if args != nil && len(args.Nodes) > 0 {
				collectPolicyInputMembers(args.Nodes[0], callSource, p.checker, &local, addSubject)
			}
			execution := request
			execution.Target = use.target
			start := len(local.diagnostics)
			collectSecretConsumeCall(callSource, p.checker, execution, call, &local)
			for _, d := range local.diagnostics[start:] {
				line, column := sourceLocation(callSource, call.Pos())
				d.Message = fmt.Sprintf("%s (imported helper %s:%d:%d)", d.Message, callSource.FileName(), line, column)
				d.Start = use.edge.Pos()
				d.Length = use.edge.End() - use.edge.Pos()
				diagnostics = append(diagnostics, d)
			}
		}
		policy.graph.SecretConsumers = append(policy.graph.SecretConsumers, local.graph.SecretConsumers...)
		policy.graph.Flows = append(policy.graph.Flows, local.graph.Flows...)
		return true
	})
	sort.Slice(policy.graph.Subjects, func(i, j int) bool { return policy.graph.Subjects[i].ID < policy.graph.Subjects[j].ID })
	sort.Slice(policy.graph.SecretConsumers, func(i, j int) bool { return policy.graph.SecretConsumers[i].ID < policy.graph.SecretConsumers[j].ID })
	sort.Slice(policy.graph.Flows, func(i, j int) bool { return policy.graph.Flows[i].ID < policy.graph.Flows[j].ID })
	return diagnostics
}
