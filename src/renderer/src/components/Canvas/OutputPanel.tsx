import React from 'react'
import { X } from 'lucide-react'
import { useFlowStore } from '../../store/flowStore'

interface OutputPanelProps {
  onClose: () => void
}

export function OutputPanel({ onClose }: OutputPanelProps) {
  const { runOutput, clearOutput, isRunning } = useFlowStore()

  return (
    <div className="h-48 bg-[#080810] border-t border-[#2a2a3f] flex flex-col font-mono">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#2a2a3f]">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-green-400 animate-pulse' : 'bg-slate-600'}`} />
          <span className="text-[11px] uppercase tracking-widest text-slate-500">Pipeline Output</span>
        </div>
        <div className="flex items-center gap-3">
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
      <div className="flex-1 overflow-y-auto p-3">
        {runOutput ? (
          <pre className="text-xs text-green-300 whitespace-pre-wrap leading-relaxed">{runOutput}</pre>
        ) : (
          <span className="text-xs text-slate-600">Press Run to execute the pipeline…</span>
        )}
      </div>
    </div>
  )
}
