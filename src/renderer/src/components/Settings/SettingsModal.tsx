import React, { useEffect, useState } from 'react'
import { X, Save, Eye, EyeOff, Loader2 } from 'lucide-react'
import type { LLMSettings } from '../../types'

interface Props {
  onClose: () => void
}

const DEFAULTS: LLMSettings = {
  apiKey: '',
  baseURL: 'https://api.openai.com/v1',
  defaultModel: 'gpt-4o-mini',
}

const PROVIDER_PRESETS = [
  { label: 'OpenAI', baseURL: 'https://api.openai.com/v1' },
  { label: 'GitHub Models', baseURL: 'https://models.inference.ai.azure.com' },
  { label: 'Azure OpenAI', baseURL: '' },
]

export function SettingsModal({ onClose }: Props) {
  const [form, setForm] = useState<LLMSettings>(DEFAULTS)
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const api = window.electronAPI
    if (api) {
      api.getSettings().then(setForm)
    }
  }, [])

  const handleSave = async () => {
    const api = window.electronAPI
    if (!api) return
    setSaving(true)
    await api.saveSettings(form)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[500px] bg-[#12122a] border border-[#2a2a4f] rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a2a4f]">
          <h2 className="text-white font-semibold text-sm">Settings</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Provider presets */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">Provider</label>
            <div className="flex gap-2">
              {PROVIDER_PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => {
                    if (p.baseURL) setForm((f) => ({ ...f, baseURL: p.baseURL }))
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
                    form.baseURL === p.baseURL
                      ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
                      : 'bg-[#1a1a35] border-[#2a2a4f] text-slate-400 hover:border-[#3a3a6f]'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">API Key</label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={form.apiKey}
                onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                placeholder="sk-… or ghp_…"
                className="w-full bg-[#0d0d1a] border border-[#2a2a4f] rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 pr-10"
              />
              <button
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                type="button"
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-slate-600">
              For GitHub Models, use a GitHub Personal Access Token with Models permission.
            </p>
          </div>

          {/* Base URL */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Base URL</label>
            <input
              type="text"
              value={form.baseURL}
              onChange={(e) => setForm((f) => ({ ...f, baseURL: e.target.value }))}
              placeholder="https://api.openai.com/v1"
              className="w-full bg-[#0d0d1a] border border-[#2a2a4f] rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Default model */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Default Model</label>
            <input
              type="text"
              value={form.defaultModel}
              onChange={(e) => setForm((f) => ({ ...f, defaultModel: e.target.value }))}
              placeholder="gpt-4o-mini"
              className="w-full bg-[#0d0d1a] border border-[#2a2a4f] rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#2a2a4f]">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white border border-[#2a2a4f] hover:border-[#3a3a6f] transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all disabled:opacity-60"
          >
            {saving ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Save size={13} />
            )}
            {saved ? 'Saved!' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  )
}
