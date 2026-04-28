import React from 'react'
import Editor from '@monaco-editor/react'
import { X } from 'lucide-react'
import { useFlowStore } from '../../store/flowStore'

interface CodeViewerProps {
  onClose: () => void
}

export function CodeViewer({ onClose }: CodeViewerProps) {
  const { getGeneratedCode } = useFlowStore()
  const code = getGeneratedCode()

  return (
    <div className="h-60 bg-[#0d0d1a] border-t border-[#2a2a3f] flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#2a2a3f]">
        <span className="text-[11px] uppercase tracking-widest text-slate-500">
          Generated JavaScript
        </span>
        <button onClick={onClose} className="text-slate-500 hover:text-white">
          <X size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        <Editor
          height="100%"
          defaultLanguage="javascript"
          value={code}
          theme="vs-dark"
          options={{
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 11,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            padding: { top: 8, bottom: 8 },
          }}
        />
      </div>
    </div>
  )
}
