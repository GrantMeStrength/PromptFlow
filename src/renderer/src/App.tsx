import React from 'react'
import { Toolbar } from './components/Toolbar/Toolbar'
import { NodePalette } from './components/Palette/NodePalette'
import { FlowCanvas } from './components/Canvas/FlowCanvas'
import { NodeInspector } from './components/Inspector/NodeInspector'
import { PromptBar } from './components/PromptBar/PromptBar'
import { OutputPanel } from './components/Canvas/OutputPanel'
import { CodeViewer } from './components/Canvas/CodeViewer'
import { SettingsModal } from './components/Settings/SettingsModal'
import UIInputModal from './components/UIInputModal/UIInputModal'
import { LibraryModal } from './components/Library/LibraryModal'
import { WizardPanel } from './components/Wizard/WizardPanel'
import { useFlowStore } from './store/flowStore'

export default function App() {
  const { showOutput, toggleOutput } = useFlowStore()
  const [showCode, setShowCode] = React.useState(false)
  const [showSettings, setShowSettings] = React.useState(false)
  const [showLibrary, setShowLibrary] = React.useState(false)
  const [showWizard, setShowWizard] = React.useState(false)

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0f0f1a] text-white overflow-hidden">
      <Toolbar
        showOutput={showOutput}
        onToggleOutput={toggleOutput}
        showCode={showCode}
        onToggleCode={() => setShowCode((v) => !v)}
        onOpenSettings={() => setShowSettings(true)}
        onOpenLibrary={() => setShowLibrary(true)}
        onOpenWizard={() => setShowWizard((v) => !v)}
      />

      {/* Main workspace */}
      <div className="flex flex-1 overflow-hidden">
        <NodePalette />

        {/* Canvas + bottom panels */}
        <div className="flex flex-col flex-1 overflow-hidden">
          <FlowCanvas />
          {showCode && <CodeViewer onClose={() => setShowCode(false)} />}
          {showOutput && <OutputPanel onClose={toggleOutput} />}
        </div>

        <NodeInspector />
      </div>

      <PromptBar />

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      <UIInputModal />
      {showLibrary && <LibraryModal onClose={() => setShowLibrary(false)} />}
      {showWizard && <WizardPanel onClose={() => setShowWizard(false)} />}
    </div>
  )
}
