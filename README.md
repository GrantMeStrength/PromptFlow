# PromptFlow IDE

A prototype visual IDE for prompt-driven development — code as connected nodes, designed for LLM systems.

## Run

```bash
# Development (Vite hot-reload + Electron)
npm run dev

# Production build + run
npm start
```

## What you'll see

The app opens with the **Document Analysis Pipeline** demo pre-loaded:

```
Document Input → Extract Keywords ──→ Summarize (LLM) → Analysis Report
              └→ Word Count ─────────────────────────↗
```

### Canvas
- **Drag** nodes around
- **Connect** nodes by dragging from an output handle (right side) to an input handle (left side)
- **Delete** selected nodes/edges with the Delete key

### Left: Node Palette
Click any node type to add it to the canvas:
- 🔵 **Input** — receives pipeline input
- 🟢 **Function** — pure JS transform
- 🟣 **LLM** — language model call (mock in prototype)
- 🟡 **Decision** — conditional branch
- 🔴 **Output** — collects final result

### Right: Inspector Panel
Click any node to inspect it:
- Edit the label and description
- View/edit the generated JavaScript code (Monaco editor)
- See typed input/output ports
- For LLM nodes: edit the prompt template and model

### Bottom: Prompt Bar
Type natural language to add nodes:
> "add a function node called Validate Input that checks the input is not empty"
> "add an LLM node named Classify that categorises the document genre"
> "describe the pipeline"

### Toolbar
- **New / Open / Save** — project files saved as `.promptflow` JSON
- **Code** — toggle generated JavaScript panel (shows the full runnable pipeline)
- **Output** — toggle execution output panel
- **Run** — executes the pipeline and shows results

## Project format

Projects save as `.promptflow` JSON files containing nodes, edges, and metadata — structured for LLM consumption and version control.

## Architecture

```
src/
├── main/         Electron main process (file I/O, vm code execution, menu)
├── preload/      contextBridge IPC API
└── renderer/src/
    ├── types/    Core types: NodeData, FlowProject, PortDef, ElectronAPI
    ├── store/    Zustand state (nodes, edges, run, project)
    ├── codegen/  JS code generator (topological sort → async pipeline)
    ├── demo/     Document Analysis Pipeline starter project
    └── components/
        ├── Canvas/   ReactFlow canvas + CodeViewer + OutputPanel
        ├── Inspector/ Node detail panel (Monaco editor)
        ├── Palette/   Node type palette
        ├── PromptBar/ Natural language command input
        └── Toolbar/   File ops + Run button
```
