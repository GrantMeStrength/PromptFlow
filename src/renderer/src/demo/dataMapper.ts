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
      id: 'fn-collect',
      type: 'function',
      position: { x: 860, y: 240 },
      data: {
        label: 'Format Results',
        kind: 'function',
        description:
          'Parses the LLM JSON response and formats the enriched items as a readable markdown table. Falls back to raw output if JSON parsing fails.',
        inputs: [
          { name: 'enriched', type: 'string', description: 'JSON array from LLM' },
          { name: 'count', type: 'number', description: 'Expected item count' },
        ],
        outputs: [
          { name: 'table', type: 'string', description: 'Formatted markdown table' },
          { name: 'processedCount', type: 'number', description: 'Number of items processed' },
        ],
        code: `const raw = String(inputs.enriched ?? '')
const count = Number(inputs.count ?? 0)
let rows = []
try {
  // Strip any accidental markdown fences
  const cleaned = raw.replace(/^\`\`\`json?\\n?/i, '').replace(/\`\`\`$/, '').trim()
  rows = JSON.parse(cleaned)
} catch {
  return { table: raw, processedCount: count }
}
const header = '| # | Item | Description |\\n|---|------|-------------|'
const lines = rows.map((r, i) => \`| \${i + 1} | **\${r.name}** | \${r.description} |\`)
const table = [header, ...lines].join('\\n')
return { table, processedCount: rows.length }`,
        prompt: 'Parse LLM JSON output and format enriched items as a markdown table',
      },
    },
    {
      id: 'output-table',
      type: 'output',
      position: { x: 1120, y: 240 },
      data: {
        label: 'Enriched Table',
        kind: 'output',
        description:
          'Displays the final formatted table of items with their LLM-generated descriptions. Shows the count of processed items.',
        inputs: [
          { name: 'table', type: 'string', description: 'Markdown table of enriched items' },
          { name: 'processedCount', type: 'number', description: 'Items processed' },
        ],
        outputs: [],
        code: `return { table: inputs.table, processedCount: inputs.processedCount }`,
        prompt: 'Output the enriched item table',
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
    { id: 'e-collect-out-table', source: 'fn-collect', target: 'output-table', sourceHandle: 'table', targetHandle: 'table', animated: true, type: 'gradient' },
    { id: 'e-collect-out-count', source: 'fn-collect', target: 'output-table', sourceHandle: 'processedCount', targetHandle: 'processedCount', animated: true, type: 'gradient' },
  ],
}
