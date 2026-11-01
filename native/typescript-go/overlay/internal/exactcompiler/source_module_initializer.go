package exactcompiler

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"github.com/microsoft/TypeScript/tsc/internal/compiler"
	"sort"
)

// preflightModuleInitializer qualifies only optional getter-chain refinement.
// Refusal withholds its value/frame proof, not the generic initializer effect owner.
func preflightModuleInitializer(owner *executableBodyOwner, statement *ast.Node) (*ast.Node, *closedOwnGetterPlan, bool) {
	if owner == nil || owner.values == nil || !ast.IsVariableStatement(statement) || ast.HasSyntacticModifier(statement, ast.ModifierFlagsAmbient) {
		return nil, nil, false
	}

	if h := owner.values.prefixHistory(statement); h != nil && h.recipe.binding != nil && h.statement == statement && h.state == prefixQualified {
		return h.recipe.binding.declaration, nil, true
	}
	if owner.values.prefixHistory(statement) != nil {
		return nil, nil, false
	}
	source := ast.GetSourceFileOfNode(statement)
	if source == nil || statement.Parent != source.AsNode() || source.IsDeclarationFile {
		return nil, nil, false
	}
	index, present := owner.values.indexes[source]
	if !present || index.incomplete || owner.values.indexPreparing[source] {
		return nil, nil, false
	}
	list := statement.AsVariableStatement().DeclarationList.AsVariableDeclarationList()
	if list.Flags&ast.NodeFlagsConst == 0 || len(list.Declarations.Nodes) != 1 {
		return nil, nil, false
	}
	declaration := list.Declarations.Nodes[0]
	rhs := declaration.Initializer()
	if !ast.IsIdentifier(declaration.Name()) || rhs == nil {
		return nil, nil, false
	}
	if ast.IsElementAccessExpression(rhs) && !ast.IsOptionalChain(rhs) && !ast.IsOptionalChain(rhs.Expression()) && rhs.AsElementAccessExpression().ArgumentExpression != nil && rhs.AsElementAccessExpression().ArgumentExpression.Kind == ast.KindStringLiteral && ast.IsPropertyAccessExpression(rhs.Expression()) && ast.IsIdentifier(rhs.Expression().Expression()) {
		plan, ok := qualifyClosedOwnGetterPlan(owner.values, statement, rhs.Expression(), 4096)
		if !ok {
			return nil, nil, false
		}
		for _, event := range owner.values.summary(statement).normal {
			if event.phase != nil {
				return nil, nil, false
			}
		}
		return declaration, plan, true
	}
	audit := ownGetterAudit{remaining: 4096}
	if !audit.eagerLiteral(rhs) {
		return nil, nil, false
	}
	return declaration, nil, true
}

type initializerEventDisposition uint8

const (
	initializerDispatch initializerEventDisposition = iota
	initializerAtomicDependency
	initializerStructuralUnwind
	initializerSkip
)

// moduleInitializerCursor is frame-local. Only actual finalized Get slots can
// supply completion. Reservations discharge syntax inside the atomic recipe.
// No cursor pointer may survive frame disposal.
type initializerObservationKind uint8

const (
	initializerObservationAbsent initializerObservationKind = iota
	initializerObservationFinalized
)

type moduleInitializerCursor struct {
	structuralStack          []*ast.Node
	frame                    *sourceValueInputs
	owner                    *sourceValueOwner
	plan                     *closedOwnGetterPlan
	declaration              *ast.Node
	inner, outer             *sourceNormalOperation
	innerOutput, outerOutput sourceResultObservation
	residual                 bool
}

func (c *moduleInitializerCursor) disposition(event sourceNormalDemand) initializerEventDisposition {
	if supportedBindingDeclaration(c.declaration) {
		if event.phase != nil && event.phase.node == c.declaration {
			return initializerDispatch
		}
		return initializerSkip
	}
	if event.phase != nil {
		c.residual = true
		return initializerSkip
	}
	if event.fold != nil {
		if event.fold.kind == sourceNormalEnter {
			c.structuralStack = append(c.structuralStack, event.fold.node)
		} else if len(c.structuralStack) == 0 || c.structuralStack[len(c.structuralStack)-1] != event.fold.node {
			c.residual = true
		} else {
			c.structuralStack = c.structuralStack[:len(c.structuralStack)-1]
		}
		return initializerStructuralUnwind
	}
	if event.operand != nil {
		return initializerSkip
	}
	if c.plan == nil {
		return initializerSkip
	}
	p := &c.plan.proof
	if event.node == p.inner {
		if c.residual {
			return initializerSkip
		}
		return initializerDispatch
	}
	if event.node == p.outer {
		if c.inner == nil || len(c.innerOutput.ownedGets) == 0 {
			c.residual = true
			return initializerSkip
		}
		return initializerDispatch
	}
	// A rowless or wholly nonnormal predecessor transports through O without
	// evaluating a key. Mixed populations leave key execution inside O's per-row recipe.
	if event.node == p.outer.AsElementAccessExpression().ArgumentExpression && c.inner != nil && len(c.innerOutput.ownedGets) == 1 {
		rows, ok := viewGetterReturn(c.innerOutput.ownedGets[0], p.getter)
		normal := false
		for _, row := range rows {
			normal = normal || row.completion == languageNormal
		}
		if !ok || !normal {
			return initializerStructuralUnwind
		}
	}
	if event.node == p.inner.Expression() || event.node == p.inner.Name() || event.node == p.outer.AsElementAccessExpression().ArgumentExpression {
		return initializerAtomicDependency
	}
	return initializerSkip
}
func (c *moduleInitializerCursor) observe(node *ast.Node, output sourceResultObservation, kind initializerObservationKind) {
	var slot *sourceNormalOperation
	if c.frame != nil {
		slot = c.frame.operations[node]
	}
	if kind != initializerObservationFinalized || c.plan == nil || slot == nil || (slot.state != sourceOperationConsumed && slot.state != sourceOperationRefused) {
		c.residual = true
		return
	}
	if node == c.plan.proof.inner {
		c.inner = slot
		c.innerOutput = output
		if len(output.ownedGets) == 0 {
			c.residual = true
		}
	}
	if node == c.plan.proof.outer {
		c.outer = slot
		c.outerOutput = output
	}
}

// finish reads the already consumed O result. It neither replays Get nor publishes.
func (c *moduleInitializerCursor) finish(fact *callableFacts, frame *sourceValueInputs) {
	if supportedBindingDeclaration(c.declaration) {
		slot := frame.operations[c.declaration]
		if slot == nil || slot.closedPrefix == nil || slot.state != sourceOperationConsumed || slot.closedPrefix.statement != frame.declaration || !slot.closedPrefix.published {
			c.residual = true
		}
		return
	}
	if len(c.structuralStack) != 0 {
		c.residual = true
	}
	defer func() {
		fact.initializerDraft = detachModuleInitializer(fact, c)
		installAwaitingInitializer(c.owner, fact.initializerDraft)
	}()
	if c.plan == nil {
		return
	}
	if c.outer == nil || frame.operations[c.plan.proof.outer] != c.outer || c.inner == nil || len(c.innerOutput.ownedGets) != 1 {
		c.residual = true
		return
	}
	output := normalGetOutput(c.outer)
	if len(output.ownedGets) != 1 || len(c.outerOutput.ownedGets) != 1 || output.ownedGets[0] != c.outerOutput.ownedGets[0] {
		c.residual = true
		return
	}
	p := output.ownedGets[0]
	prefix := c.innerOutput.ownedGets[0]
	if c.outer.authority.owner != c.plan.owner || c.outer.authority.generation != c.plan.owner.generation || frame.operationLifetime == nil {
		c.residual = true
		return
	}
	if _, ok := viewGetterReturn(prefix, c.plan.proof.getter); !ok {
		c.residual = true
		return
	}
	if p.prefix != prefix || p.association == nil || p.association != prefix.association {
		c.residual = true
		return
	}
	rows, ok := p.receipt.project()
	if !ok {
		c.residual = true
		return
	}
	for _, v := range output.values {
		r := v.value.ownedGetRow
		if r == nil || r.population != p || r.position < 0 || r.position >= len(rows) {
			c.residual = true
			return
		}
	}
	for _, r := range rows {
		if r.completion != languageNormal || r.value.object != nil {
			c.residual = true
		}
	}
}

// Initializer metadata contains detached classifications and generation-owned
// source keys only. It never stores receipts, values, populations or authority.
type moduleInitializerCompletion struct{ Completion, Pending, Domain, Remaining string }
type moduleInitializerCoverage struct {
	Node              *ast.Node `json:"-"`
	Position          int
	Role, Disposition string
}
type moduleInitializerDependency struct {
	Declaration *ast.Node `json:"-"`
	Source      string
	Position    int
	Mode, Donor string
}
type moduleInitializerClass struct {
	Causes                   []string
	Position                 int
	Environment, Description string
	Opaque, Incomplete       bool
}
type moduleInitializerDraft struct {
	PossibleProxyGets           []sourcePossibleProxyGetOrigin `json:"-"`
	OriginGeneration            *projectGeneration             `json:"-"`
	OriginMode                  [32]byte                       `json:"-"`
	Source                      *ast.SourceFile                `json:"-"`
	Statement, Declaration      *ast.Node                      `json:"-"`
	Program                     *compiler.Program              `json:"-"`
	Checker                     *checker.Checker               `json:"-"`
	FactID, Stamp, Mode, Status string
	Rows                        []moduleInitializerCompletion
	Coverage                    []moduleInitializerCoverage
	Dependencies                []moduleInitializerDependency
	Classes                     []moduleInitializerClass
	signature                   string
}
type moduleInitializerProjection struct {
	Draft                          *moduleInitializerDraft
	Revision                       uint64
	Sealed                         bool
	Donors                         []moduleInitializerClass
	DependencySignature, Signature string
}

func initializerHash(value interface{}) string {
	data, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	return fmt.Sprintf("%x", sha256.Sum256(data))
}
func initializerSourceStamp(source *ast.SourceFile) string {
	return initializerHash(sourceText(source, source.AsNode()))
}
func cloneModuleInitializerDraft(d *moduleInitializerDraft) *moduleInitializerDraft {
	if d == nil {
		return nil
	}
	v := *d
	v.PossibleProxyGets = append([]sourcePossibleProxyGetOrigin(nil), d.PossibleProxyGets...)
	v.Rows = append([]moduleInitializerCompletion(nil), d.Rows...)
	v.Coverage = append([]moduleInitializerCoverage(nil), d.Coverage...)
	v.Dependencies = append([]moduleInitializerDependency(nil), d.Dependencies...)
	v.Classes = append([]moduleInitializerClass(nil), d.Classes...)
	for i := range v.Classes {
		v.Classes[i].Causes = append([]string(nil), d.Classes[i].Causes...)
	}
	return &v
}
func initializerSkeleton(fact *callableFacts) *moduleInitializerDraft {
	d := &moduleInitializerDraft{Source: fact.sourceFile, Statement: fact.node, Declaration: fact.initializerDeclaration, FactID: fact.summary.ID, Stamp: initializerSourceStamp(fact.sourceFile), Mode: "CreationOnly", Status: "Building"}
	if fact.initializerPlan != nil {
		p := &fact.initializerPlan.proof
		d.Mode = "AtomicStaticGetChain"
		d.Dependencies = []moduleInitializerDependency{{Declaration: p.declaration, Source: p.source.FileName(), Position: p.declaration.Pos(), Mode: "DefinitionOnly", Donor: fmt.Sprintf("callable:%s:%d", p.source.FileName(), p.getter.Pos())}}
		for _, pair := range []struct {
			n    *ast.Node
			role string
		}{{p.inner, "I"}, {p.outer, "O"}, {p.inner.Expression(), "AtomicReceiver"}, {p.inner.Name(), "StaticName"}, {p.outer.AsElementAccessExpression().ArgumentExpression, "AtomicKey"}} {
			d.Coverage = append(d.Coverage, moduleInitializerCoverage{Node: pair.n, Position: pair.n.Pos(), Role: pair.role, Disposition: "Pending"})
		}
	}
	d.Coverage = append(d.Coverage, moduleInitializerCoverage{Node: d.Declaration, Position: d.Declaration.Pos(), Role: "DeclarationEnd", Disposition: "Pending"})
	return d
}

// installBuildingInitializers publishes reservations before any direct collection.
// Entries contain stable node/fact keys rather than pointers into the facts slice.
func installBuildingInitializers(owner *executableBodyOwner, source *ast.SourceFile, facts []callableFacts) {
	if owner == nil || owner.values == nil {
		return
	}
	v := owner.values
	if v.initializerDeclarations == nil {
		v.initializerDeclarations = map[*ast.Node]*moduleInitializerProjection{}
		v.initializerOccurrences = map[*ast.Node]*moduleInitializerProjection{}
	}
	for node, d := range v.initializerDeclarations {
		if d.Draft.Source == source {
			delete(v.initializerDeclarations, node)
		}
	}
	for node, d := range v.initializerOccurrences {
		if d.Draft.Source == source {
			delete(v.initializerOccurrences, node)
		}
	}
	v.initializerRevision++
	for i := range facts {
		f := &facts[i]
		if f.initializerDeclaration == nil {
			continue
		}
		d := initializerSkeleton(f)
		d.Program = v.program
		d.Checker = v.checker
		p := &moduleInitializerProjection{Draft: d, Revision: v.initializerRevision}
		v.initializerDeclarations[d.Declaration] = p
		for _, c := range d.Coverage {
			if c.Role == "I" || c.Role == "O" {
				v.initializerOccurrences[c.Node] = p
			}
		}
	}
}
func detachModuleInitializer(fact *callableFacts, c *moduleInitializerCursor) *moduleInitializerDraft {
	d := initializerSkeleton(fact)
	if c.owner != nil {
		d.Program = c.owner.program
		d.Checker = c.owner.checker
	}
	d.Status = "AwaitingGraph"
	if c.plan != nil {
		d.Program = c.plan.owner.program
		d.Checker = c.plan.owner.checker
		for i := range d.Coverage {
			entry := &d.Coverage[i]
			switch entry.Role {
			case "I":
				if c.inner != nil && len(c.innerOutput.ownedGets) > 0 {
					entry.Disposition = "Accounted"
				}
			case "O":
				if c.outer != nil && len(c.outerOutput.ownedGets) > 0 {
					entry.Disposition = "Accounted"
				}
			default:
				entry.Disposition = "Bypassed"
			}
		}
		if c.outer != nil && len(c.outerOutput.ownedGets) == 1 {
			if rows, ok := c.outerOutput.ownedGets[0].receipt.project(); ok {
				for _, r := range rows {
					domain := "NoSuccessfulValue"
					if r.completion == languageNormal {
						domain = "Primitive"
						if r.value.undefined {
							domain = "Undefined"
						}
						if r.value.object != nil {
							domain = "Object"
						}
					}
					if r.completion == languageResidual {
						domain = "Unrepresented"
						if r.pendingValue.object != nil {
							domain = "Object"
						} else if r.pendingValue.undefined {
							domain = "Undefined"
						} else if r.pendingValue.node != nil {
							domain = "Primitive"
						}
					}
					d.Rows = append(d.Rows, moduleInitializerCompletion{Completion: fmt.Sprint(r.completion), Pending: fmt.Sprint(r.pending), Domain: domain, Remaining: r.remaining})
				}
			}
		}
		if c.residual || len(d.Rows) == 0 {
			d.Status = "Unrepresented"
		}
	} else {
		domain := "Primitive"
		if ast.IsObjectLiteralExpression(c.declaration.Initializer()) {
			domain = "Object"
		}
		d.Rows = []moduleInitializerCompletion{{Completion: fmt.Sprint(languageNormal), Domain: domain}}
		if c.owner != nil {
			seen := map[*ast.Node]bool{}
			walkNode(c.declaration.Initializer(), func(node *ast.Node) bool {
				if !ast.IsIdentifier(node) || ast.IsDeclarationName(node) || isStaticPropertyName(node) || ast.IsPartOfTypeNode(node) {
					return true
				}
				symbol := c.owner.checker.GetSymbolAtLocation(node)
				if symbol == nil {
					return true
				}
				for _, declaration := range symbol.Declarations {
					if enclosingCallableNode(declaration) != nil || seen[declaration] {
						continue
					}
					source := ast.GetSourceFileOfNode(declaration)
					if source == nil || source.IsDeclarationFile {
						continue
					}
					seen[declaration] = true
					d.Dependencies = append(d.Dependencies, moduleInitializerDependency{Declaration: declaration, Source: source.FileName(), Position: declaration.Pos(), Mode: "CapturedDefinition"})
				}
				return true
			})
		}
		for i := range d.Coverage {
			d.Coverage[i].Disposition = "Bypassed"
		}
	}
	for _, e := range fact.summary.DirectEffectSources {
		d.Classes = append(d.Classes, moduleInitializerClass{Position: fact.node.Pos(), Environment: e.Environment, Description: e.Description, Opaque: e.Opaque, Incomplete: e.provenanceIncomplete})
	}
	if c.plan != nil {
		for _, op := range []struct {
			node   *ast.Node
			output sourceResultObservation
		}{{c.plan.proof.inner, c.innerOutput}, {c.plan.proof.outer, c.outerOutput}} {
			if len(op.output.ownedGets) != 1 {
				continue
			}
			for _, component := range op.output.ownedGets[0].components {
				delta := component.delta
				d.Classes = append(d.Classes, moduleInitializerClass{Position: op.node.Pos(), Opaque: delta.opaque, Incomplete: delta.valueIncomplete || delta.receiverIncomplete || delta.thenIncomplete, Causes: append([]string(nil), delta.ownedLocalCauses...)})
			}
		}
	}
	d.signature = "initializer-v1:" + initializerHash(canonicalInitializerDraft(d))
	return d
}

// sealModuleInitializers runs only after graph resolution and constraints. It
// installs a fresh immutable index with copied donor classifications atomically.
func sealModuleInitializers(owner *executableBodyOwner, facts []callableFacts) {
	if owner == nil || owner.values == nil {
		return
	}
	v := owner.values
	revision := v.initializerRevision + 1
	declarations := map[*ast.Node]*moduleInitializerProjection{}
	occurrences := map[*ast.Node]*moduleInitializerProjection{}
	byID := map[string]*callableFacts{}
	for i := range facts {
		byID[facts[i].summary.ID] = &facts[i]
	}
	for i := range facts {
		fact := &facts[i]
		if fact.initializerDraft == nil {
			continue
		}
		d := cloneModuleInitializerDraft(fact.initializerDraft)
		p := &moduleInitializerProjection{Draft: d, Revision: revision, Sealed: true}
		donors := []*callableFacts{fact}
		for _, dep := range d.Dependencies {
			if dep.Donor != "" {
				if donor := byID[dep.Donor]; donor != nil {
					donors = append(donors, donor)
				} else {
					p.Donors = append(p.Donors, moduleInitializerClass{Description: dep.Donor, Opaque: true})
				}
			}
		}
		stamps := []string{d.Stamp}
		for _, dep := range d.Dependencies {
			if dep.Declaration != nil {
				stamps = append(stamps, initializerSourceStamp(ast.GetSourceFileOfNode(dep.Declaration)))
			}
		}
		for _, donor := range donors {
			for _, e := range donor.summary.EffectSources {
				p.Donors = append(p.Donors, moduleInitializerClass{Position: donor.node.Pos(), Environment: e.Environment, Description: donor.summary.ID + ":" + e.Description, Opaque: e.Opaque, Incomplete: e.provenanceIncomplete})
			}
		}
		sort.Slice(p.Donors, func(i, j int) bool { return initializerHash(p.Donors[i]) < initializerHash(p.Donors[j]) })
		p.DependencySignature = initializerHash([]interface{}{p.Donors, stamps})
		p.Signature = initializerHash([]string{d.signature, p.DependencySignature})
		declarations[d.Declaration] = p
		for _, entry := range d.Coverage {
			if entry.Role == "I" || entry.Role == "O" {
				occurrences[entry.Node] = p
			}
		}
	}
	v.initializerDeclarations = declarations
	v.initializerOccurrences = occurrences
	v.initializerRevision = revision
}

// installAwaitingInitializer replaces the Building reservation with detached
// completion metadata. It cannot seal or classify donors before graph resolution.
func installAwaitingInitializer(owner *sourceValueOwner, draft *moduleInitializerDraft) {
	if owner == nil || draft == nil {
		return
	}
	owner.initializerRevision++
	projection := &moduleInitializerProjection{Draft: cloneModuleInitializerDraft(draft), Revision: owner.initializerRevision}
	owner.initializerDeclarations[draft.Declaration] = projection
	for _, entry := range draft.Coverage {
		if entry.Role == "I" || entry.Role == "O" {
			owner.initializerOccurrences[entry.Node] = projection
		}
	}
}

// canonicalInitializerDraft preserves receipt row order and sorts unordered
// coverage, dependency and classification metadata for content fingerprints.
// The bounded record costs O(n log n) and contains no pointer-address encoding.
func canonicalInitializerDraft(d *moduleInitializerDraft) *moduleInitializerDraft {
	c := cloneModuleInitializerDraft(d)
	sort.Slice(c.Coverage, func(i, j int) bool {
		a, b := c.Coverage[i], c.Coverage[j]
		if a.Position != b.Position {
			return a.Position < b.Position
		}
		return a.Role+":"+a.Disposition < b.Role+":"+b.Disposition
	})
	sort.Slice(c.Dependencies, func(i, j int) bool { return initializerHash(c.Dependencies[i]) < initializerHash(c.Dependencies[j]) })
	for i := range c.Classes {
		sort.Strings(c.Classes[i].Causes)
	}
	sort.Slice(c.Classes, func(i, j int) bool { return initializerHash(c.Classes[i]) < initializerHash(c.Classes[j]) })
	return c
}
