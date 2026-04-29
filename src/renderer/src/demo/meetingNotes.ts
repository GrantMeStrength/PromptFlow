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
      id: 'note-intro',
      type: 'note',
      position: { x: 80, y: -140 },
      data: {
        label: 'Meeting Notes Processor',
        kind: 'note',
        description: '',
        inputs: [],
        outputs: [],
        code: '',
        prompt: '',
        noteText: 'Paste raw meeting notes and get two outputs simultaneously: a bullet-point action item list (with owners and deadlines) and a concise executive summary. Two specialised LLM nodes run in parallel, then a function merges the results. State nodes track how many meetings you have processed — run it multiple times and watch the session counter increment as history accumulates.',
      },
    },
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
      id: 'state-read-history',
      type: 'state',
      position: { x: 700, y: 60 },
      data: {
        label: 'Meeting History',
        kind: 'state',
        description: 'Reads the accumulated list of previous meetings processed through this pipeline.',
        inputs: [],
        outputs: [{ name: 'value', type: 'array', description: 'Array of previous meeting summaries' }],
        stateKey: 'meetingHistory',
        stateDefault: '[]',
        stateMode: 'read',
        code: '',
        prompt: '',
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
          'Merges action items and executive summary into a report. Reads accumulated meeting history to compute the session number, then appends this meeting for future runs.',
        inputs: [
          { name: 'actions', type: 'string', description: 'Numbered action items list' },
          { name: 'summary', type: 'string', description: 'Executive summary' },
          { name: 'history', type: 'array', description: 'Previous meeting history (from state)' },
        ],
        outputs: [
          { name: 'summary', type: 'string', description: 'Executive summary' },
          { name: 'actions', type: 'string', description: 'Action items list' },
          { name: 'actionCount', type: 'number', description: 'Number of action items' },
          { name: 'sessionNumber', type: 'number', description: 'Which meeting session this is' },
          { name: 'updatedHistory', type: 'array', description: 'History array with this meeting appended' },
          { name: 'generatedAt', type: 'string', description: 'Timestamp' },
        ],
        code: `const actions = String(inputs.actions ?? '')
const summary = String(inputs.summary ?? '')
const history = Array.isArray(inputs.history) ? inputs.history : []
// Count non-empty lines that start with a digit (numbered list items)
const actionCount = actions.split('\\n').filter(l => /^\\d+\\./.test(l.trim())).length
const sessionNumber = history.length + 1
const updatedHistory = [...history, {
  date: new Date().toISOString(),
  actionCount,
  summary: summary.slice(0, 150),
}]
return {
  summary,
  actions,
  actionCount,
  sessionNumber,
  updatedHistory,
  generatedAt: new Date().toISOString(),
}`,
        prompt: 'Merge action items and summary into a report, tracking session number from accumulated meeting history',
      },
    },
    {
      id: 'state-write-history',
      type: 'state',
      position: { x: 980, y: 80 },
      data: {
        label: 'Save History',
        kind: 'state',
        description: 'Persists the updated meeting history so the next run knows how many meetings have been processed.',
        inputs: [{ name: 'value', type: 'array', description: 'Updated meeting history array' }],
        outputs: [{ name: 'value', type: 'array', description: 'Stored value (pass-through)' }],
        stateKey: 'meetingHistory',
        stateDefault: '[]',
        stateMode: 'write',
        code: '',
        prompt: '',
      },
    },
    {
      id: 'output-report',
      type: 'output',
      position: { x: 1280, y: 260 },
      data: {
        label: 'Meeting Report',
        kind: 'output',
        description:
          'Final structured report with executive summary, action items, session number, and generation timestamp.',
        inputs: [
          { name: 'summary', type: 'string', description: 'Executive summary' },
          { name: 'actions', type: 'string', description: 'Action items' },
          { name: 'actionCount', type: 'number', description: 'Count' },
          { name: 'sessionNumber', type: 'number', description: 'Meeting session number' },
          { name: 'generatedAt', type: 'string', description: 'Timestamp' },
        ],
        outputs: [],
        code: `return {
  session: \`Meeting #\${inputs.sessionNumber}\`,
  summary: inputs.summary,
  actionItems: inputs.actions,
  actionCount: inputs.actionCount,
  generatedAt: inputs.generatedAt,
}`,
        prompt: 'Output the complete meeting report with session number',
      },
    },
    {
      id: 'note-two-llms',
      type: 'note',
      position: { x: 380, y: 580 },
      data: {
        label: 'Two LLMs, one input',
        kind: 'note',
        description: '',
        inputs: [],
        outputs: [],
        code: '',
        prompt: '',
        noteText: 'Both LLM nodes receive the same raw meeting transcript but have different system prompts and objectives. "Extract Action Items" scans for commitments, owners, and deadlines, returning a structured list. "Executive Summary" writes a concise narrative overview. Splitting responsibilities across specialised nodes produces sharper, more focused results than asking a single prompt to do everything. The Format Output node merges both responses into a clean document with clear sections — a pattern that works well for any multi-perspective analysis.',
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
      id: 'e-history-report',
      source: 'state-read-history',
      target: 'fn-report',
      sourceHandle: 'value',
      targetHandle: 'history',
      animated: true,
    },
    {
      id: 'e-report-save-history',
      source: 'fn-report',
      target: 'state-write-history',
      sourceHandle: 'updatedHistory',
      targetHandle: 'value',
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
      id: 'e-report-out-session',
      source: 'fn-report',
      target: 'output-report',
      sourceHandle: 'sessionNumber',
      targetHandle: 'sessionNumber',
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
