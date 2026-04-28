import React, { useState, useRef } from 'react'
import { Play, X, MessageSquare, FileText, ListChecks } from 'lucide-react'
import { useFlowStore } from '../../store/flowStore'

export default function UIInputModal() {
  const pendingUiRun = useFlowStore((s) => s.pendingUiRun)
  const uiNodesInfo = useFlowStore((s) => s.uiNodesInfo)
  const submitUiInputs = useFlowStore((s) => s.submitUiInputs)
  const cancelUiRun = useFlowStore((s) => s.cancelUiRun)

  // One value entry per UI node
  const [values, setValues] = useState<Record<string, unknown>>({})
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  if (!pendingUiRun) return null

  const setValue = (nodeId: string, value: unknown) =>
    setValues((prev) => ({ ...prev, [nodeId]: value }))

  const handleFile = (nodeId: string, file: File | undefined) => {
    if (!file) { setValue(nodeId, undefined); return }
    const reader = new FileReader()
    const isText = file.type.startsWith('text/') || /\.(txt|md|csv|json|xml|html|js|ts|py|sh)$/i.test(file.name)
    reader.onload = (e) => {
      setValue(nodeId, {
        filename: file.name,
        type: file.type,
        size: file.size,
        content: e.target?.result ?? '',
      })
    }
    if (isText) reader.readAsText(file)
    else reader.readAsDataURL(file)
  }

  const handleSubmit = () => {
    // Build final collected values — default empty strings for anything not yet filled
    const collected: Record<string, unknown> = {}
    for (const { nodeId, data } of uiNodesInfo) {
      const v = values[nodeId]
      if (v !== undefined) {
        collected[nodeId] = v
      } else if (data.uiKind === 'text') {
        collected[nodeId] = { value: '' }
      } else if (data.uiKind === 'file') {
        collected[nodeId] = { filename: '', content: '', type: '', size: 0 }
      } else {
        collected[nodeId] = { choice: data.uiOptions?.[0] ?? '', index: 0 }
      }
    }
    submitUiInputs(collected)
    setValues({})
  }

  const kindIcon = (kind?: string) => {
    if (kind === 'file') return <FileText size={15} className="text-fuchsia-400" />
    if (kind === 'choice') return <ListChecks size={15} className="text-fuchsia-400" />
    return <MessageSquare size={15} className="text-fuchsia-400" />
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#13131f] border border-[#2a2a3f] rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2a2a3f]">
          <div>
            <h2 className="text-sm font-semibold text-white">Pipeline Inputs Required</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">Fill in the fields below to run the pipeline</p>
          </div>
          <button
            onClick={() => { cancelUiRun(); setValues({}) }}
            className="text-slate-500 hover:text-slate-300 transition-colors p-1"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form fields */}
        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {uiNodesInfo.map(({ nodeId, data }) => (
            <div key={nodeId}>
              <div className="flex items-center gap-2 mb-2">
                {kindIcon(data.uiKind)}
                <span className="text-xs font-medium text-fuchsia-300">
                  {data.uiLabel || data.label || 'Input'}
                </span>
              </div>

              {/* Text input */}
              {(!data.uiKind || data.uiKind === 'text') && (
                <textarea
                  className="w-full bg-[#0f0f1a] text-slate-200 text-sm rounded-xl px-3 py-2.5 border border-[#2a2a3f] focus:border-fuchsia-500 outline-none resize-none leading-relaxed"
                  rows={4}
                  placeholder={data.uiPlaceholder || 'Type here…'}
                  value={(values[nodeId] as { value: string } | undefined)?.value ?? ''}
                  onChange={(e) => setValue(nodeId, { value: e.target.value })}
                />
              )}

              {/* File input */}
              {data.uiKind === 'file' && (
                <div>
                  <input
                    ref={(el) => { fileRefs.current[nodeId] = el }}
                    type="file"
                    accept={data.uiAccept || undefined}
                    className="hidden"
                    onChange={(e) => handleFile(nodeId, e.target.files?.[0])}
                  />
                  <button
                    onClick={() => fileRefs.current[nodeId]?.click()}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#2a2a3f] hover:border-fuchsia-500 text-slate-300 text-sm transition-colors"
                  >
                    <FileText size={14} />
                    {(values[nodeId] as { filename?: string } | undefined)?.filename
                      ? (values[nodeId] as { filename: string }).filename
                      : 'Choose file…'}
                  </button>
                  {(values[nodeId] as { filename?: string } | undefined)?.filename && (
                    <p className="text-[11px] text-slate-500 mt-1.5 ml-1">
                      {(values[nodeId] as { size: number }).size.toLocaleString()} bytes
                    </p>
                  )}
                </div>
              )}

              {/* Multiple choice */}
              {data.uiKind === 'choice' && (
                <div className="flex flex-wrap gap-2">
                  {(data.uiOptions ?? ['Option A', 'Option B', 'Option C']).map((opt, i) => {
                    const selected = (values[nodeId] as { choice?: string } | undefined)?.choice === opt
                    return (
                      <button
                        key={i}
                        onClick={() => setValue(nodeId, { choice: opt, index: i })}
                        className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                          selected
                            ? 'border-fuchsia-500 bg-fuchsia-900/50 text-fuchsia-200'
                            : 'border-[#2a2a3f] text-slate-400 hover:border-fuchsia-700'
                        }`}
                      >
                        {opt}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[#2a2a3f] flex gap-3 justify-end">
          <button
            onClick={() => { cancelUiRun(); setValues({}) }}
            className="px-4 py-2 text-sm rounded-xl border border-[#2a2a3f] text-slate-400 hover:text-slate-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="flex items-center gap-2 px-5 py-2 text-sm rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white transition-colors"
          >
            <Play size={13} />
            Run Pipeline
          </button>
        </div>
      </div>
    </div>
  )
}
