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
				// Only direct policy consumers need retention evidence. Reuse the
				// original body inventory instead of tracking ordinary helpers.
				relevant := false
				for _, operation := range owner.values.summary(helper).nodes {
					if ast.IsCallExpression(operation) && isImportedSecretConsume(operation.Expression(), c) {
						relevant = true
						break
					}
				}
				if !relevant {
					return true
				}
				p.uses[n] = &importedHelperUse{edge: n, helper: helper, source: file}
			}
			return true
		})
	}
	if len(p.uses) == 0 {
		return nil
	}
	return p
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
			if use := p.uses[emit.MostOriginal(n)]; use != nil && emit.MostOriginal(n.Expression()) == use.edge.Expression() {
				use.retained = true
			}
		}
		return true
	})
}

// audit consumes only client uses surviving final pruning. Helper-local
// qualification and consumer coordinates remain owned by the helper source;
// a diagnostic attaches to the requested original edge, never foreign spans.
// This audits direct consume operations in resolved ordinary helper bodies;
// nested callable bodies are not certified or invoked by this walk.
func (p *importedHelperPolicyPlan) audit(file *ast.SourceFile, emit *printer.EmitContext, request Request, policy *policyAnalysis) []Diagnostic {
	if p == nil {
		return nil
	}
	if p.owner.checker != p.checker {
		panic("Compiler analysis coverage gap: stale imported policy checker")
	}
	var diagnostics []Diagnostic
	seenHelpers := make(map[*ast.Node]bool)
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
		if emit.MostOriginal(n.Expression()) != use.edge.Expression() {
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
		// The existing normal-node inventory includes eager computed names
		// while excluding deferred method/callback bodies, just as planning does.
		for _, call := range p.owner.values.summary(use.helper).nodes {
			if !ast.IsCallExpression(call) || !isImportedSecretConsume(call.Expression(), p.checker) {
				continue
			}
			args := call.AsCallExpression().Arguments
			if args != nil && len(args.Nodes) > 0 {
				collectPolicyInputMembers(args.Nodes[0], use.source, p.checker, &local, addSubject)
			}
			execution := request
			execution.Target = use.target
			start := len(local.diagnostics)
			collectSecretConsumeCall(use.source, p.checker, execution, call, &local)
			for _, d := range local.diagnostics[start:] {
				line, column := sourceLocation(use.source, call.Pos())
				d.Message = fmt.Sprintf("%s (imported helper %s:%d:%d)", d.Message, use.source.FileName(), line, column)
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
