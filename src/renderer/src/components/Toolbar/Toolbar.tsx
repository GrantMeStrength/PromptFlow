import React, { useState } from 'react'
import {
  Play, Square, FilePlus, FolderOpen, Save, Code2,
  Loader2, ChevronDown, ChevronUp,
} from 'lucide-react'
import { useFlowStore } from '../../store/flowStore'

interface ToolbarProps {
  showOutput: boolean
  onToggleOutput: () => void
  showCode: boolean
  onToggleCode: () => void
}

export function Toolbar({ showOutput, onToggleOutput, showCode, onToggleCode }: ToolbarProps) {
  const { project, isRunning, runPipeline, newProject, loadProject, getProject, getGeneratedCode } =
    useFlowStore()
  const [saving, setSaving] = useState(false)

  const handleNew = () => {
    if (confirm('Start a new project? Unsaved changes will be lost.')) newProject()
  }

  const handleOpen = async () => {
    const api = window.electronAPI
    if (!api) return alert('File I/O requires the Electron runtime.')
    const res = await api.loadProject()
    if (res.success && res.project) loadProject(res.project)
    else if (res.error) alert(`Could not open: ${res.error}`)
  }

  const handleSave = async () => {
    const api = window.electronAPI
    if (!api) {
      // Browser: download JSON
      const blob = new Blob([JSON.stringify(getProject(), null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${project.name.replace(/\s+/g, '_')}.promptflow`
      a.click()
      URL.revokeObjectURL(url)
      return
    }
    setSaving(true)
    const res = await api.saveProject(getProject())
    setSaving(false)
    if (!res.success) alert(`Save failed: ${res.error}`)
  }

  const handleViewCode = () => {
    if (!showCode) {
      console.log('=== Generated Code ===\n', getGeneratedCode())
    }
    onToggleCode()
  }

  return (
    <header className="flex items-center gap-2 px-4 py-2 bg-[#0d0d1a] border-b border-[#2a2a3f] shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-4">
        <div className="w-6 h-6 rounded bg-indigo-600 flex items-center justify-center">
          <span className="text-white text-[11px] font-black">PF</span>
        </div>
        <span className="text-white font-semibold text-sm tracking-tight">PromptFlow</span>
      </div>

      {/* Project name */}
      <div className="text-slate-400 text-xs truncate max-w-[180px]">{project.name}</div>

      <div className="flex-1" />

      {/* File actions */}
      <button
        onClick={handleNew}
        className="toolbar-btn"
        title="New project"
      >
        <FilePlus size={15} />
        <span>New</span>
      </button>
      <button
        onClick={handleOpen}
        className="toolbar-btn"
        title="Open project"
      >
        <FolderOpen size={15} />
        <span>Open</span>
      </button>
      <button
        onClick={handleSave}
        disabled={saving}
        className="toolbar-btn"
        title="Save project"
      >
        {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
        <span>Save</span>
      </button>

      <div className="w-px h-5 bg-[#2a2a3f] mx-1" />

      {/* Code view */}
      <button
        onClick={handleViewCode}
        className={`toolbar-btn ${showCode ? 'text-indigo-300' : ''}`}
        title="View generated code"
      >
        <Code2 size={15} />
        <span>Code</span>
        {showCode ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {/* Output toggle */}
      <button
        onClick={onToggleOutput}
        className={`toolbar-btn ${showOutput ? 'text-emerald-300' : ''}`}
        title="Toggle output panel"
      >
        <Square size={12} className={showOutput ? 'fill-current' : ''} />
        <span>Output</span>
      </button>

      <div className="w-px h-5 bg-[#2a2a3f] mx-1" />

      {/* Run */}
      <button
        onClick={() => runPipeline()}
        disabled={isRunning}
        className={`
          flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
          transition-all duration-150
          ${isRunning
            ? 'bg-indigo-800/50 text-indigo-400 cursor-not-allowed'
            : 'bg-indigo-600 hover:bg-indigo-500 text-white'}
        `}
      >
        {isRunning ? (
          <><Loader2 size={14} className="animate-spin" /> Running…</>
        ) : (
          <><Play size={14} /> Run</>
        )}
      </button>
    </header>
  )
}
