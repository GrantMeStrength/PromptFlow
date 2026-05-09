import React, { useState } from 'react'
import { X, Copy, Check } from 'lucide-react'
import { useFlowStore } from '../../store/flowStore'

interface CodeViewerProps {
  onClose: () => void
}

export function CodeViewer({ onClose }: CodeViewerProps) {
  const { getGeneratedCode } = useFlowStore()
  let code = ''
  try { code = getGeneratedCode() } catch (e) { code = `// Error generating code: ${e}` }
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="h-64 bg-[#080810] border-t border-[#2a2a3f] flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#2a2a3f] shrink-0">
        <span className="text-[11px] uppercase tracking-widest text-slate-500">
          Generated JavaScript
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition-colors"
            title="Copy to clipboard"
          >
            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button onClick={onClose} className="text-slate-500 hover:text-white ml-2">
            <X size={14} />
          </button>
        </div>
      </div>
      <pre className="flex-1 overflow-auto p-3 text-[11px] font-mono text-slate-300 leading-relaxed whitespace-pre">
        {code}
      </pre>
    </div>
  )
}
