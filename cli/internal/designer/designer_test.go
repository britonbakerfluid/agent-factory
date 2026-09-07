package designer

import (
	"github.com/wolzey/agent-factory/cli/internal/config"
	"testing"
)

func TestWebChoicesSurviveTerminalEditing(t *testing.T) {
	hair, glasses, flower, beard, mouth, shirt := 2, 1, 6, 4, 1, 9
	hairColor, skin, top, pants, shoes := "#604332", "#ae704e", "#5f8f78", "#2b3440", "#e7b398"
	avatar := config.AvatarConfig{SpriteIndex: hair, Color: top, HairStyle: &hair, HairColor: &hairColor, SkinTone: &skin, ShirtColor: &top, PantsColor: &pants, ShoeColor: &shoes, FaceAccessory: &glasses, HeadAccessory: &flower, FacialHair: &beard, MouthStyle: &mouth, ShirtDesign: &shirt}
	hat, trail, graphic := "legacy hat", "spark", false
	avatar.Hat, avatar.Trail, avatar.GraphicDeath = &hat, &trail, &graphic
	model := NewModel(&avatar)
	model.confirmed = true
	preview := model.currentParams()
	if preview.HairColor != hairColor || preview.ShirtColor != top || preview.HairStyle != hair || preview.FaceAccessory != glasses {
		t.Fatal("preview lost saved appearance")
	}
	// Editing only the hair must keep the rest of the saved custom palette.
	model.selections[fieldHairStyle] = 6
	result := model.GetResult().Avatar
	if result.Hat != avatar.Hat || result.Trail != avatar.Trail || result.GraphicDeath != avatar.GraphicDeath {
		t.Fatal("unrelated avatar settings changed")
	}
	if *result.HairStyle != 6 || *result.FaceAccessory != glasses || *result.HeadAccessory != flower || *result.FacialHair != beard || *result.MouthStyle != mouth || *result.ShirtDesign != shirt {
		t.Fatal("saved style choices changed")
	}
	if *result.HairColor != hairColor || *result.SkinTone != skin || *result.ShirtColor != top || *result.PantsColor != pants || *result.ShoeColor != shoes {
		t.Fatal("custom colors were replaced by palette defaults")
	}
	// Imported swatches are local to this designer, never global palette entries.
	if len(NewModel(nil).fields[fieldHairColor].Colors) != len(HairColors) {
		t.Fatal("custom color leaked into a new designer")
	}
}

func TestLegacyHairAndTerminalStyleIndicesStayCompatible(t *testing.T) {
	model := NewModel(&config.AvatarConfig{SpriteIndex: 6, Color: "#4a90d9"})
	if model.currentParams().HairStyle != 6 {
		t.Fatal("legacy sprite-index haircut changed")
	}
	for _, styles := range [][]StyleOption{HairStyles, FacialHairStyles, MouthStyles, FaceAccessories, HeadAccessories, ShirtDesigns} {
		for i, style := range styles {
			if i != style.Index {
				t.Fatal("terminal style index changed")
			}
		}
	}
	for i := range HairStyles {
		model.selections[fieldHairStyle] = i
		model.confirmed = true
		got := model.GetResult().Avatar
		if got.SpriteIndex != i || *got.HairStyle != i {
			t.Fatal("saved style differs from the selected style")
		}
	}
}
