import React, { useState, useRef, useEffect } from 'react'
import {
  Play, Square, FilePlus, FolderOpen, Save, Code2,
  Loader2, ChevronDown, ChevronUp, Settings, BookOpen,
} from 'lucide-react'
import { useFlowStore } from '../../store/flowStore'
import { demoProject } from '../../demo/documentAnalysis'
import { emailComposerProject } from '../../demo/emailComposer'
import { codeReviewProject } from '../../demo/codeReview'
import { meetingNotesProject } from '../../demo/meetingNotes'
import type { FlowProject } from '../../types'

const EXAMPLES: { label: string; description: string; project: FlowProject }[] = [
  {
    label: 'Document Analysis',
    description: 'Keywords · word count · LLM summary',
    project: demoProject,
  },
  {
    label: 'Email Composer',
    description: 'Choice + text UI → LLM → metadata',
    project: emailComposerProject,
  },
  {
    label: 'Code Review',
    description: 'File upload + focus choice → LLM review',
    project: codeReviewProject,
  },
  {
    label: 'Meeting Notes',
    description: 'Parallel LLMs → actions + summary',
    project: meetingNotesProject,
  },
]

interface ToolbarProps {
  showOutput: boolean
  onToggleOutput: () => void
  showCode: boolean
  onToggleCode: () => void
  onOpenSettings: () => void
}

export function Toolbar({ showOutput, onToggleOutput, showCode, onToggleCode, onOpenSettings }: ToolbarProps) {
  const { project, isRunning, runPipeline, newProject, loadProject, getProject, getGeneratedCode } =
    useFlowStore()
  const [saving, setSaving] = useState(false)
  const [showExamples, setShowExamples] = useState(false)
  const examplesRef = useRef<HTMLDivElement>(null)

  // Close examples dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (examplesRef.current && !examplesRef.current.contains(e.target as Node)) {
        setShowExamples(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

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
    // drag-region makes the whole bar draggable; buttons declare no-drag individually via CSS
    <header className="drag-region flex items-center gap-2 px-4 py-2 bg-[#0d0d1a] border-b border-[#2a2a3f] shrink-0 pl-[76px]">
      {/* Logo — pl-[76px] above clears the macOS traffic-light buttons (~68px wide) */}
      <div className="no-drag flex items-center gap-2 mr-4">
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

      {/* Examples dropdown */}
      <div ref={examplesRef} className="no-drag relative">
        <button
          onClick={() => setShowExamples((v) => !v)}
          className={`toolbar-btn ${showExamples ? 'text-amber-300' : ''}`}
          title="Load an example project"
        >
          <BookOpen size={15} />
          <span>Examples</span>
          {showExamples ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>
        {showExamples && (
          <div className="absolute top-full left-0 mt-1 w-60 bg-[#13131f] border border-[#2a2a3f] rounded-xl shadow-2xl z-50 overflow-hidden">
            <div className="px-3 py-2 text-[10px] uppercase tracking-widest text-slate-500 border-b border-[#2a2a3f]">
              Example Projects
            </div>
            {EXAMPLES.map((ex) => (
              <button
                key={ex.project.id}
                onClick={() => {
                  if (confirm(`Load "${ex.label}"? Unsaved changes will be lost.`)) {
                    loadProject(ex.project)
                    setShowExamples(false)
                  }
                }}
                className="w-full flex flex-col items-start px-3 py-2.5 hover:bg-[#1e1e2e] transition-colors text-left border-b border-[#1a1a2a] last:border-0"
              >
                <span className="text-xs font-medium text-slate-200">{ex.label}</span>
                <span className="text-[11px] text-slate-500 mt-0.5">{ex.description}</span>
              </button>
            ))}
          </div>
        )}
      </div>

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

      {/* Settings */}
      <button
        onClick={onOpenSettings}
        className="toolbar-btn"
        title="Settings (API key, model)"
      >
        <Settings size={15} />
        <span>Settings</span>
      </button>

      <div className="w-px h-5 bg-[#2a2a3f] mx-1" />

      {/* Run */}
      <button
        onClick={() => runPipeline()}
        disabled={isRunning}
        className={`
          no-drag flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
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
