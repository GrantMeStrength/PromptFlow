import type { FlowProject } from '../types'

/**
 * Demo: Tone-Aware Email Composer
 * Shows UI interaction nodes feeding into an LLM, followed by a function
 * node that enriches the output before the final report.
 *
 * Flow:
 *   [Choice: Tone] ──┐
 *                    ├──► [LLM: Draft Email] ──► [Fn: Add Metadata] ──► [Output]
 *   [Text: Topic] ───┘
 */
export const emailComposerProject: FlowProject = {
  id: 'demo-email-composer-v1',
  name: 'Tone-Aware Email Composer',
  description:
    'User picks a tone and describes what the email is about. The LLM drafts the email, then a function node enriches it with word count and metadata.',
  version: '1',
  created: '2026-04-28T00:00:00.000Z',
  updated: '2026-04-28T00:00:00.000Z',
  nodes: [
    {
      id: 'ui-tone',
      type: 'ui',
      position: { x: 80, y: 120 },
      data: {
        label: 'Email Tone',
        kind: 'ui',
        uiKind: 'choice',
        uiLabel: 'What tone should the email have?',
        uiOptions: ['Professional', 'Friendly', 'Urgent', 'Apologetic'],
        description: 'Asks the user to pick a writing tone before composing the email.',
        inputs: [],
        outputs: [{ name: 'choice', type: 'string', description: 'Selected tone' }],
        code: '',
        prompt: '',
      },
    },
    {
      id: 'ui-topic',
      type: 'ui',
      position: { x: 80, y: 320 },
      data: {
        label: 'Email Topic',
        kind: 'ui',
        uiKind: 'text',
        uiLabel: 'What should the email be about?',
        uiPlaceholder: 'e.g. Following up on the Q3 budget proposal…',
        description: 'Collects a free-text description of the email subject from the user.',
        inputs: [],
        outputs: [{ name: 'value', type: 'string', description: 'Topic description' }],
        code: '',
        prompt: '',
      },
    },
    {
      id: 'llm-draft',
      type: 'llm',
      position: { x: 400, y: 200 },
      data: {
        label: 'Draft Email',
        kind: 'llm',
        description:
          'Calls the LLM to compose a concise email using the selected tone and topic supplied by the two upstream UI nodes.',
        inputs: [
          { name: 'tone', type: 'string', description: 'Chosen writing tone' },
          { name: 'topic', type: 'string', description: 'What the email is about' },
        ],
        outputs: [{ name: 'email', type: 'string', description: 'Drafted email body' }],
        llmModel: 'gpt-4o',
        llmPromptTemplate:
          'Write a {{tone}} email about the following topic. Keep it under 150 words. Only output the email body — no subject line, no explanations.\n\nTopic: {{topic}}',
        code: `const tone = String(inputs.tone ?? 'professional')
const topic = String(inputs.topic ?? '')
const prompt = llmPromptTemplate
  .replace('{{tone}}', tone)
  .replace('{{topic}}', topic)
const email = await callLLM(llmModel || 'gpt-4o-mini', prompt)
return { email }`,
        prompt: 'Write a tone-aware email draft using tone and topic inputs',
      },
    },
    {
      id: 'fn-meta',
      type: 'function',
      position: { x: 700, y: 200 },
      data: {
        label: 'Add Metadata',
        kind: 'function',
        description:
          'Pure function that attaches word count, approximate reading time, and a timestamp to the drafted email.',
        inputs: [{ name: 'email', type: 'string', description: 'Drafted email body' }],
        outputs: [
          { name: 'email', type: 'string', description: 'Email body (pass-through)' },
          { name: 'wordCount', type: 'number', description: 'Word count' },
          { name: 'readingTimeSec', type: 'number', description: 'Approx reading time in seconds' },
          { name: 'generatedAt', type: 'string', description: 'ISO timestamp' },
        ],
        code: `const email = String(inputs.email ?? '')
const words = email.match(/\\b\\w+\\b/g) || []
return {
  email,
  wordCount: words.length,
  readingTimeSec: Math.round(words.length / 3),
  generatedAt: new Date().toISOString(),
}`,
        prompt: 'Add word count, reading time, and timestamp metadata to the email',
      },
    },
    {
      id: 'output-email',
      type: 'output',
      position: { x: 980, y: 200 },
      data: {
        label: 'Composed Email',
        kind: 'output',
        description:
          'Final output node — returns the email text along with its metadata.',
        inputs: [
          { name: 'email', type: 'string', description: 'Email body' },
          { name: 'wordCount', type: 'number', description: 'Word count' },
          { name: 'readingTimeSec', type: 'number', description: 'Reading time' },
          { name: 'generatedAt', type: 'string', description: 'Timestamp' },
        ],
        outputs: [],
        code: `return {
  email: inputs.email,
  wordCount: inputs.wordCount,
  readingTimeSec: inputs.readingTimeSec,
  generatedAt: inputs.generatedAt,
}`,
        prompt: 'Output the finished email with its metadata',
      },
    },
    {
      id: 'note-metadata',
      type: 'note',
      position: { x: 700, y: 380 },
      data: {
        label: 'What the Metadata node adds',
        kind: 'note',
        description: '',
        inputs: [],
        outputs: [],
        code: '',
        prompt: '',
        noteText: 'The "Add Metadata" function node does not change the email text — it wraps it with computed properties: word count, estimated reading time (at 200 words per minute), and a UTC timestamp. This post-processing pattern is useful whenever you want to attach analytics or provenance data to an LLM result before passing it to an output or storage node. The final Output node receives an object with both the email body and its metadata, then unwraps the email text for clean display.',
      },
    },
  ],
  edges: [
    {
      id: 'e-tone-draft',
      source: 'ui-tone',
      target: 'llm-draft',
      sourceHandle: 'choice',
      targetHandle: 'tone',
      animated: true,
    },
    {
      id: 'e-topic-draft',
      source: 'ui-topic',
      target: 'llm-draft',
      sourceHandle: 'value',
      targetHandle: 'topic',
      animated: true,
    },
    {
      id: 'e-draft-meta',
      source: 'llm-draft',
      target: 'fn-meta',
      sourceHandle: 'email',
      targetHandle: 'email',
      animated: true,
    },
    {
      id: 'e-meta-out-email',
      source: 'fn-meta',
      target: 'output-email',
      sourceHandle: 'email',
      targetHandle: 'email',
      animated: true,
    },
    {
      id: 'e-meta-out-wc',
      source: 'fn-meta',
      target: 'output-email',
      sourceHandle: 'wordCount',
      targetHandle: 'wordCount',
      animated: true,
    },
    {
      id: 'e-meta-out-rt',
      source: 'fn-meta',
      target: 'output-email',
      sourceHandle: 'readingTimeSec',
      targetHandle: 'readingTimeSec',
      animated: true,
    },
    {
      id: 'e-meta-out-ts',
      source: 'fn-meta',
      target: 'output-email',
      sourceHandle: 'generatedAt',
      targetHandle: 'generatedAt',
      animated: true,
    },
  ],
}
