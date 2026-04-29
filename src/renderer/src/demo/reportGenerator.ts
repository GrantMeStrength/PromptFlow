import type { FlowProject } from '../types'

/**
 * Demo: Research Report Generator
 * User enters a topic. The LLM generates structured report content as JSON.
 * A function node renders it as a polished HTML document.
 * The output panel shows HTML and offers Save HTML / Export PDF buttons.
 *
 * Flow:
 *   [UI: Topic] ──► [LLM: Generate Content] ──► [Fn: Render HTML] ──► [Output: Report]
 */
export const reportGeneratorDemo: FlowProject = {
  id: 'demo-report-generator-v1',
  name: 'Research Report Generator',
  description:
    'Enter a research topic. The LLM generates a structured report (sections, statistics table, key findings) and a function node renders it as a styled HTML document you can save or export as PDF.',
  version: '1',
  created: '2026-04-29T00:00:00.000Z',
  updated: '2026-04-29T00:00:00.000Z',
  nodes: [
    {
      id: 'ui-topic',
      type: 'ui',
      position: { x: 60, y: 200 },
      data: {
        label: 'Report Topic',
        kind: 'ui',
        uiKind: 'text',
        uiLabel: 'Research topic:',
        uiPlaceholder: 'The impact of AI on modern software development',
        description: 'The subject to research and report on.',
        inputs: [],
        outputs: [{ name: 'value', type: 'string', description: 'Report topic text' }],
        code: '',
        prompt: '',
      },
    },
    {
      id: 'llm-content',
      type: 'llm',
      position: { x: 340, y: 200 },
      data: {
        label: 'Generate Report Content',
        kind: 'llm',
        description:
          'LLM writes a structured report as JSON: title, executive summary, 3 sections, statistics table, key findings, and conclusion.',
        inputs: [{ name: 'topic', type: 'string', description: 'Research topic' }],
        outputs: [{ name: 'content', type: 'string', description: 'Structured report JSON' }],
        llmModel: 'gpt-4o-mini',
        llmPromptTemplate: `You are a professional research analyst. Write a detailed report on: {{topic}}

Return ONLY a JSON object (no markdown code fences) with this exact structure:
{
  "title": "Report title",
  "executive_summary": "2-3 sentence summary",
  "sections": [
    { "heading": "Section heading", "body": "2-3 paragraph body" },
    { "heading": "Section heading", "body": "2-3 paragraph body" },
    { "heading": "Section heading", "body": "2-3 paragraph body" }
  ],
  "statistics": [
    { "metric": "Metric name", "value": "Value", "source": "Source" },
    { "metric": "Metric name", "value": "Value", "source": "Source" },
    { "metric": "Metric name", "value": "Value", "source": "Source" },
    { "metric": "Metric name", "value": "Value", "source": "Source" }
  ],
  "key_findings": ["Finding 1", "Finding 2", "Finding 3", "Finding 4"],
  "conclusion": "Concluding paragraph"
}`,
        code: `const topic = String(inputs.topic ?? '')
const prompt = llmPromptTemplate.replace('{{topic}}', topic)
const content = await callLLM(llmModel || 'gpt-4o-mini', prompt)
return { content }`,
        prompt: 'Generate a structured research report as JSON with sections, stats table, and key findings',
      },
    },
    {
      id: 'fn-render',
      type: 'function',
      position: { x: 640, y: 200 },
      data: {
        label: 'Render Report HTML',
        kind: 'function',
        description:
          'Parses the structured JSON and renders a polished HTML report with styled sections, a statistics table, and key findings. Returns { __html } for direct rendering.',
        inputs: [{ name: 'content', type: 'string', description: 'Structured report JSON' }],
        outputs: [{ name: '__html', type: 'string', description: 'Rendered HTML report' }],
        code: `const raw = String(inputs.content ?? '')
let data
try {
  const cleaned = raw.replace(/^\`\`\`json?\\n?/i,'').replace(/\`\`\`$/,'').trim()
  data = JSON.parse(cleaned)
} catch(e) {
  return { __html: \`<p style="color:#f87171;font-family:sans-serif">Failed to parse report JSON:<br><pre>\${raw}</pre></p>\` }
}
const { title, executive_summary, sections = [], statistics = [], key_findings = [], conclusion } = data

const sectionsHtml = sections.map(s =>
  \`<h2 style="font-family:sans-serif;color:#2a4a7f;font-size:1.3em;margin-top:1.8em">\${s.heading}</h2><p>\${s.body.replace(/\\n/g,'</p><p>')}</p>\`
).join('')

const statsRows = statistics.map(s =>
  \`<tr><td style="padding:7px 12px;border-bottom:1px solid #ddd">\${s.metric}</td><td style="padding:7px 12px;border-bottom:1px solid #ddd"><strong>\${s.value}</strong></td><td style="padding:7px 12px;border-bottom:1px solid #ddd;color:#555">\${s.source}</td></tr>\`
).join('')

const findingsHtml = key_findings.map(f => \`<li style="margin-bottom:6px">\${f}</li>\`).join('')

const html = \`<div style="max-width:760px;margin:0 auto;font-family:Georgia,serif;color:#1a1a1a;line-height:1.7;padding:1em">
<h1 style="font-family:sans-serif;font-size:2em;border-bottom:3px solid #2a4a7f;padding-bottom:0.4em;color:#2a4a7f">\${title}</h1>
<div style="background:#f0f4ff;border-left:4px solid #5b8ff9;padding:1em 1.4em;margin:1.5em 0;border-radius:0 6px 6px 0">
  <strong style="font-family:sans-serif;font-size:0.8em;letter-spacing:0.08em;color:#2a4a7f">EXECUTIVE SUMMARY</strong>
  <p style="margin:0.5em 0 0">\${executive_summary}</p>
</div>
\${sectionsHtml}
<h2 style="font-family:sans-serif;color:#2a4a7f;font-size:1.3em;margin-top:1.8em">Key Statistics</h2>
<table style="border-collapse:collapse;width:100%;margin:1em 0">
  <thead><tr style="background:#2a4a7f;color:white">
    <th style="padding:8px 12px;text-align:left">Metric</th>
    <th style="padding:8px 12px;text-align:left">Value</th>
    <th style="padding:8px 12px;text-align:left">Source</th>
  </tr></thead>
  <tbody>\${statsRows}</tbody>
</table>
<h2 style="font-family:sans-serif;color:#2a4a7f;font-size:1.3em;margin-top:1.8em">Key Findings</h2>
<ul style="padding-left:1.5em">\${findingsHtml}</ul>
<h2 style="font-family:sans-serif;color:#2a4a7f;font-size:1.3em;margin-top:1.8em">Conclusion</h2>
<p>\${conclusion}</p>
<p style="margin-top:2.5em;font-size:0.8em;color:#888;border-top:1px solid #ddd;padding-top:1em">Generated by PromptFlow · \${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</p>
</div>\`

return { __html: html }`,
        prompt: 'Parse structured JSON report and render as polished HTML document',
      },
    },
    {
      id: 'output-report',
      type: 'output',
      position: { x: 940, y: 200 },
      data: {
        label: 'Report Output',
        kind: 'output',
        description:
          'Renders the HTML report. Use the HTML or PDF buttons in the output panel to save a shareable document.',
        inputs: [{ name: '__html', type: 'string', description: 'Rendered HTML report' }],
        outputs: [],
        code: `return { __html: inputs.__html }`,
        prompt: 'Display the rendered HTML report with export options',
      },
    },
    {
      id: 'note-export',
      type: 'note',
      position: { x: 640, y: 380 },
      data: {
        label: 'Export tip',
        kind: 'note',
        description: '',
        inputs: [],
        outputs: [],
        code: '',
        prompt: '',
        noteText: '📄 After running, use the HTML or PDF buttons in the output panel to save a shareable report.',
      },
    },
  ],
  edges: [
    {
      id: 'e-topic-llm',
      source: 'ui-topic',
      target: 'llm-content',
      sourceHandle: 'value',
      targetHandle: 'topic',
      animated: true,
      type: 'gradient',
    },
    {
      id: 'e-llm-fn',
      source: 'llm-content',
      target: 'fn-render',
      sourceHandle: 'content',
      targetHandle: 'content',
      animated: true,
      type: 'gradient',
    },
    {
      id: 'e-fn-out',
      source: 'fn-render',
      target: 'output-report',
      sourceHandle: '__html',
      targetHandle: '__html',
      animated: true,
      type: 'gradient',
    },
  ],
}
