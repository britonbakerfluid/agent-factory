package designer

import (
	"encoding/hex"
	"fmt"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/wolzey/agent-factory/cli/internal/config"
)

const (
	fieldHairStyle = iota
	fieldHairColor
	fieldSkinTone
	fieldFacialHair
	fieldMouthStyle
	fieldFaceAccessory
	fieldHeadAccessory
	fieldShirtColor
	fieldShirtDesign
	fieldPantsColor
	fieldShoeColor
	fieldCount
)

const visibleFields = 14

var (
	titleStyle    = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#ff00ff"))
	focusedStyle  = lipgloss.NewStyle().Foreground(lipgloss.Color("#00ffff")).Bold(true)
	normalStyle   = lipgloss.NewStyle().Foreground(lipgloss.Color("#888888"))
	arrowStyle    = lipgloss.NewStyle().Foreground(lipgloss.Color("#ff00ff")).Bold(true)
	valueStyle    = lipgloss.NewStyle().Foreground(lipgloss.Color("#ffffff")).Bold(true)
	helpStyle     = lipgloss.NewStyle().Faint(true)
	borderStyle   = lipgloss.NewStyle().Foreground(lipgloss.Color("#ff00ff"))
	selectedStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("#00ff66")).Bold(true)
	scrollStyle   = lipgloss.NewStyle().Faint(true)
)

// Model is the bubbletea model for the avatar designer.
type Model struct {
	fields       []Field
	focused      int
	scrollOffset int
	selections   [fieldCount]int
	confirmed    bool
	cancelled    bool
	original     config.AvatarConfig
}

// Result holds the designer output.
type Result struct {
	Avatar    config.AvatarConfig
	Cancelled bool
}

// NewModel creates a new designer model, optionally pre-populated from existing config.
func NewModel(existing *config.AvatarConfig) Model {
	m := Model{
		fields: AllFields(),
	}

	if existing != nil {
		m.original = *existing
		m.selections[fieldHairStyle] = clampIdx(existing.SpriteIndex, len(m.fields[fieldHairStyle].Options))
		if existing.HairStyle != nil {
			m.selections[fieldHairStyle] = clampIdx(*existing.HairStyle, len(m.fields[fieldHairStyle].Options))
		}
		if existing.HairColor != nil {
			m.selectColor(fieldHairColor, *existing.HairColor)
		}
		if existing.SkinTone != nil {
			m.selectColor(fieldSkinTone, *existing.SkinTone)
		}
		if existing.ShirtColor != nil {
			m.selectColor(fieldShirtColor, *existing.ShirtColor)
		} else if existing.Color != "" {
			m.selectColor(fieldShirtColor, existing.Color)
		}
		if existing.PantsColor != nil {
			m.selectColor(fieldPantsColor, *existing.PantsColor)
		}
		if existing.ShoeColor != nil {
			m.selectColor(fieldShoeColor, *existing.ShoeColor)
		}
		if existing.FacialHair != nil {
			m.selections[fieldFacialHair] = clampIdx(*existing.FacialHair, len(m.fields[fieldFacialHair].Options))
		}
		if existing.MouthStyle != nil {
			m.selections[fieldMouthStyle] = clampIdx(*existing.MouthStyle, len(m.fields[fieldMouthStyle].Options))
		}
		if existing.FaceAccessory != nil {
			m.selections[fieldFaceAccessory] = clampIdx(*existing.FaceAccessory, len(m.fields[fieldFaceAccessory].Options))
		}
		if existing.HeadAccessory != nil {
			m.selections[fieldHeadAccessory] = clampIdx(*existing.HeadAccessory, len(m.fields[fieldHeadAccessory].Options))
		}
		if existing.ShirtDesign != nil {
			m.selections[fieldShirtDesign] = clampIdx(*existing.ShirtDesign, len(m.fields[fieldShirtDesign].Options))
		}
	}

	return m
}

func (m Model) Init() tea.Cmd {
	return nil
}

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "up", "k":
			m.focused--
			if m.focused < 0 {
				m.focused = fieldCount - 1
			}
			m.adjustScroll()
		case "down", "j":
			m.focused++
			if m.focused >= fieldCount {
				m.focused = 0
			}
			m.adjustScroll()
		case "left", "h":
			max := len(m.fields[m.focused].Options)
			m.selections[m.focused]--
			if m.selections[m.focused] < 0 {
				m.selections[m.focused] = max - 1
			}
		case "right", "l":
			max := len(m.fields[m.focused].Options)
			m.selections[m.focused]++
			if m.selections[m.focused] >= max {
				m.selections[m.focused] = 0
			}
		case "enter":
			m.confirmed = true
			return m, tea.Quit
		case "esc", "q":
			m.cancelled = true
			return m, tea.Quit
		case "ctrl+c":
			m.cancelled = true
			return m, tea.Quit
		}
	}
	return m, nil
}

func (m *Model) adjustScroll() {
	if m.focused < m.scrollOffset {
		m.scrollOffset = m.focused
	}
	if m.focused >= m.scrollOffset+visibleFields {
		m.scrollOffset = m.focused - visibleFields + 1
	}
}

func (m Model) View() string {
	var sb strings.Builder

	boxW := 68

	// Title
	sb.WriteString("\n")
	sb.WriteString(borderStyle.Render("  ╔"+strings.Repeat("═", boxW)+"╗") + "\n")
	titleText := fmt.Sprintf("%*s", -(boxW - 2), "               ✦ AVATAR DESIGNER ✦")
	sb.WriteString(borderStyle.Render("  ║") + " " + titleStyle.Render(titleText) + " " + borderStyle.Render("║") + "\n")
	sb.WriteString(borderStyle.Render("  ╠"+strings.Repeat("═", boxW)+"╣") + "\n")
	sb.WriteString(borderStyle.Render("  ║") + strings.Repeat(" ", boxW) + borderStyle.Render("║") + "\n")

	// Render preview
	params := m.currentParams()
	grid := DrawCharacter(params)
	preview := RenderPreview(grid, 1)
	previewLines := strings.Split(strings.TrimRight(preview, "\n"), "\n")

	// Build visible option lines with scroll window
	end := m.scrollOffset + visibleFields
	if end > fieldCount {
		end = fieldCount
	}

	var optionLines []string

	// Scroll-up indicator
	if m.scrollOffset > 0 {
		optionLines = append(optionLines, scrollStyle.Render("      ▲ more"))
	} else {
		optionLines = append(optionLines, "")
	}

	for i := m.scrollOffset; i < end; i++ {
		label := m.fields[i].Label
		value := m.fields[i].Options[m.selections[i]]

		var line string
		if i == m.focused {
			labelStr := focusedStyle.Render(fmt.Sprintf("%-14s", label))
			line = fmt.Sprintf("%s %s %s %s",
				labelStr,
				arrowStyle.Render("◀"),
				selectedStyle.Render(fmt.Sprintf("%-16s", value)),
				arrowStyle.Render("▶"),
			)
		} else {
			labelStr := normalStyle.Render(fmt.Sprintf("%-14s", label))
			line = fmt.Sprintf("%s   %s  ",
				labelStr,
				valueStyle.Render(fmt.Sprintf("%-16s", value)),
			)
		}
		optionLines = append(optionLines, line)
	}

	// Scroll-down indicator
	if end < fieldCount {
		optionLines = append(optionLines, scrollStyle.Render("      ▼ more"))
	} else {
		optionLines = append(optionLines, "")
	}

	// Combine preview (left) with options (right)
	maxLines := len(optionLines)
	if len(previewLines) > maxLines {
		maxLines = len(previewLines)
	}
	for i := 0; i < maxLines; i++ {
		previewPart := "                                "
		if i < len(previewLines) {
			previewPart = fmt.Sprintf("%-32s", previewLines[i])
		}

		optionPart := ""
		if i < len(optionLines) {
			optionPart = optionLines[i]
		}

		// Assemble row inside border
		row := fmt.Sprintf("    %s  %s", previewPart, optionPart)
		sb.WriteString(borderStyle.Render("  ║") + fmt.Sprintf("%-*s", boxW, row) + borderStyle.Render("║") + "\n")
	}

	sb.WriteString(borderStyle.Render("  ║") + strings.Repeat(" ", boxW) + borderStyle.Render("║") + "\n")

	// Help line
	helpText := helpStyle.Render("    ↑↓ navigate   ◀▶ change   enter confirm   esc cancel")
	sb.WriteString(borderStyle.Render("  ║") + fmt.Sprintf("%-*s", boxW, helpText) + borderStyle.Render("║") + "\n")
	sb.WriteString(borderStyle.Render("  ╚"+strings.Repeat("═", boxW)+"╝") + "\n")

	return sb.String()
}

// GetResult returns the designed avatar config.
func (m Model) GetResult() Result {
	if m.cancelled {
		return Result{Cancelled: true}
	}

	hairStyle := m.selections[fieldHairStyle]
	hairColor := m.fields[fieldHairColor].Colors[m.selections[fieldHairColor]]
	skinTone := m.fields[fieldSkinTone].Colors[m.selections[fieldSkinTone]]
	shirtColor := m.fields[fieldShirtColor].Colors[m.selections[fieldShirtColor]]
	pantsColor := m.fields[fieldPantsColor].Colors[m.selections[fieldPantsColor]]
	shoeColor := m.fields[fieldShoeColor].Colors[m.selections[fieldShoeColor]]
	facialHair := m.selections[fieldFacialHair]
	mouthStyle := m.selections[fieldMouthStyle]
	faceAccessory := m.selections[fieldFaceAccessory]
	headAccessory := m.selections[fieldHeadAccessory]
	shirtDesign := m.selections[fieldShirtDesign]

	return Result{
		Avatar: config.AvatarConfig{
			SpriteIndex:   hairStyle, // keep spriteIndex in sync for backwards compat
			Color:         shirtColor,
			Hat:           m.original.Hat,
			Trail:         m.original.Trail,
			GraphicDeath:  m.original.GraphicDeath,
			HairStyle:     &hairStyle,
			HairColor:     &hairColor,
			SkinTone:      &skinTone,
			ShirtColor:    &shirtColor,
			PantsColor:    &pantsColor,
			ShoeColor:     &shoeColor,
			FacialHair:    &facialHair,
			MouthStyle:    &mouthStyle,
			FaceAccessory: &faceAccessory,
			HeadAccessory: &headAccessory,
			ShirtDesign:   &shirtDesign,
		},
	}
}

func (m Model) currentParams() AvatarParams {
	return AvatarParams{
		HairStyle:     m.selections[fieldHairStyle],
		HairColor:     m.fields[fieldHairColor].Colors[m.selections[fieldHairColor]],
		SkinTone:      m.fields[fieldSkinTone].Colors[m.selections[fieldSkinTone]],
		ShirtColor:    m.fields[fieldShirtColor].Colors[m.selections[fieldShirtColor]],
		PantsColor:    m.fields[fieldPantsColor].Colors[m.selections[fieldPantsColor]],
		ShoeColor:     m.fields[fieldShoeColor].Colors[m.selections[fieldShoeColor]],
		FacialHair:    m.selections[fieldFacialHair],
		MouthStyle:    m.selections[fieldMouthStyle],
		FaceAccessory: m.selections[fieldFaceAccessory],
		HeadAccessory: m.selections[fieldHeadAccessory],
		ShirtDesign:   m.selections[fieldShirtDesign],
	}
}

// Run launches the designer TUI and returns the result.
func Run(existing *config.AvatarConfig) (Result, error) {
	m := NewModel(existing)
	p := tea.NewProgram(m, tea.WithAltScreen())
	finalModel, err := p.Run()
	if err != nil {
		return Result{Cancelled: true}, err
	}
	return finalModel.(Model).GetResult(), nil
}

func clampIdx(val, max int) int {
	if val < 0 {
		return 0
	}
	if val >= max {
		return max - 1
	}
	return val
}

// Preserve a web color that is not in the terminal palette until it is changed.
func (m *Model) selectColor(field int, color string) {
	for i, option := range m.fields[field].Colors {
		if strings.EqualFold(option, color) {
			m.selections[field] = i
			return
		}
	}
	if len(color) != 7 || color[0] != '#' {
		return
	}
	if _, err := hex.DecodeString(color[1:]); err != nil {
		return
	}
	m.selections[field] = len(m.fields[field].Colors)
	m.fields[field].Colors = append(m.fields[field].Colors, color)
	m.fields[field].Options = append(m.fields[field].Options, "Custom "+color)
}
