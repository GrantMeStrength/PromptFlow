/**
 * Headless executor test runner.
 * Tests the new direct graph interpreter (executor.ts) against the same
 * scenarios as test-pipelines.mjs — verifying parity with the generator path.
 *
 * Usage:  node scripts/test-executor.mjs
 *         npm run test:executor
 */

import { runPipeline } from '../dist/shared/executor.js'
import { TESTS, mockLLMResponse, mockFetch, buildSandbox } from './test-pipelines.mjs'

// ─── Build ExecutionContext from a sandbox (for tests that use buildSandbox) ──

function sandboxToCtx(sandbox) {
  return {
    uiInputs: sandbox.__uiInputs__ ?? {},
    callLLM: sandbox.callLLM ?? mockLLMResponse,
    callLLMWithTools: sandbox.callLLMWithTools ?? mockLLMResponse,
    fetch: sandbox.fetch ?? mockFetch,
    getState: sandbox.getState ?? (() => null),
    setState: sandbox.setState ?? (() => {}),
    notifyNode: () => {},
  }
}

function buildCtx(test) {
  const sandbox = test.buildSandbox
    ? test.buildSandbox(test.uiInputs ?? {})
    : buildSandbox(test.uiInputs ?? {})
  const ctx = sandboxToCtx(sandbox)
  // Per-test LLM mock overrides default
  if (test.mockLLM) {
    ctx.callLLM = test.mockLLM
    ctx.callLLMWithTools = test.mockLLM
  }
  return ctx
}

// ─── Runner ───────────────────────────────────────────────────────────────────

const PASS = '\x1b[32m✓\x1b[0m'
const FAIL = '\x1b[31m✗\x1b[0m'
const DIM  = '\x1b[2m'
const RESET = '\x1b[0m'

let passed = 0
let failed = 0

console.log('\n\x1b[1mPromptFlow Executor Tests\x1b[0m\n')

for (const test of TESTS) {
  try {
    const ctx = buildCtx(test)
    const raw = await runPipeline(test.nodes, test.edges, ctx)
    const result = raw.__result
    const trace = raw.__trace
    test.expect(result, trace)
    console.log(`${PASS} ${test.name}`)
    passed++
  } catch (err) {
    console.log(`${FAIL} ${test.name}`)
    console.log(`  ${DIM}${err.message}${RESET}`)
    if (process.env.DEBUG_TESTS) {
      console.log(`${DIM}--- Test config ---`)
      console.log(`Nodes: ${test.nodes.map(n => n.data.kind).join(' → ')}${RESET}`)
    }
    failed++
  }
}

// ─── Executor-only tests (behaviour not replicated in generator) ──────────────

// When an edge has a named sourceHandle that doesn't exist on the upstream output,
// the executor falls back to the whole upstream and buildUserCodeInputs resolves
// the string via nested-object search — so the node code still gets a usable string.
// (The generator would put the whole object in the alias key instead.)
const EXECUTOR_ONLY = [
  {
    name: 'Executor: explicit sourceHandle missing from upstream → alias resolves string via nested search',
    uiInputs: { 'n-ui': { value: 'hello world test' } },
    nodes: [
      { id: 'n-ui', type: 'ui', position: { x: 0, y: 0 }, data: { label: 'Text', kind: 'ui', uiKind: 'text', inputs: [], outputs: [] }},
      { id: 'n-pipe', type: 'function', position: { x: 200, y: 0 }, data: {
        label: 'Pipe', kind: 'function',
        code: "return { text: inputs.value }",  // outputs { text: "..." }, no "value" key
        inputs: [], outputs: [],
      }},
      { id: 'n-fn', type: 'function', position: { x: 400, y: 0 }, data: {
        label: 'Count', kind: 'function',
        code: "return { count: inputs.text.split(' ').length }",
        inputs: [], outputs: [],
      }},
      { id: 'n-out', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Out', kind: 'output', code: 'return inputs', inputs: [], outputs: [] }},
    ],
    edges: [
      { id: 'e1', source: 'n-ui',   target: 'n-pipe', sourceHandle: 'value', targetHandle: 'value', animated: true },
      { id: 'e2', source: 'n-pipe', target: 'n-fn',   sourceHandle: 'value', targetHandle: 'text',  animated: true },
      { id: 'e3', source: 'n-fn',   target: 'n-out',  sourceHandle: 'count', targetHandle: 'count', animated: true },
    ],
    expect: (result, trace) => {
      const fnEntry = trace.find(t => t.id === 'n-fn')
      if (fnEntry?.error) throw new Error(`Function failed: ${fnEntry.error}`)
      if (result?.count !== 3) throw new Error(`Expected count=3, got ${JSON.stringify(result)}`)
    },
  },
]

for (const test of EXECUTOR_ONLY) {
  try {
    const ctx = {
      uiInputs: test.uiInputs ?? {},
      callLLM: mockLLMResponse,
      callLLMWithTools: mockLLMResponse,
      fetch: mockFetch,
      getState: () => null,
      setState: () => {},
      notifyNode: () => {},
    }
    const raw = await runPipeline(test.nodes, test.edges, ctx)
    test.expect(raw.__result, raw.__trace)
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