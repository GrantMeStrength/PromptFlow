/**
 * Headless pipeline test runner.
 * Tests the code generator + VM execution without launching Electron.
 *
 * Usage:  node scripts/test-pipelines.mjs
 *         npm run test:pipelines
 */

import vm from 'vm'
import { generateCode } from '../dist/shared/generator.js'

// ─── Mock runtime dependencies ────────────────────────────────────────────────

const mockLLMResponse = async (_model, prompt) => {
  // Return plausible JSON or text depending on prompt content
  if (prompt.includes('JSON') || prompt.includes('json') || prompt.includes('percentage')) {
    return JSON.stringify([{ label: 'Option A', value: 60 }, { label: 'Option B', value: 40 }])
  }
  if (prompt.includes('score') || prompt.includes('evaluate') || prompt.includes('criteria')) {
    return JSON.stringify({ score: 8, verdict: 'pass', reasoning: 'Mock evaluation passed.' })
  }
  return 'Mock LLM response.'
}

const mockFetch = async (url) => ({
  ok: true,
  status: 200,
  text: async () => `mock content from ${url}`,
  json: async () => ({ url, mock: true }),
})

function buildSandbox(uiInputs = {}) {
  return {
    inputs: {},
    __uiInputs__: uiInputs,
    __notifyNode__: () => {},
    callLLM: mockLLMResponse,
    callLLMWithTools: mockLLMResponse,
    fetch: mockFetch,
    getState: () => null,
    setState: () => {},
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Date, Math, JSON, Array, Object, String, Number, Boolean,
    Set, Map, Promise, RegExp, Error,
    parseInt, parseFloat, isNaN, isFinite,
    encodeURIComponent, decodeURIComponent,
    result: undefined,
  }
}

async function runCode(code, uiInputs = {}) {
  const sandbox = buildSandbox(uiInputs)
  const ctx = vm.createContext(sandbox)
  const script = new vm.Script(`(async () => { ${code} })()`)
  const promise = await script.runInContext(ctx, { timeout: 10000 })
  return promise
}

// ─── Test scenarios ───────────────────────────────────────────────────────────

const TESTS = [
  {
    name: 'Simple: UI → LLM → Output',
    nodes: [
      { id: 'n1', type: 'ui', position: { x: 0, y: 0 }, data: { label: 'Topic', kind: 'ui', uiKind: 'text', uiLabel: 'Enter topic' } },
      { id: 'n2', type: 'llm', position: { x: 200, y: 0 }, data: { label: 'Generate', kind: 'llm', llmModel: 'gpt-4o-mini', llmPromptTemplate: 'Write about: {{text}}' } },
      { id: 'n3', type: 'output', position: { x: 400, y: 0 }, data: { label: 'Result', kind: 'output' } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
    ],
    uiInputs: { n1: { value: 'the moon' } },
    expect: (result) => {
      if (result.__error) throw new Error(`Pipeline errored: ${result.message}`)
      return true
    },
  },

  {
    name: 'Function node: text transform',
    nodes: [
      { id: 'n1', type: 'ui', position: { x: 0, y: 0 }, data: { label: 'Input', kind: 'ui', uiKind: 'text' } },
      { id: 'n2', type: 'function', position: { x: 200, y: 0 }, data: { label: 'Uppercase', kind: 'function', code: 'return { result: (inputs.value || "").toUpperCase() }' } },
      { id: 'n3', type: 'output', position: { x: 400, y: 0 }, data: { label: 'Out', kind: 'output' } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
    ],
    uiInputs: { n1: { value: 'hello world' } },
    expect: (result) => {
      if (result.__error) throw new Error(`Pipeline errored: ${result.message}`)
      const val = result?.result ?? result?.value ?? result
      const str = typeof val === 'string' ? val : JSON.stringify(val)
      if (!str.includes('HELLO WORLD')) throw new Error(`Expected 'HELLO WORLD', got: ${str}`)
      return true
    },
  },

  {
    name: 'Judge node: LLM → Judge → Output',
    nodes: [
      { id: 'n1', type: 'ui', position: { x: 0, y: 0 }, data: { label: 'Text', kind: 'ui', uiKind: 'text' } },
      { id: 'n2', type: 'llm', position: { x: 200, y: 0 }, data: { label: 'Summarise', kind: 'llm', llmPromptTemplate: 'Summarise: {{text}}' } },
      { id: 'n3', type: 'judge', position: { x: 400, y: 0 }, data: { label: 'Evaluate', kind: 'judge' } },
      { id: 'n4', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Out', kind: 'output' } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
    ],
    uiInputs: { n1: { value: 'some text to evaluate' } },
    expect: (result) => {
      if (result.__error) throw new Error(`Pipeline errored: ${result.message}`)
      const verdict = result?.verdict ?? result?.value?.verdict
      if (!verdict) throw new Error(`Expected verdict in result, got: ${JSON.stringify(result)}`)
      return true
    },
  },

  {
    name: 'Note nodes: ignored in execution',
    nodes: [
      { id: 'note1', type: 'note', position: { x: 0, y: 0 }, data: { label: 'Intro', kind: 'note', noteContent: 'This is a note' } },
      { id: 'n1', type: 'ui', position: { x: 0, y: 100 }, data: { label: 'Input', kind: 'ui', uiKind: 'text' } },
      { id: 'n2', type: 'llm', position: { x: 200, y: 100 }, data: { label: 'Echo', kind: 'llm', llmPromptTemplate: '{{text}}' } },
      { id: 'n3', type: 'output', position: { x: 400, y: 100 }, data: { label: 'Out', kind: 'output' } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
    ],
    uiInputs: { n1: { value: 'test' } },
    expect: (result) => {
      if (result.__error) throw new Error(`Pipeline errored: ${result.message}`)
      return true
    },
  },

  {
    name: 'Error isolation: failing function does not crash pipeline',
    nodes: [
      { id: 'n1', type: 'ui', position: { x: 0, y: 0 }, data: { label: 'Input', kind: 'ui', uiKind: 'text' } },
      { id: 'n2', type: 'function', position: { x: 200, y: 0 }, data: { label: 'Boom', kind: 'function', code: 'throw new Error("deliberate failure")' } },
      { id: 'n3', type: 'function', position: { x: 400, y: 0 }, data: { label: 'After', kind: 'function', code: 'return { result: "should be skipped" }' } },
      { id: 'n4', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Out', kind: 'output' } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
    ],
    uiInputs: { n1: { value: 'test' } },
    expect: (result, trace) => {
      // The pipeline should complete (not throw), with n2 errored and n3/n4 skipped
      const n2 = trace.find(t => t.id === 'n2')
      const n3 = trace.find(t => t.id === 'n3')
      if (!n2?.error) throw new Error(`Expected n2 to have error in trace`)
      if (!n2.error.includes('deliberate failure')) throw new Error(`Wrong error: ${n2.error}`)
      if (!n3?.error?.includes('Skipped')) throw new Error(`Expected n3 to be skipped, got: ${n3?.error}`)
      return true
    },
  },

  {
    name: 'Multi-input: two UI nodes → LLM',
    nodes: [
      { id: 'topic', type: 'ui', position: { x: 0, y: 0 }, data: { label: 'Topic', kind: 'ui', uiKind: 'text' } },
      { id: 'tone', type: 'ui', position: { x: 0, y: 150 }, data: { label: 'Tone', kind: 'ui', uiKind: 'text' } },
      { id: 'n3', type: 'llm', position: { x: 250, y: 75 }, data: { label: 'Write', kind: 'llm', llmPromptTemplate: 'Write about {{topic}} in a {{tone}} tone.' } },
      { id: 'n4', type: 'output', position: { x: 450, y: 75 }, data: { label: 'Out', kind: 'output' } },
    ],
    edges: [
      { id: 'e1', source: 'topic', target: 'n3' },
      { id: 'e2', source: 'tone', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
    ],
    uiInputs: { topic: { value: 'cats' }, tone: { value: 'humorous' } },
    expect: (result) => {
      if (result.__error) throw new Error(`Pipeline errored: ${result.message}`)
      return true
    },
  },

  {
    name: 'File upload: content passed to function node',
    nodes: [
      { id: 'n1', type: 'ui', position: { x: 0, y: 0 }, data: { label: 'Upload', kind: 'ui', uiKind: 'file', uiAccept: '.md' } },
      { id: 'n2', type: 'function', position: { x: 200, y: 0 }, data: { label: 'Count words', kind: 'function', code: 'const text = inputs.content || inputs.value || ""; return { wordCount: text.trim().split(/\\s+/).length }' } },
      { id: 'n3', type: 'output', position: { x: 400, y: 0 }, data: { label: 'Out', kind: 'output' } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
    ],
    uiInputs: { n1: { filename: 'test.md', content: 'Hello world this is a test', value: 'Hello world this is a test', type: 'text/markdown', size: 26 } },
    expect: (result) => {
      if (result.__error) throw new Error(`Pipeline errored: ${result.message}`)
      const wc = result?.wordCount ?? result?.value?.wordCount
      if (typeof wc !== 'number' || wc < 1) throw new Error(`Expected wordCount, got: ${JSON.stringify(result)}`)
      return true
    },
  },

  {
    name: 'fetch in function node: HTTP request',
    nodes: [
      { id: 'n1', type: 'ui', position: { x: 0, y: 0 }, data: { label: 'URL', kind: 'ui', uiKind: 'text' } },
      { id: 'n2', type: 'function', position: { x: 200, y: 0 }, data: { label: 'Fetch', kind: 'function', code: 'const url = inputs.value || "https://example.com"; const r = await fetch(url); const text = await r.text(); return { status: r.status, length: text.length }' } },
      { id: 'n3', type: 'output', position: { x: 400, y: 0 }, data: { label: 'Out', kind: 'output' } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
    ],
    uiInputs: { n1: { value: 'https://example.com' } },
    expect: (result) => {
      if (result?.__error) throw new Error(`Pipeline errored: ${result.message}`)
      const status = result?.status ?? result?.value?.status
      if (status !== 200) throw new Error(`Expected status 200, got: ${JSON.stringify(result)}`)
      return true
    },
  },

  {
    name: 'Bar chart: UI × 2 → LLM → Function → Output (HTML)',
    nodes: [
      { id: 'ui-topic', type: 'ui', position: { x: 0, y: 0 }, data: { label: 'Topic', kind: 'ui', uiKind: 'text' } },
      { id: 'ui-options', type: 'ui', position: { x: 0, y: 150 }, data: { label: 'Options', kind: 'ui', uiKind: 'text' } },
      { id: 'llm-data', type: 'llm', position: { x: 250, y: 75 }, data: { label: 'Generate Data', kind: 'llm', llmPromptTemplate: 'Generate survey data JSON for {{topic}} with options {{options}}. Return JSON array only.' } },
      { id: 'fn-chart', type: 'function', position: { x: 500, y: 75 }, data: {
        label: 'Build Chart', kind: 'function',
        code: `const raw = String(inputs.data ?? inputs.value ?? '');
const cleaned = raw.replace(/^\`\`\`json?\\n?/i,'').replace(/\`\`\`$/,'').trim();
let rows;
try { rows = JSON.parse(cleaned) } catch { return { __html: '<p>Parse error: ' + raw.slice(0,100) + '</p>' } }
const bars = rows.map(r => '<div>' + r.label + ': ' + r.value + '</div>').join('');
return { __html: '<div>' + bars + '</div>' }`,
      } },
      { id: 'output-chart', type: 'output', position: { x: 750, y: 75 }, data: { label: 'Chart', kind: 'output' } },
    ],
    edges: [
      { id: 'e1', source: 'ui-topic', target: 'llm-data' },
      { id: 'e2', source: 'ui-options', target: 'llm-data' },
      { id: 'e3', source: 'llm-data', target: 'fn-chart' },
      { id: 'e4', source: 'fn-chart', target: 'output-chart' },
    ],
    uiInputs: { 'ui-topic': { value: 'Favourite soup?' }, 'ui-options': { value: 'Tomato, Chicken, Veg' } },
    expect: (result) => {
      if (result.__error) throw new Error(`Pipeline errored: ${result.message}`)
      const html = result?.__html ?? result?.value?.__html
      if (!html || !html.includes('<div>')) throw new Error(`Expected HTML output, got: ${JSON.stringify(result)}`)
      return true
    },
  },
]

// ─── Runner ───────────────────────────────────────────────────────────────────

const PASS = '\x1b[32m✓\x1b[0m'
const FAIL = '\x1b[31m✗\x1b[0m'
const DIM  = '\x1b[2m'
const RESET = '\x1b[0m'

let passed = 0
let failed = 0

console.log('\n\x1b[1mPromptFlow Pipeline Tests\x1b[0m\n')

for (const test of TESTS) {
  try {
    const code = generateCode(test.nodes, test.edges)
    const raw = await runCode(code, test.uiInputs)
    const result = raw?.__result
    const trace = raw?.__trace ?? []
    test.expect(result, trace)
    console.log(`${PASS} ${test.name}`)
    passed++
  } catch (err) {
    console.log(`${FAIL} ${test.name}`)
    console.log(`  ${DIM}${err.message}${RESET}`)
    failed++
  }
}

console.log(`\n${passed + failed} tests: \x1b[32m${passed} passed\x1b[0m${failed > 0 ? `, \x1b[31m${failed} failed\x1b[0m` : ''}`)
if (failed > 0) process.exit(1)
