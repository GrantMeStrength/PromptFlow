import React, { useState, useEffect, useRef } from 'react'
import { X, FilePlus, FolderOpen, Trash2, Clock, Layers, Search, BookOpen } from 'lucide-react'
import type { ProjectMeta, FlowProject } from '../../types'
import { useFlowStore } from '../../store/flowStore'

interface LibraryModalProps {
  onClose: () => void
}

function timeAgo(iso: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

export function LibraryModal({ onClose }: LibraryModalProps) {
  const { loadProject, markSaved, newProject, getProject, markSaved: _ms, isDirty } = useFlowStore()
  const [projects, setProjects] = useState<ProjectMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const api = window.electronAPI

  useEffect(() => {
    searchRef.current?.focus()
    loadList()
  }, [])

  const loadList = async () => {
    if (!api) { setLoading(false); return }
    setLoading(true)
    try {
      const list = await api.listProjects()
      setProjects(list)
    } catch (e) {
      setError('Could not load projects')
    } finally {
      setLoading(false)
    }
  }

  const handleOpen = async (meta: ProjectMeta) => {
    if (!api) return
    const res = await api.openProjectByPath(meta.path)
    if (res.success && res.project) {
      loadProject(res.project as FlowProject, meta.path)
      onClose()
    } else {
      setError(res.error ?? 'Could not open project')
    }
  }

  const handleDelete = async (meta: ProjectMeta) => {
    if (!api) return
    if (!confirm(`Delete "${meta.name}"? This cannot be undone.`)) return
    setDeleting(meta.path)
    const res = await api.deleteProject(meta.path)
    setDeleting(null)
    if (res.success) {
      setProjects((p) => p.filter((x) => x.path !== meta.path))
    } else {
      setError(res.error ?? 'Delete failed')
    }
  }

  const handleSaveCurrent = async () => {
    if (!api) return
    setSaving(true)
    const project = getProject()
    const res = await api.saveToLibrary(project)
    setSaving(false)
    if (res.success && res.path) {
      markSaved(res.path)
      await loadList()
    } else {
      setError(res.error ?? 'Save failed')
    }
  }

  const handleNew = () => {
    newProject()
    onClose()
  }

  const filtered = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-[720px] max-h-[80vh] flex flex-col bg-[#0f0f1a] border border-[#2a2a3f] rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#2a2a3f]">
          <BookOpen size={18} className="text-indigo-400" />
          <span className="text-white font-semibold">Project Library</span>
          <div className="flex-1" />
          {api && isDirty && (
            <button
              onClick={handleSaveCurrent}
              disabled={saving}
              className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 transition-colors"
            >
              {saving ? 'Saving…' : 'Save Current to Library'}
            </button>
          )}
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors ml-2">
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-[#2a2a3f]">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              ref={searchRef}
              className="w-full bg-[#1a1a2e] text-slate-200 text-sm rounded-lg pl-8 pr-3 py-2 border border-[#2a2a3f] focus:border-indigo-500 outline-none"
              placeholder="Search projects…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-5">
          {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

          <div className="grid grid-cols-2 gap-3">
            {/* New Project card */}
            <button
              onClick={handleNew}
              className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#2a2a3f] hover:border-indigo-500 bg-transparent hover:bg-indigo-900/10 text-slate-500 hover:text-indigo-300 transition-all min-h-[110px] cursor-pointer"
            >
              <FilePlus size={24} />
              <span className="text-sm font-medium">New Project</span>
            </button>

            {loading ? (
              <div className="col-span-1 flex items-center justify-center text-slate-500 text-sm min-h-[110px]">
                Loading…
              </div>
            ) : filtered.length === 0 && projects.length > 0 ? (
              <div className="col-span-1 flex items-center justify-center text-slate-500 text-sm min-h-[110px]">
                No matches
              </div>
            ) : (
              filtered.map((meta) => (
                <div
                  key={meta.path}
                  className="group relative rounded-xl border border-[#2a2a3f] hover:border-indigo-500/60 bg-[#1a1a2e] hover:bg-indigo-900/10 p-4 cursor-pointer transition-all"
                  onClick={() => handleOpen(meta)}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className="font-semibold text-white text-sm leading-tight truncate flex-1">{meta.name}</span>
                    <button
                      className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all shrink-0 mt-0.5"
                      onClick={(e) => { e.stopPropagation(); handleDelete(meta) }}
                      disabled={deleting === meta.path}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  {meta.description && (
                    <p className="text-[11px] text-slate-400 line-clamp-2 mb-2">{meta.description}</p>
                  )}
                  <div className="flex items-center gap-3 text-[10px] text-slate-600">
                    <span className="flex items-center gap-1">
                      <Layers size={10} />
                      {meta.nodeCount} node{meta.nodeCount !== 1 ? 's' : ''}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      {timeAgo(meta.updated)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {!api && (
            <p className="text-slate-500 text-sm text-center mt-6">
              Project library requires the Electron runtime.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
