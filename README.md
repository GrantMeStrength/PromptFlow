# PromptFlow IDE

> *A visual node-graph IDE for prompt-driven development.*

![PromptFlow IDE Screenshot](docs/screenshot.png)

---

## Why PromptFlow?

Two ideas drove this project:

1. **A world without source code** — As LLMs increasingly write and reason about code, why keep it in a form designed for humans? PromptFlow explores a future where programs are structured node graphs: unambiguous, provable, and directly manipulable by AI systems.

2. **Never lose a workflow again** — If you work with LLMs daily, you've built dozens of one-off document processing scripts, summarisers, classifiers, and chains — then lost them. PromptFlow is a personal library for all of them, with a visual editor to build, refine, and reuse.

---

## Quick Start

```bash
git clone https://github.com/grantmestrength/promptflow.git
cd promptflow
npm install
npm run dev        # Electron + Vite hot-reload
```

To build a production binary:

```bash
npm run build      # compiles renderer + main
npm start          # runs the built app
```

**Requirements:** Node.js 18+, npm 9+

---

## Features

### 🔷 Visual Node Canvas
- Drag-and-drop node graph built on [ReactFlow](https://reactflow.dev)
- Connect nodes by dragging from output handles to input handles
- Minimap, zoom, pan — full graph navigation
- Gradient edges with animated flow indicators
- **Live run highlighting** — the currently-executing node glows yellow with a pulsing indicator so you can follow execution in real time

### 🧩 Node Types

| Node | Colour | Purpose |
|------|--------|---------|
| **Input** | Blue | Receives pipeline input data |
| **UI** | Blue | Interactive widgets: text, file upload, select, buttons (collected before run) |
| **Function** | Green | Pure JavaScript transform — write any custom logic |
| **LLM** | Purple | Language model call (OpenAI, Anthropic Claude, Ollama) |
| **Judge** | Amber | LLM-based evaluator: scores content 0–10, returns `pass`/`fail`/`review` verdict + reasoning |
| **Chunker** | Orange | Splits large text into overlapping chunks for RAG or batch LLM processing |
| **Decision** | Amber | Conditional branching (if/else) |
| **Output** | Red | Collects and displays the final result |
| **Pipe** | Cyan | Reformats or extracts data between nodes |
| **System Prompt** | Teal | Injects a reusable system prompt into a connected LLM node |
| **State** | Cyan | Persistent key/value store — survives between pipeline runs |
| **MCP Server** | Teal | Connects an MCP tool server to an LLM node (filesystem, web, GitHub…) |
| **Workflow** | Indigo | Embeds a saved library project as a reusable sub-workflow node |
| **Trigger** | Slate | Scheduled or event-based pipeline trigger |
| **Sticky Note** | Yellow | Canvas annotations — not executed |

### 🤖 LLM Integration

- **OpenAI** models: set `OPENAI_API_KEY` in the Settings panel (`gpt-4o`, `gpt-4o-mini`, etc.)
- **Anthropic Claude**: set `ANTHROPIC_API_KEY` in Settings (`claude-3-5-sonnet-20241022`, etc.)
- **Ollama** (local): select any model prefixed `ollama/` (e.g. `ollama/llama3`), runs at `localhost:11434`
- **MCP tools**: wire an MCP Server node to an LLM node to give it tool access

### ⚖️ Judge Node

The Judge node is an LLM-powered evaluator — useful for quality gates, content moderation, and candidate scoring:

- Connect a **content source** (LLM, function, chunker) → arrives as the content to evaluate
- Connect a **criteria source** (UI text input, another node) → arrives as the evaluation criteria
- Outputs: `score` (0–10), `verdict` (`pass` / `fail` / `review`), `reasoning` (explanation string)
- Configurable model and custom system prompt

**Example use cases:** CV screening, essay grading, content safety checks, LLM output quality gates.

### ✂️ Chunker Node

Splits large text (documents, articles, scraped content) into overlapping chunks:

- Configurable `chunkSize` and `overlap`
- Outputs an array of chunks ready for batch LLM processing or vector embedding
- Wire it between a file upload UI node and an LLM node for RAG-style pipelines

### 📁 File Upload (UI Node)

The **UI** node with `file` type lets users upload documents before the pipeline runs:

- Supports `.pdf`, `.docx`, `.txt`, and plain text
- PDF text is automatically extracted (no external dependencies)
- The extracted text is available as `content`; metadata (`filename`, `size`, `type`) also provided
- Wire the `content` output directly into an LLM or Chunker node

### 🔧 System Prompt Node

Keeps reusable system prompts separate from LLM nodes:

- Wire a System Prompt node to any LLM node to inject a shared system prompt
- Edit the prompt text in the inspector
- Useful for maintaining a consistent persona or instruction set across multiple LLM nodes in a pipeline

### 🧙 Workflow Wizard

- Click the ✨ sparkle button in the toolbar
- Describe a workflow in plain English — the AI asks clarifying questions, then generates the full node graph
- Supports all node types including Judge, Chunker, System Prompt, and file upload UI nodes
- **"Apply to Canvas"** replaces (or merges into) the current project

### 📚 Project Library

- All projects saved to `~/Documents/PromptFlow/`
- Open the Library from the toolbar to browse, open, or delete saved workflows
- **Save to Library** stores the current project; **Export** saves to an arbitrary file path
- Library projects appear in the palette **Workflows** section — drag one onto the canvas to use it as a composable sub-workflow node

### 🔁 Sub-Workflows (Composable Nodes)

- Any library project can be embedded as a single **Workflow** node in another project
- Inputs are derived from the sub-workflow's Input nodes; output is `result`
- **Refresh from Library** in the inspector re-syncs ports if the original workflow changed
- Recursive cycle guard prevents a workflow from referencing itself

### ▶️ Code Generation & Execution

- The full node graph compiles to a self-contained async JavaScript pipeline
- Click **Code** in the toolbar to inspect the generated code
- Click **Run** to execute — UI nodes collect user input first, then the pipeline runs
- State nodes persist values across runs using the Electron main process
- **Currently-running node glows yellow** on the canvas during execution

### 📊 Output Panel

- **Markdown rendering** — LLM output is automatically rendered as formatted markdown (headings, lists, code blocks, bold/italic)
- **HTML output** — function nodes that return `{ __html: "..." }` are rendered as rich HTML (charts, tables, custom layouts)
- **Copy button** — copy any output to clipboard with one click
- **Execution trace** — expand the trace panel to see each node's output in sequence, useful for debugging

### 🔍 Node Inspector

- Click any node to open the right-hand inspector
- Edit label, description, code (Monaco editor), prompt templates, ports
- LLM nodes: choose model, edit prompt template, configure JSON response mode
- Judge nodes: configure model and evaluation system prompt
- UI nodes: configure widget type (text, file, select), label, placeholder, accepted file types
- System Prompt nodes: edit the system prompt text
- MCP nodes: enter server command, test connection, view available tools

### 💬 Natural Language Prompt Bar

Type commands at the bottom of the canvas, e.g.:

- *"add a function node called Validate Input that checks the input is not empty"*
- *"add an LLM node named Classify that categorises the document genre"*
- *"add a judge node to score the output"*
- *"describe the pipeline"*

---

## Demo Projects

The app ships with several built-in demos (accessible from the **Demos** toolbar menu):

- **Document Analyser** — extracts keywords, summarises, word counts
- **Tone-Aware Email Composer** — drafts emails with tone selection
- **Adventure Game** — interactive branching text game with state
- **Code Reviewer** — reviews code snippets with LLM feedback
- **Bar Chart Generator** — survey data via LLM, rendered as an interactive bar chart

---

## Configuration

Open **Settings** from the toolbar to configure:

| Setting | Description |
|---------|-------------|
| `OpenAI API Key` | For GPT-4o, GPT-4o-mini, etc. |
| `Anthropic API Key` | For Claude 3.5 Sonnet, Claude 3 Haiku, etc. |
| `Default Model` | Model used when no model is specified on a node |
| `Ollama Base URL` | Override if Ollama runs on a non-default port |

API keys are stored locally in the Electron app's user data directory — never sent anywhere except the respective API endpoints.

---

## Project File Format

Projects are saved as `.promptflow` JSON — structured for version control and LLM consumption:

```json
{
  "id": "uuid",
  "name": "My Workflow",
  "description": "...",
  "nodes": [ { "id": "...", "type": "...", "data": { "kind": "llm", ... } } ],
  "edges": [ { "id": "...", "source": "...", "target": "..." } ],
  "created": "ISO date",
  "updated": "ISO date"
}
```

---

## Architecture

```
src/
├── main/           Electron main process
│   ├── index.ts    IPC handlers: file I/O, code execution, LLM, MCP, state
│   └── mcp/        MCP stdio client (JSON-RPC 2.0 over child_process)
├── preload/        contextBridge — exposes safe IPC API to renderer
└── renderer/src/
    ├── types/      Core types: NodeData, FlowProject, PortDef, ElectronAPI
    ├── store/      Zustand state (nodes, edges, run, project, dirty tracking)
    ├── codegen/    JS code generator (topological sort → async pipeline + IIFE sub-workflows)
    ├── demo/       Built-in starter projects
    └── components/
        ├── Canvas/    ReactFlow canvas + CodeViewer + OutputPanel + TracePanel
        ├── Inspector/ Node detail panel (Monaco editor)
        ├── Palette/   Node type palette + library workflows
        ├── PromptBar/ Natural language command input
        ├── Toolbar/   File ops, demos, wizard, run
        ├── Library/   Library modal (browse + open saved projects)
        └── Wizard/    Workflow Wizard chat panel
```

---

## Contributing

This is an exploratory prototype. Issues and PRs welcome — especially:
- New node types
- Better code generation strategies
- Export to standalone executable
- Collaborative / multi-user editing

