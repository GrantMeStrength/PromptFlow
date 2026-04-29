import type { FlowProject } from '../types'

/**
 * Demo: Batch Data Mapper
 * User pastes a list of items (one per line). A function node splits the list
 * and maps over each item, calling an LLM to enrich each one. A second function
 * collects the mapped results and formats a structured table.
 *
 * Flow:
 *   [Text: Item List] ──► [Fn: Split & Map] ──► [LLM: Enrich Item] ──► [Fn: Collect Results] ──► [Output]
 */
export const dataMapperProject: FlowProject = {
  id: 'demo-data-mapper-v1',
  name: 'Batch Data Mapper',
  description:
    'Paste a list of items (one per line). The workflow maps over each item, calls an LLM to enrich it with a one-sentence description, then collects all results into a formatted table.',
  version: '1',
  created: '2026-04-29T00:00:00.000Z',
  updated: '2026-04-29T00:00:00.000Z',
  nodes: [
    {
      id: 'note-intro',
      type: 'note',
      position: { x: 60, y: -140 },
      data: {
        label: 'Batch Data Mapper',
        kind: 'note',
        description: '',
        inputs: [],
        outputs: [],
        code: '',
        prompt: '',
        noteText: 'Paste a plain list of names (one per line) and the pipeline enriches each entry with a likely job title, industry, and short description — in a single LLM call. Demonstrates the split → batch-enrich → reformat pattern. A state node tracks the cumulative total of items enriched across all runs — run it several times to see the lifetime count grow.',
      },
    },
    {
      id: 'ui-list',
      type: 'ui',
      position: { x: 60, y: 240 },
      data: {
        label: 'Item List',
        kind: 'ui',
        uiKind: 'text',
        uiLabel: 'Enter items to enrich (one per line):',
        uiPlaceholder: 'TypeScript\nRust\nPython\nGo\nZig',
        description:
          'Accepts a newline-separated list of items. Each item will be individually enriched by the LLM.',
        inputs: [],
        outputs: [{ name: 'value', type: 'string', description: 'Raw newline-separated list' }],
        code: '',
        prompt: '',
      },
    },
    {
      id: 'fn-split',
      type: 'function',
      position: { x: 320, y: 240 },
      data: {
        label: 'Split List',
        kind: 'function',
        description:
          'Splits the raw input into an array of trimmed, non-empty items. Caps at 10 items to stay within LLM token limits.',
        inputs: [{ name: 'value', type: 'string', description: 'Newline-separated list' }],
        outputs: [
          { name: 'items', type: 'array', description: 'Array of individual items' },
          { name: 'count', type: 'number', description: 'Number of items' },
        ],
        code: `const raw = String(inputs.value ?? '')
const items = raw
  .split('\\n')
  .map(s => s.trim())
  .filter(Boolean)
  .slice(0, 10)
return { items, count: items.length }`,
        prompt: 'Split newline-separated text into a clean array of items, capped at 10',
      },
    },
    {
      id: 'llm-enrich',
      type: 'llm',
      position: { x: 590, y: 240 },
      data: {
        label: 'Enrich Each Item',
        kind: 'llm',
        description:
          'Receives the full array of items and returns a JSON array where each element has "name" and "description" fields. One LLM call processes the entire batch efficiently.',
        inputs: [{ name: 'items', type: 'array', description: 'Array of item names' }],
        outputs: [{ name: 'enriched', type: 'string', description: 'JSON array of enriched items' }],
        llmModel: 'gpt-4o-mini',
        llmPromptTemplate: `For each item in the following list, write a single concise sentence describing what it is.
Return ONLY a JSON array in this exact format (no markdown, no extra text):
[{"name":"Item","description":"One sentence description."},...]

Items:
{{items}}`,
        code: `const items = Array.isArray(inputs.items) ? inputs.items : []
const prompt = llmPromptTemplate.replace('{{items}}', items.join('\\n'))
const enriched = await callLLM(llmModel || 'gpt-4o-mini', prompt)
return { enriched }`,
        prompt: 'Return a JSON array with name + one-sentence description for each item in the list',
      },
    },
    {
      id: 'state-read-total',
      type: 'state',
      position: { x: 860, y: 60 },
      data: {
        label: 'Total Processed',
        kind: 'state',
        description: 'Reads the cumulative count of items enriched across all pipeline runs.',
        inputs: [],
        outputs: [{ name: 'value', type: 'number', description: 'Total items processed so far (lifetime)' }],
        stateKey: 'totalItemsProcessed',
        stateDefault: '0',
        stateMode: 'read',
        code: '',
        prompt: '',
      },
    },
    {
      id: 'fn-collect',
      type: 'function',
      position: { x: 860, y: 240 },
      data: {
        label: 'Format Results',
        kind: 'function',
        description:
          'Parses the LLM JSON response and formats items as a markdown table. Also computes a new lifetime total by adding this batch to the running state count.',
        inputs: [
          { name: 'enriched', type: 'string', description: 'JSON array from LLM' },
          { name: 'count', type: 'number', description: 'Expected item count' },
          { name: 'prevTotal', type: 'number', description: 'Cumulative total from state' },
        ],
        outputs: [
          { name: 'table', type: 'string', description: 'Formatted markdown table' },
          { name: 'processedCount', type: 'number', description: 'Number of items processed this run' },
          { name: 'newTotal', type: 'number', description: 'Updated cumulative total (this run + all previous)' },
        ],
        code: `const raw = String(inputs.enriched ?? '')
const count = Number(inputs.count ?? 0)
const prevTotal = Number(inputs.prevTotal ?? 0)
let rows = []
try {
  // Strip any accidental markdown fences
  const cleaned = raw.replace(/^\`\`\`json?\\n?/i, '').replace(/\`\`\`$/, '').trim()
  rows = JSON.parse(cleaned)
} catch {
  return { table: raw, processedCount: count, newTotal: prevTotal + count }
}
const header = '| # | Item | Description |\\n|---|------|-------------|'
const lines = rows.map((r, i) => \`| \${i + 1} | **\${r.name}** | \${r.description} |\`)
const table = [header, ...lines].join('\\n')
return { table, processedCount: rows.length, newTotal: prevTotal + rows.length }`,
        prompt: 'Parse LLM JSON output and format as a markdown table, computing the new lifetime total',
      },
    },
    {
      id: 'state-write-total',
      type: 'state',
      position: { x: 1120, y: 80 },
      data: {
        label: 'Save Total',
        kind: 'state',
        description: 'Persists the updated cumulative items-processed count for the next run.',
        inputs: [{ name: 'value', type: 'number', description: 'New cumulative total to store' }],
        outputs: [{ name: 'value', type: 'number', description: 'Stored value (pass-through)' }],
        stateKey: 'totalItemsProcessed',
        stateDefault: '0',
        stateMode: 'write',
        code: '',
        prompt: '',
      },
    },
    {
      id: 'output-table',
      type: 'output',
      position: { x: 1380, y: 240 },
      data: {
        label: 'Enriched Table',
        kind: 'output',
        description:
          'Displays the final formatted table of items with their LLM-generated descriptions. Shows both the batch count and the cumulative lifetime total.',
        inputs: [
          { name: 'table', type: 'string', description: 'Markdown table of enriched items' },
          { name: 'processedCount', type: 'number', description: 'Items processed this run' },
          { name: 'newTotal', type: 'number', description: 'Cumulative total items processed (all runs)' },
        ],
        outputs: [],
        code: `return { table: inputs.table, processedCount: inputs.processedCount, lifetimeTotal: inputs.newTotal }`,
        prompt: 'Output the enriched item table with batch count and lifetime total',
      },
    },
    {
      id: 'note-mapping',
      type: 'note',
      position: { x: 320, y: 420 },
      data: {
        label: 'About Mapping',
        kind: 'note',
        description: '',
        inputs: [],
        outputs: [],
        code: '',
        prompt: '',
        noteText: 'Paste a plain list of names (one per line) and the LLM "enriches" each entry — adding a likely job title, industry, and a brief description based on the name alone. The Split node converts the raw newline-separated text into a JavaScript array, which is passed to the LLM as a single batch (more efficient than one API call per item). The Format Results node then reassembles the enriched data into a readable table. This pattern — split → batch-enrich → reformat — is common in data pipeline workflows.',
      },
    },
  ],
  edges: [
    { id: 'e-ui-split', source: 'ui-list', target: 'fn-split', sourceHandle: 'value', targetHandle: 'value', animated: true, type: 'gradient' },
    { id: 'e-split-llm-items', source: 'fn-split', target: 'llm-enrich', sourceHandle: 'items', targetHandle: 'items', animated: true, type: 'gradient' },
    { id: 'e-split-collect-count', source: 'fn-split', target: 'fn-collect', sourceHandle: 'count', targetHandle: 'count', animated: true, type: 'gradient' },
    { id: 'e-llm-collect', source: 'llm-enrich', target: 'fn-collect', sourceHandle: 'enriched', targetHandle: 'enriched', animated: true, type: 'gradient' },
    { id: 'e-total-collect', source: 'state-read-total', target: 'fn-collect', sourceHandle: 'value', targetHandle: 'prevTotal', animated: true, type: 'gradient' },
    { id: 'e-collect-save-total', source: 'fn-collect', target: 'state-write-total', sourceHandle: 'newTotal', targetHandle: 'value', animated: true, type: 'gradient' },
    { id: 'e-collect-out-table', source: 'fn-collect', target: 'output-table', sourceHandle: 'table', targetHandle: 'table', animated: true, type: 'gradient' },
    { id: 'e-collect-out-count', source: 'fn-collect', target: 'output-table', sourceHandle: 'processedCount', targetHandle: 'processedCount', animated: true, type: 'gradient' },
    { id: 'e-collect-out-total', source: 'fn-collect', target: 'output-table', sourceHandle: 'newTotal', targetHandle: 'newTotal', animated: true, type: 'gradient' },
  ],
}
