import type { FlowNode, FlowEdge, FlowProject } from '../types'

export function createAdventureGameDemo(): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = [
    // ── Intro sticky note ─────────────────────────────────────────────────────
    {
      id: 'note-intro',
      type: 'note',
      position: { x: 20, y: -180 },
      data: {
        label: '🗺️ The Abandoned Lighthouse',
        kind: 'note',
        description: '',
        inputs: [],
        outputs: [],
        code: '',
        prompt: '',
        noteText:
          'A text-adventure demo showing Decision node routing. Type a location — "lighthouse", "cave", or "cliff" — and the pipeline routes through a chain of Decision nodes to reach the matching scene. Only one branch carries data; the rest stay null and return empty. A Merge node picks the non-empty result.',
      },
    },

    // ── Decision routing explanation note ─────────────────────────────────────
    {
      id: 'note-routing',
      type: 'note',
      position: { x: 500, y: -180 },
      data: {
        label: '🔀 How Decision Routing Works',
        kind: 'note',
        description: '',
        inputs: [],
        outputs: [],
        code: '',
        prompt: '',
        noteText:
          'Each Decision node checks one keyword. Its TRUE handle carries the command onward; its FALSE handle passes the command to the next Decision node below. Only the matching scene function receives a non-null input and returns text. The Merge node at the end picks whichever scene has content.',
      },
    },

    // ── Player input ──────────────────────────────────────────────────────────
    {
      id: 'ui-action',
      type: 'ui',
      position: { x: 20, y: 60 },
      data: {
        label: 'Player Action',
        kind: 'ui',
        uiKind: 'text',
        description: 'Type a destination: lighthouse, cave, cliff, or just explore the beach.',
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
      position: { x: 280, y: 60 },
      data: {
        label: 'Parse Command',
        kind: 'function',
        description: 'Normalise the player command to lowercase for reliable matching.',
        inputs: [{ name: 'value', type: 'string', description: 'Raw player input' }],
        outputs: [{ name: 'result', type: 'string', description: 'Normalised command' }],
        code: `const raw = String(inputs.value ?? '').toLowerCase().trim()
result = raw || 'look around'`,
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
        inputs: [{ name: 'value', type: 'string', description: 'Normalised command' }],
        outputs: [
          { name: 'true', type: 'string', description: 'Command → lighthouse path' },
          { name: 'false', type: 'string', description: 'Command → next decision' },
        ],
        branches: ['true', 'false'],
        code: `const cmd = String(inputs.value ?? '')
const match = cmd.includes('lighthouse') || cmd.includes('light') || cmd === 'l'
return match ? { true: cmd, false: null } : { true: null, false: cmd }`,
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
        inputs: [{ name: 'value', type: 'string', description: 'Command if lighthouse not matched' }],
        outputs: [
          { name: 'true', type: 'string', description: 'Command → cave path' },
          { name: 'false', type: 'string', description: 'Command → next decision' },
        ],
        branches: ['true', 'false'],
        code: `const cmd = String(inputs.value ?? '')
const match = cmd.includes('cave') || cmd.includes('dark') || cmd === 'c'
return match ? { true: cmd, false: null } : { true: null, false: cmd }`,
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
        inputs: [{ name: 'value', type: 'string', description: 'Command if cave not matched' }],
        outputs: [
          { name: 'true', type: 'string', description: 'Command → cliff path' },
          { name: 'false', type: 'string', description: 'Command → beach fallback' },
        ],
        branches: ['true', 'false'],
        code: `const cmd = String(inputs.value ?? '')
const match = cmd.includes('cliff') || cmd.includes('view') || cmd.includes('sea') || cmd === 'v'
return match ? { true: cmd, false: null } : { true: null, false: cmd }`,
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
        inputs: [{ name: 'value', type: 'string', description: 'Command from true branch' }],
        outputs: [{ name: 'result', type: 'string', description: 'Scene text' }],
        code: `if (!inputs.value) return { result: '' }
result = \`🔦  THE OLD LIGHTHOUSE
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

→ Paths: cave (west)  |  cliff (east)  |  beach (south)\``,
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
        inputs: [{ name: 'value', type: 'string', description: 'Command from true branch' }],
        outputs: [{ name: 'result', type: 'string', description: 'Scene text' }],
        code: `if (!inputs.value) return { result: '' }
result = \`🦇  THE SEA CAVE
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

→ Paths: beach (east)  |  lighthouse (northeast)\``,
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
        inputs: [{ name: 'value', type: 'string', description: 'Command from true branch' }],
        outputs: [{ name: 'result', type: 'string', description: 'Scene text' }],
        code: `if (!inputs.value) return { result: '' }
result = \`🌊  THE EAST CLIFFS
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

→ Paths: beach (west)  |  lighthouse (northwest)\``,
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
        inputs: [{ name: 'value', type: 'string', description: 'Unmatched command' }],
        outputs: [{ name: 'result', type: 'string', description: 'Scene text' }],
        code: `if (!inputs.value) return { result: '' }
const cmd = inputs.value
result = \`🏖️  THE GREY BEACH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"\${cmd}" — the waves crash indifferently.

You stand on the grey pebble beach. The sky is the colour of old
pewter. The sea is restless today, churning up foam that skitters
across the stones and clings to your boots.

Three paths lead away from here:
  • NORTH — An old lighthouse stands dark on the headland.
  • WEST  — A cave mouth yawns in the rockface at low tide.
  • EAST  — Chalk cliffs rise above a narrow coastal path.

A rusted sign reads: "TRESPASSERS WILL BE REMEMBERED."

→ Try: "go to the lighthouse"  |  "enter the cave"  |  "climb the cliff"\``,
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
          'Picks whichever branch produced text. Only one scene carries a non-empty result; the others return empty strings.',
        inputs: [
          { name: 'lighthouse', type: 'string', description: 'Lighthouse scene or empty' },
          { name: 'cave', type: 'string', description: 'Cave scene or empty' },
          { name: 'cliff', type: 'string', description: 'Cliff scene or empty' },
          { name: 'unknown', type: 'string', description: 'Beach scene or empty' },
        ],
        outputs: [{ name: 'result', type: 'string', description: 'The active scene text' }],
        code: `result = inputs.lighthouse || inputs.cave || inputs.cliff || inputs.unknown || '❓ Unknown location.'`,
        prompt: '',
      },
    },

    // ── Output ────────────────────────────────────────────────────────────────
    {
      id: 'output-story',
      type: 'output',
      position: { x: 1510, y: 360 },
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
    // Player action → parse
    { id: 'e1', source: 'ui-action', target: 'fn-parse', sourceHandle: 'value', targetHandle: 'value' },

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
    { id: 'e9', source: 'fn-lighthouse', target: 'fn-merge', sourceHandle: 'result', targetHandle: 'lighthouse' },
    { id: 'e10', source: 'fn-cave', target: 'fn-merge', sourceHandle: 'result', targetHandle: 'cave' },
    { id: 'e11', source: 'fn-cliff', target: 'fn-merge', sourceHandle: 'result', targetHandle: 'cliff' },
    { id: 'e12', source: 'fn-beach', target: 'fn-merge', sourceHandle: 'result', targetHandle: 'unknown' },

    // Merge → output
    { id: 'e13', source: 'fn-merge', target: 'output-story', sourceHandle: 'result', targetHandle: 'text' },
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
