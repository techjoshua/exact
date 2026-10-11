package exactcompiler

import "testing"

// Static clock aliases must resolve literal property keys without evaluating dynamic keys.
func TestTimeStaticMemberKeyProof(t *testing.T) {
	for _, c := range []struct {
		source, key, expected string
	}{
		{`({stamp:1})`, "stamp", "1"},
		{`({"stamp":1})`, "stamp", "1"},
		{`({["stamp"]:1})`, "stamp", "1"},
		{"({[`stamp`]:1})", "stamp", "1"},
		{`({stamp:1,["stamp"]:2})`, "stamp", "2"},
		{`({["stamp"]:1,stamp:2})`, "stamp", "2"},
		{`({stamp:1,[key()]:2})`, "stamp", ""},
		{`({[key()]:1,stamp:2})`, "stamp", "2"},
		{`({stamp:1,...rest})`, "stamp", ""},
		{`({...rest,stamp:2})`, "stamp", "2"},
		{`({stamp:1,get stamp(){return 2}})`, "stamp", ""},
		{`({stamp:1,stamp(){return 2}})`, "stamp", ""},
		{`({other:1})`, "stamp", ""},
		{`({1e0:2})`, "1", "2"},
		{`({[1]:2})`, "1", "2"},
		{`({1e21:2})`, "1e+21", "2"},
		{`({1e-7:2})`, "1e-7", "2"},
		{`({__proto__:1})`, "__proto__", ""},
		{`({["__proto__"]:1})`, "__proto__", "1"},
		{`([1,2])`, "1", "2"},
		{`(1)`, "stamp", ""},
		{`null`, "stamp", ""},
		{`([1,2])`, "01", ""},
		{`([1,2])`, "+1", ""},
		{`([1,2])`, "-0", ""},
		{`([,...rest])`, "0", ""},
		{`([...rest,2])`, "1", ""},
		{`([1,...rest])`, "0", "1"},
	} {
		t.Run(c.source, func(t *testing.T) {
			selected := timeSelectStaticMember(timeBoundaryExpression(t, c.source), []string{c.key}, nil, nil)
			if c.expected == "" {
				if selected != nil {
					t.Fatal("unproven member selected")
				}
			} else if selected == nil || selected.Text() != c.expected {
				t.Fatalf("static member selected a different value from JavaScript, expected %s", c.expected)
			}
		})
	}
}
