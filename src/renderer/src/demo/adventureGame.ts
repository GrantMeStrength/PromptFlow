import type { FlowNode, FlowEdge, FlowProject } from '../types'

export function createAdventureGameDemo(): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = [
    // ── Intro sticky note ─────────────────────────────────────────────────────
    {
      id: 'note-intro',
      type: 'note',
      position: { x: 20, y: -200 },
      data: {
        label: '🗺️ The Abandoned Lighthouse',
        kind: 'note',
        description: '',
        inputs: [],
        outputs: [],
        code: '',
        prompt: '',
        noteText:
          'A text-adventure demo showing Decision nodes + State nodes working together. Type a destination ("lighthouse", "cave", or "cliff") and press Run. The pipeline reads your current location from state, routes through Decision nodes, renders the matching scene, then saves your new location to state — so the next run knows where you are. Try running multiple times to explore the island.',
      },
    },

    // ── State: read current location ──────────────────────────────────────────
    {
      id: 'state-read-loc',
      type: 'state',
      position: { x: 20, y: 60 },
      data: {
        label: 'Current Location',
        kind: 'state',
        description: 'Reads the persisted current location (defaults to "beach").',
        inputs: [{ name: 'value', type: 'any', description: 'Value to store (write mode only)' }],
        outputs: [{ name: 'value', type: 'any', description: 'Stored value' }],
        stateKey: 'adventureLocation',
        stateDefault: '"beach"',
        stateMode: 'read',
        code: '',
        prompt: '',
      },
    },

    // ── Player input ──────────────────────────────────────────────────────────
    {
      id: 'ui-action',
      type: 'ui',
      position: { x: 20, y: 240 },
      data: {
        label: 'Player Action',
        kind: 'ui',
        uiKind: 'text',
        description: 'Type a destination: lighthouse, cave, cliff, or just look around.',
        inputs: [],
        outputs: [{ name: 'value', type: 'string', description: 'Player command' }],
        code: '',
        prompt: '',
        uiPlaceholder: 'e.g. go to the lighthouse',
      },
    },

    // ── Parse input ───────────────────────────────────────────────────────────
    {
      id: 'fn-parse',
      type: 'function',
      position: { x: 280, y: 140 },
      data: {
        label: 'Parse Command',
        kind: 'function',
        description: 'Combines current location and player command into a routing object.',
        inputs: [
          { name: 'location', type: 'string', description: 'Persisted location' },
          { name: 'action', type: 'string', description: 'Raw player input' },
        ],
        outputs: [{ name: 'result', type: 'object', description: 'Routing object' }],
        code: `const loc = String(inputs.location ?? 'beach').toLowerCase().trim()
const cmd = String(inputs.action ?? '').toLowerCase().trim()
result = { location: loc, command: cmd || 'look around' }`,
        prompt: '',
      },
    },

    // ── Decision: Lighthouse? ─────────────────────────────────────────────────
    {
      id: 'dec-lighthouse',
      type: 'function',
      position: { x: 560, y: 60 },
      data: {
        label: 'Go to Lighthouse?',
        kind: 'decision',
        description: 'Routes to the lighthouse scene if the player mentioned "lighthouse" or "light".',
        inputs: [{ name: 'value', type: 'object', description: 'Routing object' }],
        outputs: [
          { name: 'true', type: 'object', description: 'Routing → lighthouse path' },
          { name: 'false', type: 'object', description: 'Routing → next decision' },
        ],
        branches: ['true', 'false'],
        code: `const v = inputs.value || {}
const cmd = String(v.command ?? '')
const match = cmd.includes('lighthouse') || cmd.includes('light') || cmd === 'l'
return match ? { true: v, false: null } : { true: null, false: v }`,
        prompt: '',
      },
    },

    // ── Decision: Cave? ───────────────────────────────────────────────────────
    {
      id: 'dec-cave',
      type: 'function',
      position: { x: 560, y: 260 },
      data: {
        label: 'Go to Cave?',
        kind: 'decision',
        description: 'Routes to the cave scene if the player mentioned "cave" or "dark".',
        inputs: [{ name: 'value', type: 'object', description: 'Routing object if lighthouse not matched' }],
        outputs: [
          { name: 'true', type: 'object', description: 'Routing → cave path' },
          { name: 'false', type: 'object', description: 'Routing → next decision' },
        ],
        branches: ['true', 'false'],
        code: `const v = inputs.value || {}
const cmd = String(v.command ?? '')
const match = cmd.includes('cave') || cmd.includes('dark') || cmd === 'c'
return match ? { true: v, false: null } : { true: null, false: v }`,
        prompt: '',
      },
    },

    // ── Decision: Cliff? ──────────────────────────────────────────────────────
    {
      id: 'dec-cliff',
      type: 'function',
      position: { x: 560, y: 460 },
      data: {
        label: 'Go to Cliff?',
        kind: 'decision',
        description: 'Routes to the cliff scene if the player mentioned "cliff", "view", or "sea".',
        inputs: [{ name: 'value', type: 'object', description: 'Routing object if cave not matched' }],
        outputs: [
          { name: 'true', type: 'object', description: 'Routing → cliff path' },
          { name: 'false', type: 'object', description: 'Routing → beach fallback' },
        ],
        branches: ['true', 'false'],
        code: `const v = inputs.value || {}
const cmd = String(v.command ?? '')
const match = cmd.includes('cliff') || cmd.includes('view') || cmd.includes('sea') || cmd === 'v'
return match ? { true: v, false: null } : { true: null, false: v }`,
        prompt: '',
      },
    },

    // ── Scene: Lighthouse ─────────────────────────────────────────────────────
    {
      id: 'fn-lighthouse',
      type: 'function',
      position: { x: 900, y: -20 },
      data: {
        label: '🔦 Lighthouse Scene',
        kind: 'function',
        description: 'Returns the lighthouse location description.',
        inputs: [{ name: 'value', type: 'object', description: 'Routing object from true branch' }],
        outputs: [
          { name: 'scene', type: 'string', description: 'Scene text' },
          { name: 'nextLocation', type: 'string', description: 'New location key' },
        ],
        code: `if (!inputs.value) return { scene: '', nextLocation: '' }
return {
  scene: \`🔦  THE OLD LIGHTHOUSE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You trudge up the sandy path toward the old stone lighthouse. Its
paint has peeled away in long strips, revealing the weathered
granite beneath. The iron door stands slightly ajar, groaning
softly in the sea wind.

A brass plaque reads: "BUILT 1891 — KEEPER MALONE."

Inside, a spiral staircase winds into darkness. You can smell
lamp oil and rust. High above, something glints — perhaps the
old Fresnel lens, dusty but intact.

A logbook lies open on the floor. The last entry reads:
"The light must never go out."

→ Paths: cave (west)  |  cliff (east)  |  beach (south)\`,
  nextLocation: 'lighthouse'
}`,
        prompt: '',
      },
    },

    // ── Scene: Cave ───────────────────────────────────────────────────────────
    {
      id: 'fn-cave',
      type: 'function',
      position: { x: 900, y: 220 },
      data: {
        label: '🦇 Cave Scene',
        kind: 'function',
        description: 'Returns the cave location description.',
        inputs: [{ name: 'value', type: 'object', description: 'Routing object from true branch' }],
        outputs: [
          { name: 'scene', type: 'string', description: 'Scene text' },
          { name: 'nextLocation', type: 'string', description: 'New location key' },
        ],
        code: `if (!inputs.value) return { scene: '', nextLocation: '' }
return {
  scene: \`🦇  THE SEA CAVE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The cave mouth exhales cold, briny air as you step inside. Your
eyes adjust to the dimness. The walls are laced with veins of
quartz that catch the faint light from the entrance and scatter
it in pale blue constellations.

A natural shelf holds three objects: a tarnished compass, a
sealed glass bottle containing a rolled piece of paper, and
a child's tin toy soldier, painted red.

At the back of the cave, the rock wall has been worn smooth —
and carved into it, in neat careful letters:
"IF YOU FIND THIS — FORGIVE ME."

The tide is coming in. You have perhaps twenty minutes.

→ Paths: beach (east)  |  lighthouse (northeast)\`,
  nextLocation: 'cave'
}`,
        prompt: '',
      },
    },

    // ── Scene: Cliff ──────────────────────────────────────────────────────────
    {
      id: 'fn-cliff',
      type: 'function',
      position: { x: 900, y: 460 },
      data: {
        label: '🌊 Cliff Scene',
        kind: 'function',
        description: 'Returns the cliff location description.',
        inputs: [{ name: 'value', type: 'object', description: 'Routing object from true branch' }],
        outputs: [
          { name: 'scene', type: 'string', description: 'Scene text' },
          { name: 'nextLocation', type: 'string', description: 'New location key' },
        ],
        code: `if (!inputs.value) return { scene: '', nextLocation: '' }
return {
  scene: \`🌊  THE EAST CLIFFS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The path ends at a ragged cliff edge. Two hundred feet below,
the Atlantic heaves against black rock. Spray catches the light
and hangs briefly as a curtain of silver before the wind tears
it away.

From up here you can see the whole headland: the lighthouse to
the north-west, its windows dark; the cave mouth at beach level
to the west; and far to the south, the smudge of the mainland.

A rusted iron bench faces the sea. Someone has left fresh
wildflowers on it — tied with a red ribbon, still bright.

Scratched into the armrest: a date. Fifteen years ago.

→ Paths: beach (west)  |  lighthouse (northwest)\`,
  nextLocation: 'cliff'
}`,
        prompt: '',
      },
    },

    // ── Scene: Beach / fallback ───────────────────────────────────────────────
    {
      id: 'fn-beach',
      type: 'function',
      position: { x: 900, y: 700 },
      data: {
        label: '🏖️ Beach (Start)',
        kind: 'function',
        description: "Fallback scene — shown when the player's command doesn't match a known location.",
        inputs: [{ name: 'value', type: 'object', description: 'Unmatched routing object' }],
        outputs: [
          { name: 'scene', type: 'string', description: 'Scene text' },
          { name: 'nextLocation', type: 'string', description: 'New location key' },
        ],
        code: `if (!inputs.value) return { scene: '', nextLocation: '' }
const cmd = String(inputs.value.command ?? '')
const loc = String(inputs.value.location ?? 'beach')
return {
  scene: \`🏖️  THE GREY BEACH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"\${cmd}" — the waves crash indifferently.

You are on the grey pebble beach (previously: \${loc}). The sky is
the colour of old pewter. The sea is restless today, churning up
foam that skitters across the stones and clings to your boots.

Three paths lead away from here:
  • NORTH — An old lighthouse stands dark on the headland.
  • WEST  — A cave mouth yawns in the rockface at low tide.
  • EAST  — Chalk cliffs rise above a narrow coastal path.

A rusted sign reads: "TRESPASSERS WILL BE REMEMBERED."

→ Try: "go to the lighthouse"  |  "enter the cave"  |  "climb the cliff"\`,
  nextLocation: 'beach'
}`,
        prompt: '',
      },
    },

    // ── Merge branches ────────────────────────────────────────────────────────
    {
      id: 'fn-merge',
      type: 'function',
      position: { x: 1230, y: 360 },
      data: {
        label: 'Merge Scenes',
        kind: 'function',
        description:
          'Picks whichever branch produced text, and captures the next location for state persistence.',
        inputs: [
          { name: 'lighthouse', type: 'object', description: 'Lighthouse scene or empty' },
          { name: 'cave', type: 'object', description: 'Cave scene or empty' },
          { name: 'cliff', type: 'object', description: 'Cliff scene or empty' },
          { name: 'unknown', type: 'object', description: 'Beach scene or empty' },
        ],
        outputs: [
          { name: 'scene', type: 'string', description: 'The active scene text' },
          { name: 'nextLocation', type: 'string', description: 'Location to persist' },
        ],
        code: `// inputs.lighthouse/cave/cliff/unknown are scene strings (extracted via sourceHandle)
const scene = inputs.lighthouse || inputs.cave || inputs.cliff || inputs.unknown || '❓ Unknown location.'
const nextLocation = inputs.lighthouse ? 'lighthouse' : inputs.cave ? 'cave' : inputs.cliff ? 'cliff' : 'beach'
result = { scene, nextLocation }`,
        prompt: '',
      },
    },

    // ── State: write new location ─────────────────────────────────────────────
    {
      id: 'state-write-loc',
      type: 'state',
      position: { x: 1510, y: 240 },
      data: {
        label: 'Save Location',
        kind: 'state',
        description: 'Persists the new location for the next pipeline run.',
        inputs: [{ name: 'value', type: 'any', description: 'Location key to store' }],
        outputs: [{ name: 'value', type: 'any', description: 'Stored value' }],
        stateKey: 'adventureLocation',
        stateDefault: '"beach"',
        stateMode: 'write',
        code: '',
        prompt: '',
      },
    },

    // ── Output ────────────────────────────────────────────────────────────────
    {
      id: 'output-story',
      type: 'output',
      position: { x: 1510, y: 480 },
      data: {
        label: 'Story Output',
        kind: 'output',
        description: 'Displays the scene description for the chosen location.',
        inputs: [{ name: 'text', type: 'string', description: 'Scene text' }],
        outputs: [],
        code: `result = inputs.text`,
        prompt: '',
      },
    },
  ]

  const edges: FlowEdge[] = [
    // State read → parse
    { id: 'e0', source: 'state-read-loc', target: 'fn-parse', sourceHandle: 'value', targetHandle: 'location' },
    // Player action → parse
    { id: 'e1', source: 'ui-action', target: 'fn-parse', sourceHandle: 'value', targetHandle: 'action' },

    // Parse → first decision
    { id: 'e2', source: 'fn-parse', target: 'dec-lighthouse', sourceHandle: 'result', targetHandle: 'value' },

    // Decision chain (false branches cascade down)
    { id: 'e3', source: 'dec-lighthouse', target: 'dec-cave', sourceHandle: 'false', targetHandle: 'value' },
    { id: 'e4', source: 'dec-cave', target: 'dec-cliff', sourceHandle: 'false', targetHandle: 'value' },
    { id: 'e5', source: 'dec-cliff', target: 'fn-beach', sourceHandle: 'false', targetHandle: 'value' },

    // True branches → scene functions
    { id: 'e6', source: 'dec-lighthouse', target: 'fn-lighthouse', sourceHandle: 'true', targetHandle: 'value' },
    { id: 'e7', source: 'dec-cave', target: 'fn-cave', sourceHandle: 'true', targetHandle: 'value' },
    { id: 'e8', source: 'dec-cliff', target: 'fn-cliff', sourceHandle: 'true', targetHandle: 'value' },

    // Scene functions → merge
    { id: 'e9', source: 'fn-lighthouse', target: 'fn-merge', sourceHandle: 'scene', targetHandle: 'lighthouse' },
    { id: 'e10', source: 'fn-cave', target: 'fn-merge', sourceHandle: 'scene', targetHandle: 'cave' },
    { id: 'e11', source: 'fn-cliff', target: 'fn-merge', sourceHandle: 'scene', targetHandle: 'cliff' },
    { id: 'e12', source: 'fn-beach', target: 'fn-merge', sourceHandle: 'scene', targetHandle: 'unknown' },

    // Merge → state write (save location)
    { id: 'e14', source: 'fn-merge', target: 'state-write-loc', sourceHandle: 'nextLocation', targetHandle: 'value' },

    // Merge → output
    { id: 'e13', source: 'fn-merge', target: 'output-story', sourceHandle: 'scene', targetHandle: 'text' },
  ]

  return { nodes, edges }
}

export const adventureGameProject: FlowProject = {
  id: 'adventure-game',
  name: 'Adventure Game',
  ...createAdventureGameDemo(),
  createdAt: Date.now(),
  updatedAt: Date.now(),
}
