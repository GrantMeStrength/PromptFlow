import React, { useState } from 'react'
import { X, FileDown, FileText } from 'lucide-react'
import { useFlowStore } from '../../store/flowStore'

interface OutputPanelProps {
  onClose: () => void
}

export function OutputPanel({ onClose }: OutputPanelProps) {
  const { runOutput, runOutputIsHtml, clearOutput, isRunning } = useFlowStore()
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
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-green-400 animate-pulse' : 'bg-slate-600'}`} />
          <span className="text-[11px] uppercase tracking-widest text-slate-500">Pipeline Output</span>
        </div>
        <div className="flex items-center gap-3">
          {runOutputIsHtml && (
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
        {!runOutput ? (
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
        )}
      </div>
    </div>
  )
}
