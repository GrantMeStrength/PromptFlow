import type { FlowNode, FlowEdge, FlowProject } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// Adventure Game — re-architected using a location transition map.
//
// Old design: Decision chain routing on command keywords → couldn't handle
//   directional movement ("north") because it didn't know the current location.
//
// New design: State holds current location. A single Navigate node has a
//   full transition table (location + direction → next location), so "north"
//   means something different depending on where you are. Scenes are rendered
//   by a separate Scene Renderer node. Clean, stateful, correct.
//
//   ┌──────────────────┐   ┌──────────────┐
//   │ State: Location  │   │ Player Input │
//   └────────┬─────────┘   └──────┬───────┘
//            │ location           │ command
//            └──────────┬─────────┘
//                       ▼
//               ┌───────────────┐
//               │   Navigate    │  (transition table + command parser)
//               └───┬───────────┘
//                   │ nextLocation
//         ┌─────────┴────────┐
//         ▼                  ▼
//  ┌─────────────┐   ┌──────────────┐
//  │ Scene Text  │   │ Save Location│
//  └──────┬──────┘   └──────────────┘
//         │ scene
//         ▼
//   ┌───────────┐
//   │  Output   │
//   └───────────┘
// ─────────────────────────────────────────────────────────────────────────────

export function createAdventureGameDemo(): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = [
    // ── Intro sticky note ─────────────────────────────────────────────────────
    {
      id: 'note-intro',
      type: 'note',
      position: { x: 20, y: -240 },
      data: {
        label: '🗺️ The Abandoned Lighthouse',
        kind: 'note',
        description: '',
        inputs: [],
        outputs: [],
        code: '',
        prompt: '',
        noteText:
          'A text-adventure showing State nodes + directional navigation. Your location is stored in state between runs. The Navigate node uses a transition table — "north" means different things depending on where you are. Try: "north", "west", "go to cave", "look". Run multiple times to explore. State persists until you reload the project.',
      },
    },

    // ── State: read current location ──────────────────────────────────────────
    {
      id: 'state-read-loc',
      type: 'state',
      position: { x: 40, y: 80 },
      data: {
        label: 'Current Location',
        kind: 'state',
        description: 'Reads the persisted current location (defaults to "beach" on first run).',
        inputs: [],
        outputs: [{ name: 'value', type: 'string', description: 'Current location key' }],
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
      position: { x: 40, y: 280 },
      data: {
        label: 'Player Action',
        kind: 'ui',
        uiKind: 'text',
        description: 'Type a direction or destination. Try: north, west, east, south, go to lighthouse, look, help.',
        inputs: [],
        outputs: [{ name: 'value', type: 'string', description: 'Player command' }],
        code: '',
        prompt: '',
        uiPlaceholder: 'e.g. north  |  go to cave  |  look',
      },
    },

    // ── Navigate ──────────────────────────────────────────────────────────────
    //
    // Core of the re-architecture. Receives the current location from state
    // and the player's raw command, then resolves the next location using a
    // full transition table. Handles:
    //   • Cardinal directions: north / n, south / s, east / e, west / w, ne, nw
    //   • "go to X" / "travel to X" / "enter X" keywords
    //   • "look" / "help" / empty → stay in current location
    //   • Invalid moves → stay and report why
    {
      id: 'fn-navigate',
      type: 'function',
      position: { x: 380, y: 160 },
      data: {
        label: '🧭 Navigate',
        kind: 'function',
        description:
          'Resolves movement: uses a transition table to map (currentLocation + command) → nextLocation. Handles directions, place names, look, and help.',
        inputs: [
          { name: 'location', type: 'string', description: 'Current location from state' },
          { name: 'command', type: 'string', description: 'Raw player command' },
        ],
        outputs: [
          { name: 'nextLocation', type: 'string', description: 'Resolved next location key' },
          { name: 'message', type: 'string', description: 'Optional status message (e.g. "You can\'t go that way")' },
        ],
        code: `// Transition table: location → { direction/alias → destination }
const EXITS = {
  beach:      { north: 'lighthouse', n: 'lighthouse',
                west: 'cave',        w: 'cave',
                east: 'cliff',       e: 'cliff' },
  lighthouse: { south: 'beach',      s: 'beach',
                west: 'cave',        w: 'cave',
                east: 'cliff',       e: 'cliff' },
  cave:       { east: 'beach',       e: 'beach',
                northeast: 'lighthouse', ne: 'lighthouse' },
  cliff:      { west: 'beach',       w: 'beach',
                northwest: 'lighthouse', nw: 'lighthouse' },
}

// Place name keywords that can appear in commands
const PLACE_NAMES = { lighthouse: 'lighthouse', light: 'lighthouse', cave: 'cave',
                      dark: 'cave', cliff: 'cliff', cliffs: 'cliff', sea: 'cliff',
                      beach: 'beach', shore: 'beach', start: 'beach' }

const loc = String(inputs.location ?? 'beach').toLowerCase().trim()
const raw = String(inputs.command ?? '').toLowerCase().trim()

// Normalise: strip filler words
const cmd = raw.replace(/^(go\\s+to|travel\\s+to|head\\s+to|move\\s+to|enter|walk\\s+to|run\\s+to)\\s+/i, '').trim()

// "look", "help", or empty → stay
if (!cmd || cmd === 'look' || cmd === 'l' || cmd === 'help' || cmd === '?') {
  return { nextLocation: loc, message: '' }
}

const exits = EXITS[loc] || {}

// 1. Try exact direction match
if (exits[cmd]) {
  return { nextLocation: exits[cmd], message: '' }
}

// 2. Try place name in command
for (const [keyword, place] of Object.entries(PLACE_NAMES)) {
  if (cmd.includes(keyword)) {
    const canGo = Object.values(exits).includes(place)
    if (canGo || place === loc) {
      return { nextLocation: place, message: '' }
    }
    return { nextLocation: loc, message: \`You can't reach the \${place} directly from here.\` }
  }
}

// 3. No match → stay, report invalid move
const exitList = Object.keys(exits).filter(k => k.length > 1).join(', ')
return { nextLocation: loc, message: \`"\${raw}" — you can't go that way. Exits: \${exitList || 'none'}.\` }`,
        prompt: '',
      },
    },

    // ── Scene Renderer ────────────────────────────────────────────────────────
    //
    // Takes the resolved next location and renders the full scene text.
    // Separated from Navigate so the graph clearly shows two concerns:
    // "where do I go?" (Navigate) and "what do I see?" (Scene Renderer).
    {
      id: 'fn-scene',
      type: 'function',
      position: { x: 740, y: 60 },
      data: {
        label: '📜 Scene Renderer',
        kind: 'function',
        description: 'Renders the full scene description for the given location, with its available exits.',
        inputs: [
          { name: 'location', type: 'string', description: 'Location to render' },
          { name: 'message', type: 'string', description: 'Optional status message to prepend' },
        ],
        outputs: [
          { name: 'scene', type: 'string', description: 'Full scene text to display' },
        ],
        code: `const SCENES = {
  beach: {
    icon: '🏖️',
    title: 'THE GREY BEACH',
    body: \`The grey pebble beach stretches in both directions. The sky is
the colour of old pewter. The sea churns up foam that skitters
across the stones and clings to your boots.

A rusted sign reads: "TRESPASSERS WILL BE REMEMBERED."\`,
    exits: 'north → lighthouse  |  west → cave  |  east → cliff',
  },
  lighthouse: {
    icon: '🔦',
    title: 'THE OLD LIGHTHOUSE',
    body: \`A crumbling stone lighthouse looms above. Its iron door stands
slightly ajar, groaning in the sea wind. A brass plaque reads:
"BUILT 1891 — KEEPER MALONE."

Inside, a spiral staircase winds into darkness. A logbook lies
open on the floor. The last entry: "The light must never go out."\`,
    exits: 'south → beach  |  west → cave  |  east → cliff',
  },
  cave: {
    icon: '🦇',
    title: 'THE SEA CAVE',
    body: \`The cave mouth exhales cold, briny air. Quartz veins in the
walls scatter faint light in pale blue constellations.

A natural shelf holds: a tarnished compass, a sealed bottle
with a rolled paper inside, and a child's tin toy soldier.

Carved into the back wall in neat letters:
"IF YOU FIND THIS — FORGIVE ME."

The tide is coming in.\`,
    exits: 'east → beach  |  northeast → lighthouse',
  },
  cliff: {
    icon: '🌊',
    title: 'THE EAST CLIFFS',
    body: \`The path ends at a ragged cliff edge. Far below, the Atlantic
heaves against black rock. From here you can see the whole
headland: the lighthouse to the northwest, the cave mouth to
the west, and the mainland smudged on the horizon.

A rusted iron bench faces the sea. Someone has left fresh
wildflowers — tied with a red ribbon, still bright.
Scratched into the armrest: a date. Fifteen years ago.\`,
    exits: 'west → beach  |  northwest → lighthouse',
  },
}

const loc = String(inputs.location ?? 'beach').toLowerCase().trim()
const msg = String(inputs.message ?? '').trim()
const s = SCENES[loc] || SCENES.beach

const header = msg ? \`⚠️  \${msg}\\n\\n\` : ''
result = {
  scene: \`\${header}\${s.icon}  \${s.title}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

\${s.body}

→ Exits: \${s.exits}\`
}`,
        prompt: '',
      },
    },

    // ── State: write new location ─────────────────────────────────────────────
    {
      id: 'state-write-loc',
      type: 'state',
      position: { x: 740, y: 400 },
      data: {
        label: 'Save Location',
        kind: 'state',
        description: 'Persists the resolved next location so the next run starts there.',
        inputs: [{ name: 'value', type: 'any', description: 'Location key to store' }],
        outputs: [{ name: 'value', type: 'any', description: 'Stored value (pass-through)' }],
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
      position: { x: 1060, y: 160 },
      data: {
        label: 'Story Output',
        kind: 'output',
        description: 'Displays the rendered scene.',
        inputs: [{ name: 'text', type: 'string', description: 'Scene text' }],
        outputs: [],
        code: `result = inputs.text`,
        prompt: '',
      },
    },
  ]

  const edges: FlowEdge[] = [
    // ── Inputs into Navigate ──────────────────────────────────────────────────
    { id: 'e-loc-nav',  source: 'state-read-loc', target: 'fn-navigate', sourceHandle: 'value',        targetHandle: 'location' },
    { id: 'e-cmd-nav',  source: 'ui-action',       target: 'fn-navigate', sourceHandle: 'value',        targetHandle: 'command'  },

    // ── Navigate → Scene Renderer ─────────────────────────────────────────────
    { id: 'e-nav-scene-loc', source: 'fn-navigate', target: 'fn-scene', sourceHandle: 'nextLocation', targetHandle: 'location' },
    { id: 'e-nav-scene-msg', source: 'fn-navigate', target: 'fn-scene', sourceHandle: 'message',      targetHandle: 'message'  },

    // ── Navigate → Save Location ──────────────────────────────────────────────
    { id: 'e-nav-state', source: 'fn-navigate', target: 'state-write-loc', sourceHandle: 'nextLocation', targetHandle: 'value' },

    // ── Scene → Output ────────────────────────────────────────────────────────
    { id: 'e-scene-out', source: 'fn-scene', target: 'output-story', sourceHandle: 'scene', targetHandle: 'text' },
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
