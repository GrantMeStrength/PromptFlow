import React, { useState, useRef } from 'react'
import { Play, X, MessageSquare, FileText, ListChecks, Files } from 'lucide-react'
import { useFlowStore } from '../../store/flowStore'

type FileEntry = { filename: string; content: string; type: string; size: number }

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

  /** Read a single File into a FileEntry object */
  const readFileToEntry = (file: File): Promise<FileEntry> =>
    new Promise((resolve) => {
      const reader = new FileReader()
      const isText =
        file.type.startsWith('text/') ||
        /\.(txt|md|csv|json|xml|html|js|ts|py|sh)$/i.test(file.name)
      reader.onload = (e) =>
        resolve({ filename: file.name, type: file.type, size: file.size, content: String(e.target?.result ?? '') })
      if (isText) reader.readAsText(file)
      else reader.readAsDataURL(file)
    })

  const handleFiles = async (nodeId: string, fileList: FileList | null, multiple: boolean) => {
    if (!fileList || fileList.length === 0) { setValue(nodeId, undefined); return }
    const entries = await Promise.all(Array.from(fileList).map(readFileToEntry))
    // Single-file nodes: keep flat { filename, content, type, size } for backward compat
    if (!multiple) {
      setValue(nodeId, entries[0])
    } else {
      setValue(nodeId, { files: entries })
    }
  }

  const handleSubmit = () => {
    const collected: Record<string, unknown> = {}
    for (const { nodeId, data } of uiNodesInfo) {
      const v = values[nodeId]
      if (v !== undefined) {
        collected[nodeId] = v
      } else if (data.uiKind === 'text') {
        collected[nodeId] = { value: '' }
      } else if (data.uiKind === 'file') {
        collected[nodeId] = data.uiMultiple ? { files: [] } : { filename: '', content: '', type: '', size: 0 }
      } else {
        collected[nodeId] = { choice: data.uiOptions?.[0] ?? '', index: 0 }
      }
    }
    submitUiInputs(collected)
    setValues({})
  }

  const kindIcon = (kind?: string, multiple?: boolean) => {
    if (kind === 'file') return multiple
      ? <Files size={15} className="text-fuchsia-400" />
      : <FileText size={15} className="text-fuchsia-400" />
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
          {uiNodesInfo.map(({ nodeId, data }) => {
            const isMultiple = data.uiKind === 'file' && !!data.uiMultiple
            const fileVal = values[nodeId] as (FileEntry & { files?: FileEntry[] }) | undefined
            const selectedFiles: FileEntry[] = isMultiple
              ? (fileVal?.files ?? [])
              : (fileVal ? [fileVal] : [])

            return (
              <div key={nodeId}>
                <div className="flex items-center gap-2 mb-2">
                  {kindIcon(data.uiKind, isMultiple)}
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
                      multiple={isMultiple}
                      className="hidden"
                      onChange={(e) => handleFiles(nodeId, e.target.files, isMultiple)}
                    />
                    <button
                      onClick={() => fileRefs.current[nodeId]?.click()}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#2a2a3f] hover:border-fuchsia-500 text-slate-300 text-sm transition-colors w-full"
                    >
                      {isMultiple ? <Files size={14} /> : <FileText size={14} />}
                      {selectedFiles.length === 0
                        ? (isMultiple ? 'Choose files…' : 'Choose file…')
                        : selectedFiles.length === 1
                          ? selectedFiles[0].filename
                          : `${selectedFiles.length} files selected`}
                    </button>

                    {/* File list */}
                    {selectedFiles.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {selectedFiles.map((f, i) => (
                          <li key={i} className="flex items-center justify-between text-[11px] text-slate-500 px-1">
                            <span className="truncate max-w-[320px]">{f.filename}</span>
                            <span className="ml-2 shrink-0">{f.size.toLocaleString()} B</span>
                          </li>
                        ))}
                      </ul>
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
            )
          })}
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
