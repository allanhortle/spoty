package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"os"
	"time"

	"github.com/76creates/stickers"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

var selectedValue string = "\nselect something with spacebar or enter"

type model struct {
	table   *stickers.TableSingleType[string]
	infoBox *stickers.FlexBox
	headers []string
}

type drop struct {
	Title   string    `json "title"`
	Domain  string    `json "domain"`
	Created time.Time `json "created"`
	Link    string    `json "link"`
}

func main() {
	// read in CSV data
	jsonFile, _ := ioutil.ReadFile("raindrop.json")
	data := []drop{}
	if err := json.Unmarshal([]byte(jsonFile), &data); err != nil {
		panic(err)
	}

	headers := []string{"Title", "Domain", "Created"}
	ratio := []int{2, 1, 1}
	minSize := []int{4, 5, 10}
	rows := make([][]string, len(data))
	for i, drop := range data {
		rows[i] = []string{drop.Title, drop.Domain, drop.Created.Format("2006-01-02 15:04")}
	}

	m := model{
		table:   stickers.NewTableSingleType[string](0, 0, headers),
		infoBox: stickers.NewFlexBox(0, 0).SetHeight(7),
		headers: headers,
	}
	// setup
	m.table.SetTypes(
	m.table.SetRatio(ratio).SetMinWidth(minSize)
	// add rows
	m.table.AddRows(rows)

	// setup info box
	infoText := `
use the arrows to navigate
ctrl+s: sort by current column
alphanumerics: filter column
enter, spacebar: get column value
ctrl+c: quit
`
	r1 := m.infoBox.NewRow()
	r1.AddCells([]*stickers.FlexBoxCell{
		stickers.NewFlexBoxCell(1, 1).
			SetID("info").
			SetContent(infoText),
		stickers.NewFlexBoxCell(1, 1).
			SetID("info").
			SetContent(selectedValue).
			SetStyle(lipgloss.NewStyle().Bold(true)),
	})
	m.infoBox.AddRows([]*stickers.FlexBoxRow{r1})

	p := tea.NewProgram(&m, tea.WithAltScreen())
	if err := p.Start(); err != nil {
		fmt.Printf("Alas, there's been an error: %v", err)
		os.Exit(1)
	}
}

func (m *model) Init() tea.Cmd { return nil }

func (m *model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.table.SetWidth(msg.Width)
		m.table.SetHeight(msg.Height - m.infoBox.GetHeight())
		m.infoBox.SetWidth(msg.Width)
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c", "q":
			return m, tea.Quit
		case "down", "j":
			m.table.CursorDown()
		case "up", "k":
			m.table.CursorUp()
		case "left", "h":
			m.table.CursorLeft()
		case "right", "l":
			m.table.CursorRight()
		case "[", "]":
			x, _ := m.table.GetCursorLocation()
			m.table.OrderByColumn(x)
		case "enter", " ":
			selectedValue = m.table.GetCursorValue()
			m.infoBox.Row(0).Cell(1).SetContent("\nselected cell: " + selectedValue)
		}

	}
	return m, nil
}

func (m *model) View() string {
	return lipgloss.JoinVertical(lipgloss.Left, m.table.Render(), m.infoBox.Render())
}
