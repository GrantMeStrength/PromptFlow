import type { FlowProject } from '../types'

/**
 * Demo: Meeting Notes Processor
 * User pastes raw meeting notes. Two LLM nodes run in parallel — one extracts
 * action items, the other writes an executive summary. A function node merges
 * both results into a structured report.
 *
 * Flow:
 *                          ┌──► [LLM: Extract Actions] ──┐
 *   [Text: Meeting Notes] ─┤                              ├──► [Fn: Build Report] ──► [Output]
 *                          └──► [LLM: Exec Summary] ──────┘
 */
export const meetingNotesProject: FlowProject = {
  id: 'demo-meeting-notes-v1',
  name: 'Meeting Notes Processor',
  description:
    'Paste raw meeting notes. Two LLMs run in parallel: one extracts action items, the other writes an executive summary. A function merges them into a structured report.',
  version: '1',
  created: '2026-04-28T00:00:00.000Z',
  updated: '2026-04-28T00:00:00.000Z',
  nodes: [
    {
      id: 'ui-notes',
      type: 'ui',
      position: { x: 80, y: 260 },
      data: {
        label: 'Meeting Notes',
        kind: 'ui',
        uiKind: 'text',
        uiLabel: 'Paste your meeting notes:',
        uiPlaceholder: 'Weekly sync — 28 Apr 2026\nAttendees: Alice, Bob, Carol\n\nAlice: Q2 targets are at 74%…',
        description:
          'Accepts raw meeting notes from the user. The same text fans out to two parallel LLM processing nodes.',
        inputs: [],
        outputs: [{ name: 'value', type: 'string', description: 'Raw meeting notes text' }],
        code: '',
        prompt: '',
      },
    },
    {
      id: 'llm-actions',
      type: 'llm',
      position: { x: 380, y: 100 },
      data: {
        label: 'Extract Action Items',
        kind: 'llm',
        description:
          'Calls the LLM to identify and list concrete action items from the meeting notes. Returns a numbered list with owner and deadline when mentioned.',
        inputs: [{ name: 'notes', type: 'string', description: 'Raw meeting notes' }],
        outputs: [{ name: 'actions', type: 'string', description: 'Numbered list of action items' }],
        llmModel: 'gpt-4o',
        llmPromptTemplate: `Extract all action items from the following meeting notes.
Format each as: "N. [Owner] – Task (Due: date or TBD)"
If no owner is mentioned write "Unassigned".
Return only the numbered list, nothing else.

Meeting notes:
{{notes}}`,
        code: `const notes = String(inputs.notes ?? '')
const prompt = llmPromptTemplate.replace('{{notes}}', notes)
const actions = await callLLM(llmModel || 'gpt-4o-mini', prompt)
return { actions }`,
        prompt: 'Extract action items from meeting notes as a numbered list with owners and deadlines',
      },
    },
    {
      id: 'llm-summary',
      type: 'llm',
      position: { x: 380, y: 400 },
      data: {
        label: 'Executive Summary',
        kind: 'llm',
        description:
          'Calls the LLM to produce a concise executive summary of the meeting — key decisions, topics discussed, and outcomes in 3–5 sentences.',
        inputs: [{ name: 'notes', type: 'string', description: 'Raw meeting notes' }],
        outputs: [{ name: 'summary', type: 'string', description: 'Executive summary paragraph' }],
        llmModel: 'gpt-4o',
        llmPromptTemplate: `Write a 3-5 sentence executive summary of the following meeting notes.
Focus on key decisions made and outcomes agreed. Be factual and concise.

Meeting notes:
{{notes}}`,
        code: `const notes = String(inputs.notes ?? '')
const prompt = llmPromptTemplate.replace('{{notes}}', notes)
const summary = await callLLM(llmModel || 'gpt-4o-mini', prompt)
return { summary }`,
        prompt: 'Write a concise executive summary of the meeting covering key decisions and outcomes',
      },
    },
    {
      id: 'fn-report',
      type: 'function',
      position: { x: 700, y: 260 },
      data: {
        label: 'Build Report',
        kind: 'function',
        description:
          'Merges the action items and executive summary into a structured report object. Also counts the number of action items for the header.',
        inputs: [
          { name: 'actions', type: 'string', description: 'Numbered action items list' },
          { name: 'summary', type: 'string', description: 'Executive summary' },
        ],
        outputs: [
          { name: 'summary', type: 'string', description: 'Executive summary' },
          { name: 'actions', type: 'string', description: 'Action items list' },
          { name: 'actionCount', type: 'number', description: 'Number of action items' },
          { name: 'generatedAt', type: 'string', description: 'Timestamp' },
        ],
        code: `const actions = String(inputs.actions ?? '')
const summary = String(inputs.summary ?? '')
// Count non-empty lines that start with a digit (numbered list items)
const actionCount = actions.split('\\n').filter(l => /^\\d+\\./.test(l.trim())).length
return {
  summary,
  actions,
  actionCount,
  generatedAt: new Date().toISOString(),
}`,
        prompt: 'Merge action items and executive summary into a structured report with a count of action items',
      },
    },
    {
      id: 'output-report',
      type: 'output',
      position: { x: 980, y: 260 },
      data: {
        label: 'Meeting Report',
        kind: 'output',
        description:
          'Final structured report containing the executive summary, action items, count, and generation timestamp. Ready to be displayed or emailed.',
        inputs: [
          { name: 'summary', type: 'string', description: 'Executive summary' },
          { name: 'actions', type: 'string', description: 'Action items' },
          { name: 'actionCount', type: 'number', description: 'Count' },
          { name: 'generatedAt', type: 'string', description: 'Timestamp' },
        ],
        outputs: [],
        code: `return {
  summary: inputs.summary,
  actionItems: inputs.actions,
  actionCount: inputs.actionCount,
  generatedAt: inputs.generatedAt,
}`,
        prompt: 'Output the complete meeting report',
      },
    },
  ],
  edges: [
    {
      id: 'e-notes-actions',
      source: 'ui-notes',
      target: 'llm-actions',
      sourceHandle: 'value',
      targetHandle: 'notes',
      animated: true,
    },
    {
      id: 'e-notes-summary',
      source: 'ui-notes',
      target: 'llm-summary',
      sourceHandle: 'value',
      targetHandle: 'notes',
      animated: true,
    },
    {
      id: 'e-actions-report',
      source: 'llm-actions',
      target: 'fn-report',
      sourceHandle: 'actions',
      targetHandle: 'actions',
      animated: true,
    },
    {
      id: 'e-summary-report',
      source: 'llm-summary',
      target: 'fn-report',
      sourceHandle: 'summary',
      targetHandle: 'summary',
      animated: true,
    },
    {
      id: 'e-report-out-summary',
      source: 'fn-report',
      target: 'output-report',
      sourceHandle: 'summary',
      targetHandle: 'summary',
      animated: true,
    },
    {
      id: 'e-report-out-actions',
      source: 'fn-report',
      target: 'output-report',
      sourceHandle: 'actions',
      targetHandle: 'actions',
      animated: true,
    },
    {
      id: 'e-report-out-count',
      source: 'fn-report',
      target: 'output-report',
      sourceHandle: 'actionCount',
      targetHandle: 'actionCount',
      animated: true,
    },
    {
      id: 'e-report-out-ts',
      source: 'fn-report',
      target: 'output-report',
      sourceHandle: 'generatedAt',
      targetHandle: 'generatedAt',
      animated: true,
    },
  ],
}
