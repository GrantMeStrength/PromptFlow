import React, { useState } from 'react'
import { X, FileDown, FileText, Bug } from 'lucide-react'
import { useFlowStore } from '../../store/flowStore'

interface OutputPanelProps {
  onClose: () => void
}

const KIND_COLORS: Record<string, string> = {
  input:       'bg-blue-900/60 text-blue-300 border-blue-700',
  output:      'bg-emerald-900/60 text-emerald-300 border-emerald-700',
  llm:         'bg-purple-900/60 text-purple-300 border-purple-700',
  function:    'bg-amber-900/60 text-amber-300 border-amber-700',
  chunker:     'bg-teal-900/60 text-teal-300 border-teal-700',
  pipe:        'bg-slate-800/80 text-slate-300 border-slate-600',
  ui:          'bg-fuchsia-900/60 text-fuchsia-300 border-fuchsia-700',
  condition:   'bg-orange-900/60 text-orange-300 border-orange-700',
  systemprompt:'bg-indigo-900/60 text-indigo-300 border-indigo-700',
}

function summariseValue(v: unknown, maxLen = 300): string {
  if (v === undefined) return '(undefined)'
  if (v === null) return '(null)'
  if (typeof v === 'string') {
    const s = v.length > maxLen ? v.slice(0, maxLen) + '…' : v
    return JSON.stringify(s)
  }
  if (Array.isArray(v)) {
    const preview = v.slice(0, 3).map(item => summariseValue(item, 80))
    const more = v.length > 3 ? `, … +${v.length - 3} more` : ''
    return `[${preview.join(', ')}${more}]`
  }
  if (typeof v === 'object') {
    // Truncate large string fields (e.g. file content)
    const trimmed: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === 'string' && val.length > 120) {
        trimmed[k] = val.slice(0, 120) + `… (${val.length} chars)`
      } else {
        trimmed[k] = val
      }
    }
    const s = JSON.stringify(trimmed, null, 2)
    return s.length > maxLen ? s.slice(0, maxLen) + '\n…' : s
  }
  return String(v)
}

export function OutputPanel({ onClose }: OutputPanelProps) {
  const { runOutput, runOutputIsHtml, runTrace, clearOutput, isRunning } = useFlowStore()
  const [tab, setTab] = useState<'output' | 'trace'>('output')
  const [exporting, setExporting] = useState<'html' | 'pdf' | null>(null)

  const handleSaveHtml = async () => {
    if (!runOutput) return
    setExporting('html')
    try {
      await window.electronAPI?.saveReportHtml(runOutput)
    } finally {
      setExporting(null)
    }
  }

  const handleExportPdf = async () => {
    if (!runOutput) return
    setExporting('pdf')
    try {
      await window.electronAPI?.exportReportPdf(runOutput)
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="h-64 bg-[#080810] border-t border-[#2a2a3f] flex flex-col font-mono">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#2a2a3f] shrink-0">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-green-400 animate-pulse' : 'bg-slate-600'}`} />
          {/* Tabs */}
          <button
            onClick={() => setTab('output')}
            className={`text-[11px] uppercase tracking-widest transition-colors ${tab === 'output' ? 'text-slate-200' : 'text-slate-500 hover:text-slate-400'}`}
          >
            Output
          </button>
          <button
            onClick={() => setTab('trace')}
            className={`flex items-center gap-1 text-[11px] uppercase tracking-widest transition-colors ${tab === 'trace' ? 'text-slate-200' : 'text-slate-500 hover:text-slate-400'}`}
          >
            <Bug size={11} />
            Trace
            {runTrace && (
              <span className="ml-1 px-1 rounded bg-slate-700 text-slate-400">{runTrace.length}</span>
            )}
          </button>
        </div>
        <div className="flex items-center gap-3">
          {runOutputIsHtml && tab === 'output' && (
            <>
              <button
                onClick={handleSaveHtml}
                disabled={exporting !== null}
                title="Save as HTML"
                className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-blue-400 transition-colors disabled:opacity-40"
              >
                <FileText size={13} />
                <span>HTML</span>
              </button>
              <button
                onClick={handleExportPdf}
                disabled={exporting !== null}
                title="Export as PDF"
                className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-blue-400 transition-colors disabled:opacity-40"
              >
                <FileDown size={13} />
                <span>{exporting === 'pdf' ? 'Exporting…' : 'PDF'}</span>
              </button>
            </>
          )}
          <button
            onClick={clearOutput}
            className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
          >
            Clear
          </button>
          <button onClick={onClose} className="text-slate-500 hover:text-white">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {tab === 'output' ? (
          !runOutput ? (
            <div className="p-3">
              <span className="text-xs text-slate-600">Press Run to execute the pipeline…</span>
            </div>
          ) : runOutputIsHtml ? (
            <div
              className="p-3 text-sm"
              dangerouslySetInnerHTML={{ __html: runOutput }}
            />
          ) : (
            <div className="p-3">
              <pre className="text-xs text-green-300 whitespace-pre-wrap leading-relaxed">
                {runOutput.length > 50000
                  ? runOutput.slice(0, 50000) + '\n\n[… output truncated — use HTML export for full results]'
                  : runOutput}
              </pre>
            </div>
          )
        ) : (
          /* Trace tab */
          !runTrace ? (
            <div className="p-3">
              <span className="text-xs text-slate-600">Run the pipeline to see per-node execution trace.</span>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {runTrace.map((entry) => {
                const colorCls = KIND_COLORS[entry.kind] ?? 'bg-slate-800/80 text-slate-300 border-slate-600'
                const isEmpty = entry.output === undefined || entry.output === null ||
                  (typeof entry.output === 'object' && !Array.isArray(entry.output) &&
                    Object.values(entry.output as object).every(v => v === '' || v === 0 || (Array.isArray(v) && v.length === 0)))
                return (
                  <div key={entry.id} className={`rounded border px-2 py-1 ${colorCls} ${isEmpty ? 'opacity-50' : ''}`}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide">{entry.label}</span>
                      <span className="text-[9px] opacity-60">{entry.kind}</span>
                      {isEmpty && <span className="text-[9px] text-yellow-400">⚠ empty</span>}
                    </div>
                    <pre className="text-[10px] opacity-80 whitespace-pre-wrap break-all leading-relaxed">
                      {summariseValue(entry.output)}
                    </pre>
                  </div>
                )
              })}
            </div>
          )
        )}
      </div>
    </div>
  )
}
