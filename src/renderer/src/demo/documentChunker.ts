import type { FlowProject } from '../types'

export const documentChunkerDemo: FlowProject = {
  id: 'demo-document-chunker-v1',
  name: 'Long Document Summariser',
  description:
    'Chunks a long document into paragraphs, summarises each chunk with an LLM, then combines the per-chunk summaries into a final executive summary. Demonstrates the Document Chunker node.',
  version: '1',
  created: '2026-05-01T00:00:00.000Z',
  updated: '2026-05-01T00:00:00.000Z',
  nodes: [
    // ── Note ──────────────────────────────────────────────────────────────────
    {
      id: 'note-intro',
      type: 'note',
      position: { x: 60, y: -160 },
      data: {
        label: 'Long Document Summariser',
        kind: 'note',
        description: '',
        inputs: [],
        outputs: [],
        code: '',
        prompt: '',
        noteText:
          'Demonstrates the Document Chunker node. Paste any long text (articles, reports, transcripts). The Chunker splits it into manageable paragraphs, each chunk is summarised independently by an LLM, then a second LLM pass combines those summaries into a single executive summary.',
      },
    },

    // ── Input ─────────────────────────────────────────────────────────────────
    {
      id: 'node-input',
      type: 'input',
      position: { x: 60, y: 80 },
      data: {
        label: 'Document Input',
        kind: 'input',
        description: 'Paste the long document text here. In a real app this would be a file-upload UI node.',
        inputs: [],
        outputs: [{ name: 'text', type: 'string', description: 'The full document text' }],
        code: `return { text: inputs.text ?? '' }`,
        prompt: 'Input node for a long text document',
      },
    },

    // ── Chunker ───────────────────────────────────────────────────────────────
    {
      id: 'node-chunker',
      type: 'chunker',
      position: { x: 300, y: 80 },
      data: {
        label: 'Document Chunker',
        kind: 'chunker',
        description:
          'Splits the document into paragraph-based chunks of up to 800 characters. Outputs an array of chunk strings ready for parallel LLM processing.',
        inputs: [{ name: 'text', type: 'string', description: 'Full document text' }],
        outputs: [
          { name: 'chunks', type: 'array', description: 'Array of text chunks' },
          { name: 'count', type: 'number', description: 'Number of chunks' },
          { name: 'text', type: 'string', description: 'Original text' },
        ],
        code: '',
        prompt: '',
        chunkerSize: 800,
        chunkerOverlap: 80,
        chunkerStrategy: 'paragraph',
      },
    },

    // ── Chunk Summariser (LLM) ────────────────────────────────────────────────
    {
      id: 'node-chunk-summariser',
      type: 'llm',
      position: { x: 560, y: 80 },
      data: {
        label: 'Chunk Summariser',
        kind: 'llm',
        description:
          'Receives the array of text chunks and maps each one through the LLM, producing a short 1–2 sentence summary per chunk. Uses JavaScript to join the results.',
        inputs: [{ name: 'chunks', type: 'array', description: 'Array of text chunks from the chunker' }],
        outputs: [{ name: 'chunk_summaries', type: 'string', description: 'Combined per-chunk summaries' }],
        code: `// Summarise each chunk and combine results
const chunkList = inputs.chunks ?? []
const summaries = []
for (const chunk of chunkList) {
  const summary = await callLLM(
    'gpt-4o-mini',
    'Summarise this passage in 1-2 sentences:\\n\\n' + chunk
  )
  summaries.push(summary.trim())
}
return { chunk_summaries: summaries.join('\\n\\n') }`,
        prompt: 'LLM node that summarises each chunk in an array',
        llmProvider: 'default',
        llmModel: 'gpt-4o-mini',
        llmPromptTemplate: 'Summarise this passage in 1-2 sentences:\n\n{{text}}',
      },
    },

    // ── Final Summariser (LLM) ────────────────────────────────────────────────
    {
      id: 'node-final-summary',
      type: 'llm',
      position: { x: 820, y: 80 },
      data: {
        label: 'Executive Summary',
        kind: 'llm',
        description:
          'Takes all per-chunk summaries and produces a single coherent executive summary of the full document.',
        inputs: [{ name: 'chunk_summaries', type: 'string', description: 'Combined per-chunk summaries' }],
        outputs: [{ name: 'summary', type: 'string', description: 'Final executive summary' }],
        code: '',
        prompt: 'LLM node that combines chunk summaries into a final executive summary',
        llmProvider: 'default',
        llmModel: 'gpt-4o-mini',
        llmPromptTemplate:
          'You have been given a series of summaries from consecutive sections of a long document.\n\nCombine them into a single, well-structured executive summary of 3–5 sentences that captures the key points:\n\n{{chunk_summaries}}',
      },
    },

    // ── Stats (function) ──────────────────────────────────────────────────────
    {
      id: 'node-stats',
      type: 'function',
      position: { x: 300, y: 300 },
      data: {
        label: 'Document Stats',
        kind: 'function',
        description: 'Calculates word count, character count, and number of chunks produced.',
        inputs: [
          { name: 'text', type: 'string', description: 'Original document text' },
          { name: 'count', type: 'number', description: 'Number of chunks' },
        ],
        outputs: [{ name: 'stats', type: 'object', description: 'Word count, char count, chunk count' }],
        code: `const words = (inputs.text ?? '').trim().split(/\\s+/).filter(Boolean).length
const chars = (inputs.text ?? '').length
return { stats: { words, chars, chunks: inputs.count ?? 0 } }`,
        prompt: 'Function node to compute document statistics',
      },
    },

    // ── Output ────────────────────────────────────────────────────────────────
    {
      id: 'node-output',
      type: 'output',
      position: { x: 1080, y: 80 },
      data: {
        label: 'Report',
        kind: 'output',
        description: 'Combines the executive summary with document statistics into a final report.',
        inputs: [
          { name: 'summary', type: 'string', description: 'Executive summary' },
          { name: 'stats', type: 'object', description: 'Document statistics' },
        ],
        outputs: [{ name: 'report', type: 'object', description: 'Final structured report' }],
        code: `return {
  report: {
    executive_summary: inputs.summary ?? '',
    stats: inputs.stats ?? {},
  }
}`,
        prompt: 'Output node combining summary and stats into a report',
      },
    },
  ],

  edges: [
    // Input → Chunker
    { id: 'e1', source: 'node-input', target: 'node-chunker', sourceHandle: 'text', targetHandle: 'text' },
    // Chunker → Chunk Summariser
    { id: 'e2', source: 'node-chunker', target: 'node-chunk-summariser', sourceHandle: 'chunks', targetHandle: 'chunks' },
    // Chunk Summariser → Final Summary
    { id: 'e3', source: 'node-chunk-summariser', target: 'node-final-summary', sourceHandle: 'chunk_summaries', targetHandle: 'chunk_summaries' },
    // Final Summary → Output
    { id: 'e4', source: 'node-final-summary', target: 'node-output', sourceHandle: 'summary', targetHandle: 'summary' },
    // Chunker → Stats (text + count)
    { id: 'e5', source: 'node-chunker', target: 'node-stats', sourceHandle: 'text', targetHandle: 'text' },
    { id: 'e6', source: 'node-chunker', target: 'node-stats', sourceHandle: 'count', targetHandle: 'count' },
    // Stats → Output
    { id: 'e7', source: 'node-stats', target: 'node-output', sourceHandle: 'stats', targetHandle: 'stats' },
  ],
}
