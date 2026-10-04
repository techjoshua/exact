package exactcompiler

import "testing"

func TestRenderProgramMathMLTextIntegration(t *testing.T) {
	for _, parent := range []string{"mi", "mo", "mn", "ms", "mtext"} {
		inherited := renderProgramChildNamespace(parent, "mathml", nil)
		for tag, expected := range map[string]string{"button": "html", "mglyph": "mathml", "malignmark": "mathml", "svg": "svg", "math": "mathml"} {
			if actual := renderProgramNamespace(tag, inherited); actual != expected {
				t.Errorf("%s/%s namespace = %s, want %s", parent, tag, actual, expected)
			}
		}
	}
	if actual := renderProgramChildNamespace("mrow", "mathml", nil); actual != "mathml" {
		t.Errorf("ordinary MathML container namespace = %s", actual)
	}
	if actual := renderProgramChildNamespace("foreignObject", "svg", nil); actual != "html" {
		t.Errorf("SVG HTML integration namespace = %s", actual)
	}
}
