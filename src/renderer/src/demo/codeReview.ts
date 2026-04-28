import type { FlowProject } from '../types'

/**
 * Demo: Code Review Assistant
 * User uploads a source-code file and picks a review focus area.
 * A function node parses basic stats, an LLM writes the review.
 *
 * Flow:
 *   [File: Upload Code] ──► [Fn: Parse Stats] ──┐
 *                                                ├──► [LLM: Write Review] ──► [Output]
 *   [Choice: Focus Area] ───────────────────────┘
 */
export const codeReviewProject: FlowProject = {
  id: 'demo-code-review-v1',
  name: 'Code Review Assistant',
  description:
    'Upload a source file, choose a focus area (Security / Performance / Readability), and get a targeted AI code review with stats.',
  version: '1',
  created: '2026-04-28T00:00:00.000Z',
  updated: '2026-04-28T00:00:00.000Z',
  nodes: [
    {
      id: 'ui-file',
      type: 'ui',
      position: { x: 80, y: 120 },
      data: {
        label: 'Source File',
        kind: 'ui',
        uiKind: 'file',
        uiLabel: 'Upload the source file to review:',
        uiAccept: '.js,.ts,.py,.go,.java,.cs,.rb,.php,.swift,.kt',
        description: 'Accepts a source code file from the user. Reads content as text for analysis.',
        inputs: [],
        outputs: [
          { name: 'filename', type: 'string', description: 'Original filename' },
          { name: 'content', type: 'string', description: 'File text content' },
        ],
        code: '',
        prompt: '',
      },
    },
    {
      id: 'ui-focus',
      type: 'ui',
      position: { x: 80, y: 340 },
      data: {
        label: 'Review Focus',
        kind: 'ui',
        uiKind: 'choice',
        uiLabel: 'What should the review focus on?',
        uiOptions: ['Security', 'Performance', 'Readability', 'Best Practices'],
        description: 'Lets the user choose which lens to apply to the code review.',
        inputs: [],
        outputs: [{ name: 'choice', type: 'string', description: 'Chosen focus area' }],
        code: '',
        prompt: '',
      },
    },
    {
      id: 'fn-stats',
      type: 'function',
      position: { x: 390, y: 120 },
      data: {
        label: 'Parse Code Stats',
        kind: 'function',
        description:
          'Calculates basic code metrics: line count, comment density, function definitions, and a truncated preview for the LLM context window.',
        inputs: [
          { name: 'content', type: 'string', description: 'Raw file content' },
          { name: 'filename', type: 'string', description: 'File name (for language detection)' },
        ],
        outputs: [
          { name: 'code', type: 'string', description: 'Full file content (pass-through)' },
          { name: 'filename', type: 'string', description: 'Filename' },
          { name: 'lineCount', type: 'number', description: 'Total lines' },
          { name: 'functionCount', type: 'number', description: 'Detected function definitions' },
          { name: 'commentRatio', type: 'string', description: 'Comment lines as % of total' },
        ],
        code: `const content = String(inputs.content ?? '')
const filename = String(inputs.filename ?? 'unknown')
const lines = content.split('\\n')
const commentLines = lines.filter(l => {
  const t = l.trim()
  return t.startsWith('//') || t.startsWith('#') || t.startsWith('*') || t.startsWith('/*')
})
const fnMatches = content.match(/\\b(function|def|func|fn)\\s+\\w+|=>|async\\s+\\w+\\s*\\(/) || []
const ratio = lines.length > 0
  ? ((commentLines.length / lines.length) * 100).toFixed(1) + '%'
  : '0%'
// Truncate to first 3000 chars so LLM context stays manageable
const preview = content.length > 3000 ? content.slice(0, 3000) + '\\n…(truncated)' : content
return {
  code: preview,
  filename,
  lineCount: lines.length,
  functionCount: fnMatches.length,
  commentRatio: ratio,
}`,
        prompt: 'Parse code stats: line count, function count, comment ratio, truncated preview',
      },
    },
    {
      id: 'llm-review',
      type: 'llm',
      position: { x: 700, y: 220 },
      data: {
        label: 'Write Review',
        kind: 'llm',
        description:
          'Calls the LLM to produce a targeted code review. Focuses on the area chosen by the user and considers the parsed stats for context.',
        inputs: [
          { name: 'code', type: 'string', description: 'Source code to review' },
          { name: 'focus', type: 'string', description: 'Review focus area' },
          { name: 'filename', type: 'string', description: 'File name' },
        ],
        outputs: [{ name: 'review', type: 'string', description: 'Markdown-formatted review' }],
        llmModel: 'gpt-4o',
        llmPromptTemplate: `You are a senior engineer performing a code review focused on **{{focus}}**.

File: {{filename}}

\`\`\`
{{code}}
\`\`\`

Provide a concise review with:
1. A one-sentence overall assessment
2. Up to 5 specific findings (each with line reference if possible)
3. A recommended next step

Format your response in Markdown.`,
        code: `const code = String(inputs.code ?? '')
const focus = String(inputs.focus ?? 'Best Practices')
const filename = String(inputs.filename ?? 'file')
const prompt = llmPromptTemplate
  .replace('{{focus}}', focus)
  .replace('{{filename}}', filename)
  .replace('{{code}}', code)
const review = await callLLM(llmModel || 'gpt-4o-mini', prompt)
return { review }`,
        prompt: 'Write a focused code review based on the source code and chosen focus area',
      },
    },
    {
      id: 'output-review',
      type: 'output',
      position: { x: 1000, y: 220 },
      data: {
        label: 'Review Report',
        kind: 'output',
        description:
          'Assembles the final review report combining the LLM narrative review with the parsed code statistics.',
        inputs: [
          { name: 'review', type: 'string', description: 'LLM review text' },
          { name: 'filename', type: 'string', description: 'File name' },
          { name: 'lineCount', type: 'number', description: 'Line count' },
          { name: 'functionCount', type: 'number', description: 'Function count' },
          { name: 'commentRatio', type: 'string', description: 'Comment density' },
        ],
        outputs: [],
        code: `return {
  filename: inputs.filename,
  stats: {
    lines: inputs.lineCount,
    functions: inputs.functionCount,
    commentRatio: inputs.commentRatio,
  },
  review: inputs.review,
  reviewedAt: new Date().toISOString(),
}`,
        prompt: 'Output the code review report with stats and LLM review text',
      },
    },
  ],
  edges: [
    {
      id: 'e-file-stats-content',
      source: 'ui-file',
      target: 'fn-stats',
      sourceHandle: 'content',
      targetHandle: 'content',
      animated: true,
    },
    {
      id: 'e-file-stats-name',
      source: 'ui-file',
      target: 'fn-stats',
      sourceHandle: 'filename',
      targetHandle: 'filename',
      animated: true,
    },
    {
      id: 'e-stats-review-code',
      source: 'fn-stats',
      target: 'llm-review',
      sourceHandle: 'code',
      targetHandle: 'code',
      animated: true,
    },
    {
      id: 'e-stats-review-name',
      source: 'fn-stats',
      target: 'llm-review',
      sourceHandle: 'filename',
      targetHandle: 'filename',
      animated: true,
    },
    {
      id: 'e-focus-review',
      source: 'ui-focus',
      target: 'llm-review',
      sourceHandle: 'choice',
      targetHandle: 'focus',
      animated: true,
    },
    {
      id: 'e-review-out',
      source: 'llm-review',
      target: 'output-review',
      sourceHandle: 'review',
      targetHandle: 'review',
      animated: true,
    },
    {
      id: 'e-stats-out-name',
      source: 'fn-stats',
      target: 'output-review',
      sourceHandle: 'filename',
      targetHandle: 'filename',
      animated: true,
    },
    {
      id: 'e-stats-out-lines',
      source: 'fn-stats',
      target: 'output-review',
      sourceHandle: 'lineCount',
      targetHandle: 'lineCount',
      animated: true,
    },
    {
      id: 'e-stats-out-fns',
      source: 'fn-stats',
      target: 'output-review',
      sourceHandle: 'functionCount',
      targetHandle: 'functionCount',
      animated: true,
    },
    {
      id: 'e-stats-out-cr',
      source: 'fn-stats',
      target: 'output-review',
      sourceHandle: 'commentRatio',
      targetHandle: 'commentRatio',
      animated: true,
    },
  ],
}
