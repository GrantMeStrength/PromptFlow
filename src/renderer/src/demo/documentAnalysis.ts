import type { FlowProject } from '../types'

export const demoProject: FlowProject = {
  id: 'demo-document-analysis-v1',
  name: 'Document Analysis Pipeline',
  description:
    'Analyses a text document: extracts keywords, generates an AI summary, counts words, and outputs a structured report.',
  version: '1',
  created: '2026-04-28T00:00:00.000Z',
  updated: '2026-04-28T00:00:00.000Z',
  nodes: [
    {
      id: 'note-intro',
      type: 'note',
      position: { x: 60, y: -140 },
      data: {
        label: 'Document Analyser',
        kind: 'note',
        description: '',
        inputs: [],
        outputs: [],
        code: '',
        prompt: '',
        noteText: 'Paste any block of text and receive three analyses at once: keyword extraction, word/sentence/paragraph statistics, and an LLM-generated summary. The three processing nodes run in parallel (fan-out pattern), then converge into a single structured report.',
      },
    },
    {
      id: 'node-input',
      type: 'input',
      position: { x: 60, y: 200 },
      data: {
        label: 'Document Input',
        kind: 'input',
        description:
          'Accepts raw text from the user. In a full app this would be a textarea or file-upload UI component. Passes the text downstream as `text`.',
        inputs: [],
        outputs: [{ name: 'text', type: 'string', description: 'The raw document text' }],
        code: `// Input node – surfaces the pipeline's initial input
return { text: inputs.text ?? '' }`,
        prompt: 'Create an input node that accepts a text document',
      },
    },
    {
      id: 'node-keywords',
      type: 'function',
      position: { x: 300, y: 80 },
      data: {
        label: 'Extract Keywords',
        kind: 'function',
        description:
          'Pure function that extracts the most significant words from the document. Strips stopwords, sorts by frequency, returns the top 10 as an array.',
        inputs: [{ name: 'text', type: 'string', description: 'Raw document text' }],
        outputs: [
          { name: 'keywords', type: 'array', description: 'Top keywords' },
          { name: 'text', type: 'string', description: 'Pass-through of original text' },
        ],
        code: `const stopwords = new Set([
  'the','a','an','and','or','but','in','on','at','to','for',
  'of','is','it','this','that','with','as','was','be','are'
])
const words = inputs.text.toLowerCase().match(/\\b[a-z]{3,}\\b/g) || []
const freq = {}
for (const w of words) {
  if (!stopwords.has(w)) freq[w] = (freq[w] || 0) + 1
}
const keywords = Object.entries(freq)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .map(([word]) => word)
return { keywords, text: inputs.text }`,
        prompt: 'Create a function node that extracts the top 10 keywords from text, ignoring stopwords',
      },
    },
    {
      id: 'node-wordcount',
      type: 'function',
      position: { x: 300, y: 320 },
      data: {
        label: 'Word Count',
        kind: 'function',
        description:
          'Counts total words, unique words, sentences, and average word length. Returns a stats object. Pure computation – no side effects.',
        inputs: [{ name: 'text', type: 'string', description: 'Raw document text' }],
        outputs: [{ name: 'stats', type: 'object', description: 'Document statistics' }],
        code: `const words = inputs.text.match(/\\b\\w+\\b/g) || []
const sentences = inputs.text.split(/[.!?]+/).filter(s => s.trim().length > 0)
const uniqueWords = new Set(words.map(w => w.toLowerCase()))
const avgLen = words.length > 0
  ? (words.reduce((s, w) => s + w.length, 0) / words.length).toFixed(1)
  : 0
return {
  stats: {
    wordCount: words.length,
    uniqueWords: uniqueWords.size,
    sentences: sentences.length,
    avgWordLength: Number(avgLen),
  }
}`,
        prompt: 'Create a function node that computes word count, unique words, sentence count, and average word length',
      },
    },
    {
      id: 'node-summarize',
      type: 'llm',
      position: { x: 560, y: 80 },
      data: {
        label: 'Summarize',
        kind: 'llm',
        description:
          'Calls a language model to produce a concise 2-3 sentence summary of the document. Uses the extracted keywords as additional context for the prompt.',
        inputs: [
          { name: 'text', type: 'string', description: 'Original document text' },
          { name: 'keywords', type: 'array', description: 'Key terms for context' },
        ],
        outputs: [{ name: 'summary', type: 'string', description: 'AI-generated summary' }],
        llmModel: 'gpt-4o',
        llmPromptTemplate:
          'Summarize the following document in 2-3 sentences. Key topics: {{keywords}}.\n\nDocument:\n{{text}}',
        code: `// LLM Node – calls language model via callLLM (injected by runtime)
const kw = Array.isArray(inputs.keywords) ? inputs.keywords.join(', ') : String(inputs.keywords ?? '')
const text = String(inputs.text ?? '')
const prompt = llmPromptTemplate
  .replace('{{keywords}}', kw)
  .replace('{{text}}', text)
const summary = await callLLM(llmModel || 'gpt-4o-mini', prompt)
return { summary }`,
        prompt: 'Create an LLM node that summarises a document given its text and extracted keywords',
      },
    },
    {
      id: 'node-output',
      type: 'output',
      position: { x: 800, y: 200 },
      data: {
        label: 'Analysis Report',
        kind: 'output',
        description:
          'Collects results from all upstream nodes and assembles the final structured report object. This would be rendered as a formatted card in the actual application.',
        inputs: [
          { name: 'summary', type: 'string', description: 'AI-generated summary' },
          { name: 'keywords', type: 'array', description: 'Extracted keywords' },
          { name: 'stats', type: 'object', description: 'Document statistics' },
        ],
        outputs: [],
        code: `return {
  summary: inputs.summary,
  keywords: inputs.keywords,
  stats: inputs.stats,
  generatedAt: new Date().toISOString(),
}`,
        prompt: 'Create an output node that assembles a final analysis report from summary, keywords and stats',
      },
    },
    {
      id: 'note-parallel',
      type: 'note',
      position: { x: 300, y: 480 },
      data: {
        label: 'Parallel processing',
        kind: 'note',
        description: '',
        inputs: [],
        outputs: [],
        code: '',
        prompt: '',
        noteText: 'This graph demonstrates fan-out parallel processing. The document text is sent simultaneously to three nodes: Extract Keywords (regex-based function, no API call), Word Count (function counting words, sentences, and paragraphs), and Summarize (LLM). The two function nodes return instantly while the LLM runs concurrently. All three results converge at the Analysis Report output node, which combines them into a structured report. This pattern makes full use of available concurrency — useful any time you have independent analyses on the same input.',
      },
    },
  ],
  edges: [
    {
      id: 'e-input-keywords',
      source: 'node-input',
      target: 'node-keywords',
      sourceHandle: 'text',
      targetHandle: 'text',
      animated: true,
    },
    {
      id: 'e-input-wordcount',
      source: 'node-input',
      target: 'node-wordcount',
      sourceHandle: 'text',
      targetHandle: 'text',
      animated: true,
    },
    {
      id: 'e-keywords-summarize-text',
      source: 'node-keywords',
      target: 'node-summarize',
      sourceHandle: 'text',
      targetHandle: 'text',
      animated: true,
    },
    {
      id: 'e-keywords-summarize-kw',
      source: 'node-keywords',
      target: 'node-summarize',
      sourceHandle: 'keywords',
      targetHandle: 'keywords',
      animated: true,
    },
    {
      id: 'e-summarize-output',
      source: 'node-summarize',
      target: 'node-output',
      sourceHandle: 'summary',
      targetHandle: 'summary',
      animated: true,
    },
    {
      id: 'e-keywords-output',
      source: 'node-keywords',
      target: 'node-output',
      sourceHandle: 'keywords',
      targetHandle: 'keywords',
      animated: true,
    },
    {
      id: 'e-wordcount-output',
      source: 'node-wordcount',
      target: 'node-output',
      sourceHandle: 'stats',
      targetHandle: 'stats',
      animated: true,
    },
  ],
}
