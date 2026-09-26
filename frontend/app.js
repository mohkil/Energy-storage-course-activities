/* ==========================================================================
   Energy Storage Course Activities — Application Logic
   Course: GSOE9111 / ENGG4111 Energy Storage (UNSW)
   Frontend: React 18
   Backend: Cloudflare Worker + D1 Database
   ========================================================================== */

const { useState, useEffect, useRef } = React;

/* ==========================================================================
   1. CONSTANTS & DESIGN TOKENS
   ========================================================================== */
const T = {
  bg: "#10162B",
  panel: "#1A2240",
  panelSoft: "#212A4E",
  line: "#2C3560",
  ink: "#F2F4FB",
  muted: "#8A93B8",
  volt: "#FFD23F",
  teal: "#3EC9C0",
  red: "#F06A5D",
  display: "'Space Grotesk', 'Segoe UI', system-ui, sans-serif",
  mono: "'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace",
  body: "'Inter', 'Segoe UI', system-ui, sans-serif",
};

// Cloudflare Worker backend API endpoint
const API_URL = "https://energy-storage-course-activities-worker.mohkil-dev.workers.dev/";

// Base path for scenario illustrations
const IMG_BASE = "./images/";

// Local storage keys for session recovery on refresh
const HOST_SESSION_KEY = "esca_host_session";
const TEAM_SESSION_KEY = "esca_team_session";
const TAB_MODE_KEY = "esca_tab_mode";

// Helper for session key formatting (e.g. esca-ABCD-state)
const K = (code, ...p) => `esca-${code}-${p.join("-")}`;

// CSV Export Columns (Cell battery activity only)
const CSV_COLS = [
  "session_code",
  "round_id",
  "round_title",
  "team_name",
  "team_id",
  "seconds_to_submit",
  "design_iterations",
  "points",
  "anode",
  "cathode",
  "electrolyte",
  "cell_voltage_V",
  "energy_Wh_per_kg",
  "cost_index",
  "safety_of_5",
  "power_of_5",
  "rechargeable",
  "viable",
  "famous_cell",
  "design_summary",
];

// Student behavior & clickstream telemetry columns
const TRACE_CSV_COLS = [
  "session_code",
  "round_id",
  "round_title",
  "team_name",
  "team_id",
  "event_seq",
  "event_type",
  "item_kind",
  "item_id",
  "item_name",
  "t_relative_sec",
  "delta_t_sec",
  "deliberation_category",
  "current_anode",
  "current_cathode",
  "current_elyte",
  "cell_complete",
  "cell_viable",
  "cell_voltage_V",
  "cell_energy_Wh_kg",
  "cell_safety",
  "cell_power",
  "cell_cost",
  "cell_rechargeable",
  "est_score",
  "delta_score",
  "benchmark_match_count",
  "active_misconception",
  "fatal_issues",
  "famous_cell",
  "device_type",
  "screen_width",
  "logged_at_utc"
];

/* ==========================================================================
   2. DYNAMIC STATE CONTAINERS & ROBUST ROUND RESOLVER
   ========================================================================== */
const DEFAULT_ANODES = [
  { id: "zn", name: "Zinc", E: -1.25, Q: 820, cost: 1, elytes: ["koh"], flags: { dendrite: true }, tag: "The workhorse" },
  { id: "fe", name: "Iron", E: -0.88, Q: 960, cost: 1, elytes: ["koh"], flags: { rateLimited: true }, tag: "Dirt cheap" },
  { id: "pb", name: "Lead", E: -0.36, Q: 259, cost: 1, elytes: ["acid"], flags: { toxic: true }, tag: "Heavy but honest" },
  { id: "cd", name: "Cadmium", E: -0.81, Q: 477, cost: 2, elytes: ["koh"], flags: { toxic: true, highRate: true }, tag: "Rugged toxic" },
  { id: "mh", name: "Metal hydride", E: -0.83, Q: 330, cost: 2, elytes: ["koh"], flags: { rateLimited: true }, tag: "Hydrogen sponge" },
  { id: "gr", name: "Graphite (LiC6)", E: -2.94, Q: 372, cost: 2, elytes: ["org"], flags: {}, tag: "Li-ion classic" },
  { id: "li", name: "Lithium metal", E: -3.04, Q: 3860, cost: 4, elytes: ["org"], flags: { dendrite: true }, tag: "The prize" },
  { id: "na", name: "Sodium metal", E: -2.71, Q: 1166, cost: 1, elytes: ["org"], flags: { dendrite: true }, tag: "Salt of the earth" },
];

const DEFAULT_CATHODES = [
  { id: "mno2", name: "MnO2", E: 0.35, Q: 308, cost: 1, elytes: ["koh", "org"], flags: { noRecharge: true }, tag: "Alkaline staple" },
  { id: "nioh", name: "NiOOH", E: 0.49, Q: 292, cost: 2, elytes: ["koh"], flags: {}, tag: "Nickel hydroxide" },
  { id: "air", name: "O2 (air cathode)", E: 0.4, Q: 3350, cost: 1, elytes: ["koh"], flags: { airSlow: true, rechargePoor: true }, tag: "Free reactant" },
  { id: "pbo2", name: "PbO2", E: 1.69, Q: 224, cost: 1, elytes: ["acid"], flags: { toxic: true }, tag: "Lead dioxide" },
  { id: "br2", name: "Br2 / Br-", E: 1.09, Q: 335, cost: 1, elytes: ["acid"], flags: { corrosive: true }, tag: "Corrosive punch" },
  { id: "lfp", name: "LiFePO4", E: 0.36, Q: 170, cost: 2, elytes: ["org"], flags: { safeCathode: true }, tag: "Olivine fortress" },
  { id: "lco", name: "LiCoO2", E: 0.86, Q: 274, cost: 4, elytes: ["org"], flags: { runaway: true }, tag: "Energy dense" },
  { id: "s", name: "Sulfur", E: -0.94, Q: 1672, cost: 1, elytes: ["org"], flags: { shuttle: true }, tag: "Research darling" },
  { id: "ag2o", name: "Ag2O (Silver oxide)", E: 0.34, Q: 231, cost: 3, elytes: ["koh"], flags: { noRecharge: true }, tag: "Precision silver" },
];

const DEFAULT_ELYTES = [
  { id: "koh", name: "Aqueous alkaline (KOH)", short: "KOH", cost: 1, power: 4 },
  { id: "acid", name: "Aqueous acid (H2SO4)", short: "H2SO4", cost: 1, power: 4 },
  { id: "org", name: "Organic carbonate + Li/Na salt", short: "Organic solvent", cost: 2, power: 2.5 },
];

const DEFAULT_FAMOUS = {
  "zn|mno2|koh": "the Alkaline cell (Zn-MnO2)",
  "zn|air|koh": "the Zinc-air button cell",
  "pb|pbo2|acid": "the Lead-acid battery",
  "cd|nioh|koh": "NiCd",
  "mh|nioh|koh": "NiMH",
  "gr|lco|org": "Li-ion (LCO) - the cell in your phone",
  "gr|lfp|org": "today's grid containers (LFP)",
  "li|mno2|org": "the Lithium primary (Li-MnO2)",
  "li|s|org": "Li-S - a research-stage chemistry",
  "fe|air|koh": "Iron-air - Form Energy's 100-hour battery",
  "fe|nioh|koh": "the Nickel-iron Edison cell (1901!)",
  "zn|ag2o|koh": "the Silver-oxide button cell (Zn-Ag2O)",
};

const DEFAULT_SCENARIOS = [
  {
    id: "1", order: 1, title: "Round 1: The Hearing Aid",
    brief: "MediSound Pty Ltd needs a cell for a next-gen hearing aid. It must pack maximum energy into a tiny, body worn device. Absolute safety next to someone's head. Cost matters - it's disposable. Power draw is tiny. Recharging is a nice-to-have, not required.",
    image_file: "scenario_1.png", seconds: 180,
    weights: { energy: 0.35, cost: 0.15, safety: 0.30, power: 0.05, lifespan: 0.15 },
    requireRecharge: false, reveal: "", best1: "", best2: "",
    preset_label: "Battery Builder", preset_desc: "5 design rounds: pick anode, cathode, electrolyte against client briefs"
  },
  {
    id: "2", order: 2, title: "Round 2: The Cordless Drill",
    brief: "ToolCo wants a pack for a rugged tradie drill: brutal discharge rates, drop-it-off-a-ladder durability, and a price that survives a hardware-store shelf. Must be rechargeable. Weight matters less than grunt.",
    image_file: "scenario_2.png", seconds: 180,
    weights: { energy: 0.22, cost: 0.17, safety: 0.18, power: 0.33, lifespan: 0.10 },
    requireRecharge: true, reveal: "", best1: "", best2: "",
    preset_label: "Battery Builder", preset_desc: "5 design rounds: pick anode, cathode, electrolyte against client briefs"
  },
  {
    id: "3", order: 3, title: "Round 3: The Delivery Drone",
    brief: "SwiftWing's delivery drone lives or dies on Wh/kg - every gram of battery is a gram of parcel it can't carry. Needs solid discharge power for climb-outs, hundreds of cycles, and it flies over people's heads, so safety isn't optional. Budget: aerospace, i.e. generous.",
    image_file: "scenario_3.png", seconds: 180,
    weights: { energy: 0.65, cost: 0.02, safety: 0.15, power: 0.18, lifespan: 0.00 },
    requireRecharge: true, reveal: "", best1: "", best2: "",
    preset_label: "Battery Builder", preset_desc: "5 design rounds: pick anode, cathode, electrolyte against client briefs"
  },
  {
    id: "4", order: 4, title: "Round 4: The Grid Container",
    brief: "AusGrid Storage Co is filling shipping containers next to a solar farm. Land is cheap, so energy density barely matters. What matters: $/kWh, fire safety (rural fire bans!), daily cycling for 20 years, decent power. Must be rechargeable.",
    image_file: "scenario_4.png", seconds: 180,
    weights: { energy: 0.05, cost: 0.30, safety: 0.30, power: 0.15, lifespan: 0.20 },
    requireRecharge: true, reveal: "", best1: "", best2: "",
    preset_label: "Battery Builder", preset_desc: "5 design rounds: pick anode, cathode, electrolyte against client briefs"
  },
  {
    id: "5", order: 5, title: "Round 5: Sterile dose-tracking patch",
    brief: "DoseTrace Medical needs a thin cell for a disposable patch that records handling conditions and drives a small display. Stable voltage matters for accurate sensing. The patch is body worn, so leakage control and skin safety are essential. Cost matters at production scale, while power draw is very small and recharging is unnecessary.",
    image_file: "scenario_5.png", seconds: 180,
    weights: { energy: 0.20, cost: 0.15, safety: 0.30, power: 0.10, lifespan: 0.25 },
    requireRecharge: false, reveal: "", best1: "", best2: "",
    preset_label: "Battery Builder", preset_desc: "5 design rounds: pick anode, cathode, electrolyte against client briefs"
  },
];

let ANODES = [...DEFAULT_ANODES];
let CATHODES = [...DEFAULT_CATHODES];
let ELYTES = [...DEFAULT_ELYTES];
let FAMOUS = { ...DEFAULT_FAMOUS };
let SCENARIOS = [...DEFAULT_SCENARIOS];
let PRESETS = {
  builder: {
    label: "Battery Builder · In-Class Activity",
    desc: "5 design rounds · pick anode, cathode, electrolyte against client briefs",
    rounds: DEFAULT_SCENARIOS.map((s) => s.id),
  },
};

let HOST_TOKEN = null; // Stored in-memory per session

/**
 * Robust scenario resolver.
 * Handles string/number IDs, custom presets, direct array indexing, and fallbacks.
 */
function resolveRound(game, presetId) {
  if (!game || game.roundIdx == null || game.roundIdx < 0 || !Array.isArray(SCENARIOS) || SCENARIOS.length === 0) {
    return null;
  }
  const pid = game.presetId || presetId || "builder";
  const p = PRESETS[pid] || PRESETS["builder"] || Object.values(PRESETS)[0];
  const rId = p && p.rounds && p.rounds[game.roundIdx] !== undefined ? p.rounds[game.roundIdx] : null;

  if (rId != null) {
    const found = SCENARIOS.find((s) => String(s.id).trim() === String(rId).trim());
    if (found) return found;
  }

  // Fallback 1: Direct 0-indexed lookup
  if (SCENARIOS[game.roundIdx]) return SCENARIOS[game.roundIdx];

  // Fallback 2: 1-indexed scenario id matching
  const byIdx = SCENARIOS.find((s) => String(s.id).trim() === String(game.roundIdx + 1));
  if (byIdx) return byIdx;

  // Fallback 3: Return first scenario rather than null
  return SCENARIOS[0] || null;
}

/* ==========================================================================
   3. CSV PARSER & DYNAMIC DATA LOADERS
   ========================================================================== */

/**
 * Robust CSV parser that correctly handles quoted strings, commas, and newlines.
 */
function parseCSV(text) {
  const lines = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  const normalizedText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < normalizedText.length; i++) {
    const c = normalizedText[i];
    const next = normalizedText[i + 1];

    if (c === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      row.push(cell.trim());
      cell = "";
    } else if (c === '\n' && !inQuotes) {
      row.push(cell.trim());
      lines.push(row);
      row = [];
      cell = "";
    } else {
      cell += c;
    }
  }

  if (cell || row.length > 0) {
    row.push(cell.trim());
    lines.push(row);
  }

  if (lines.length === 0) return [];

  const headers = lines[0];
  const records = [];
  for (let l = 1; l < lines.length; l++) {
    const vals = lines[l];
    if (vals.length === 1 && vals[0] === "") continue; // Skip trailing empty lines
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = vals[idx] !== undefined ? vals[idx] : "";
    });
    records.push(obj);
  }
  return records;
}

/**
 * Dynamically loads electrochemistry materials from the backend API.
 */
async function loadMaterials() {
  try {
    const res = await api("get_materials", {});
    if (res && res.materials) {
      if (Array.isArray(res.materials.anodes) && res.materials.anodes.length > 0) ANODES = res.materials.anodes;
      if (Array.isArray(res.materials.cathodes) && res.materials.cathodes.length > 0) CATHODES = res.materials.cathodes;
      if (Array.isArray(res.materials.elytes) && res.materials.elytes.length > 0) ELYTES = res.materials.elytes;
      if (res.materials.famous && Object.keys(res.materials.famous).length > 0) FAMOUS = res.materials.famous;
    }
  } catch (err) {
    console.warn("Could not fetch materials from backend API:", err);
  }
}

/**
 * Dynamically loads scenarios from the backend API.
 * The backend strictly strips answers (best1, best2, reveal) unless authenticated as Lecturer.
 */
async function loadScenarios(token) {
  try {
    const res = await api("get_scenarios", { token: token || HOST_TOKEN });
    if (res && Array.isArray(res.scenarios) && res.scenarios.length > 0) {
      const loadedScenarios = res.scenarios.map((r) => {
        return {
          id: String(r.id || "").trim(),
          order: parseInt(r.order || r.id, 10) || 999,
          title: r.title || `Round ${r.id}`,
          brief: r.brief || "",
          image_file: (r.image_file || "").trim(),
          seconds: parseInt(r.seconds, 10) || 180,
          weights: {
            energy: parseFloat(r.weights?.energy) || 0,
            cost: parseFloat(r.weights?.cost) || 0,
            safety: parseFloat(r.weights?.safety) || 0,
            power: parseFloat(r.weights?.power) || 0,
            lifespan: parseFloat(r.weights?.lifespan) || 0,
          },
          requireRecharge: Boolean(r.requireRecharge),
          reveal: r.reveal || "",
          best1: (r.best1 || "").trim(),
          best2: (r.best2 || "").trim(),
          preset_label: r.preset_label || "Battery Builder",
          preset_desc: r.preset_desc || "design rounds: pick anode cathode electrolyte against client briefs",
        };
      });

      // Sort strictly by numeric identifier: id 1 shown first, then id 2, etc.
      loadedScenarios.sort((a, b) => a.order - b.order);
      SCENARIOS = loadedScenarios;

      // Define presets from scenarios
      const firstScenario = SCENARIOS[0] || {};
      PRESETS = {
        builder: {
          label: firstScenario.preset_label || "Battery Builder · In-Class Activity",
          desc: firstScenario.preset_desc || `${SCENARIOS.length} design rounds · pick anode, cathode, electrolyte against client briefs`,
          rounds: SCENARIOS.map((s) => s.id),
        },
      };
    }
  } catch (err) {
    console.error("Error loading scenarios from backend API:", err);
  }
}

/* ==========================================================================
   4. ELECTROCHEMISTRY PHYSICS ENGINE
   ========================================================================== */

/**
 * Builds and evaluates a galvanic cell given an anode, cathode, and electrolyte ID.
 * Returns thermodynamic potential, specific energy, safety, power, and compatibility notes.
 */
function buildCell(aId, cId, eId) {
  const a = ANODES.find((x) => x.id === aId);
  const c = CATHODES.find((x) => x.id === cId);
  const e = ELYTES.find((x) => x.id === eId);
  if (!a || !c || !e) return null;

  const fatal = [];
  const notes = [];

  // Compatibility checks
  if (!a.elytes.includes(eId)) fatal.push(`${a.name} is not stable in ${e.short} — pick a compatible electrolyte`);
  if (!c.elytes.includes(eId)) fatal.push(`${c.name} doesn't work in ${e.short}`);

  // Potential difference
  const V = c.E - a.E;
  if (V <= 0) fatal.push("Cell voltage ≤ 0 — cathode is less noble than anode. Swap them!");

  // Aqueous decomposition window check (theoretical water splitting window ≈ 1.23 V)
  const aqueous = eId !== "org";
  const pbException = aId === "pb" && cId === "pbo2";
  const znAlkaline = aId === "zn" && eId === "koh";

  if (aqueous && V > 2.20 && !pbException) {
    fatal.push(`${V.toFixed(2)} V in water — electrolyte splits into H₂/O₂ (window ≈ 1.23 V). Cell electrolyses itself.`);
  }

  let elysFactor = 1;
  if (aqueous && V > 1.4 && !fatal.length) {
    if (pbException) {
      notes.push("2.05 V in water?! High H₂ overpotential on lead makes this possible — kinetics beats thermodynamics.");
    } else if (znAlkaline) {
      notes.push("High H₂ overpotential on zinc prevents rapid water splitting at ~1.6 V in alkaline electrolyte.");
    } else {
      elysFactor = Math.max(0.6, 1 - (V - 1.4) * 0.5);
      notes.push("Above water's 1.23 V window — expect gassing and efficiency losses on charge.");
    }
  }

  // Active mass harmonic capacity: Q = (Q_a * Q_c) / (Q_a + Q_c)
  const Q = (a.Q * c.Q) / (a.Q + c.Q);
  const energy = V > 0 ? V * Q * elysFactor : 0; // Wh/kg of theoretical active material
  const cost = a.cost + c.cost + e.cost;

  // Rechargeability classification
  let rech = "yes";
  if (c.flags.noRecharge) {
    rech = "no";
    if (cId === "mno2") notes.push("Mn₂O₃ product detaches from electrode — non-rechargeable (Lecture 6).");
    if (cId === "ag2o") notes.push("Primary silver-oxide cell — exceptionally flat 1.55 V plateau for precision sensing.");
  } else if (c.flags.rechargePoor || a.flags.dendrite || c.flags.shuttle) {
    rech = "poor";
    if (c.flags.shuttle) notes.push("Polysulfide shuttle — capacity fades rapidly each cycle.");
    if (a.flags.dendrite && aId === "zn") notes.push("Zinc anode forms soluble zincate — dendrite risk and shape change on recharge.");
  }

  // Multi-attribute safety score out of 5
  let safety = 5;
  if (e.id === "org") {
    // Olivine LFP structure does not release O2, significantly mitigating solvent ignition risk
    const orgPenalty = c.flags.safeCathode ? 0.6 : 1.5;
    safety -= orgPenalty;
    notes.push(c.flags.safeCathode ? "Organic electrolyte, but olivine LFP resists thermal runaway." : "Flammable organic electrolyte.");
  }
  // Dendrite short-circuit is an electrodeposition hazard upon recharge; primary non-rechargeable cells do not cycle
  if (a.flags.dendrite && rech !== "no") {
    safety -= 1.5;
    notes.push("Metal anode — dendrite short-circuit risk on recharge.");
  }
  if (c.flags.runaway) { safety -= 1; notes.push("Layered-oxide cathode — thermal runaway risk (O₂ release when hot)."); }
  if (a.flags.toxic || c.flags.toxic) { safety -= 1.2; notes.push("Toxic heavy metals — environmental and disposal hazard."); }
  if (c.flags.corrosive) { safety -= 1; notes.push("Corrosive halogen cathode."); }
  safety = Math.max(0, safety);

  // Power capability rating (0.5 to 5.0)
  let power = e.power;
  if (a.flags.highRate) { power += 0.8; notes.push("Sintered electrode structure enables massive C-rate discharge."); }
  if (c.flags.airSlow) { power -= 1.5; notes.push("Air cathodes are slow — oxygen kinetics limit power."); }
  if (a.flags.rateLimited) { power -= 1.2; notes.push("Kinetic limits restrict continuous discharge rate."); }
  power = Math.max(0.5, Math.min(5, power));

  // Secondary cycle life (1.0 to 5.0)
  let cycleLife = 4.0;
  if (rech === "no") {
    cycleLife = 1.0;
  } else if (rech === "poor") {
    cycleLife = 2.0;
  } else {
    if (c.flags.safeCathode) cycleLife += 1.0; // 4000-8000 cycles for LFP
    if (a.flags.toxic || c.flags.toxic) cycleLife -= 0.4;
    if (e.id === "org") cycleLife -= 0.2;
  }
  cycleLife = Math.max(1, Math.min(5, cycleLife));

  // Primary calendar / shelf life (1.0 to 5.0) - measures stability in non-rechargeable service
  let shelfLife = 3.5;
  if (cId === "mno2" || cId === "ag2o") shelfLife = 4.8; // Hermetic primary cells: 5-10 year shelf life
  else if (c.flags.airSlow) shelfLife = 1.8; // Breathing pores cause dryout in 2-3 months once unsealed
  else if (aId === "cd" || aId === "mh" || aId === "fe") shelfLife = 2.0; // High aqueous self-discharge (15-30%/month)
  shelfLife = Math.max(1, Math.min(5, shelfLife));

  // Default display lifespan: depends on rechargeability
  const lifespan = rech === "no" ? shelfLife : cycleLife;

  // Real-world reference detection
  const famous = FAMOUS[`${aId}|${cId}|${eId}`] || null;

  return { a, c, e, viable: fatal.length === 0, fatal, notes, V, Q, energy, cost, safety, power, rech, lifespan, cycleLife, shelfLife, famous };
}

/**
 * Scores a cell design against a scenario's client weighting factors.
 */
function scoreCell(build, round) {
  if (!build || !build.viable) return 0;
  const isSecondary = round.requireRecharge;
  const effectiveLifespan = isSecondary ? (build.cycleLife || build.lifespan) : (build.shelfLife || build.lifespan);

  const n = {
    energy: Math.min(1, build.energy / 1200),
    cost: (10 - build.cost) / 7,
    safety: build.safety / 5,
    power: build.power / 5,
    lifespan: effectiveLifespan / 5,
  };
  const w = round.weights || {};
  let s = (w.energy || 0) * n.energy + (w.cost || 0) * n.cost + (w.safety || 0) * n.safety + (w.power || 0) * n.power;
  if (w.lifespan) s += w.lifespan * n.lifespan;
  let mult = 1;
  if (round.requireRecharge) {
    mult = build.rech === "yes" ? 1.0 : build.rech === "poor" ? 0.5 : 0.15;
  }
  return Math.round(1000 * s * mult);
}

/**
 * Scores a stored team submission.
 */
function scoreSubmission(sub, round) {
  if (!sub) return { pts: 0, summary: "no submission", chem: "no submission" };
  const b = buildCell(sub.aId, sub.cId, sub.eId);
  if (!b || !b.viable) return { pts: 0, summary: "non-viable cell", chem: "non-viable cell" };
  const chem = `${b.a.name} | ${b.e.short || b.e.name} | ${b.c.name}`;
  return {
    pts: scoreCell(b, round),
    summary: `${chem} — ${b.V.toFixed(2)} V · ${Math.round(b.energy)} Wh/kg`,
    chem,
    famous: b.famous,
  };
}

/* ==========================================================================
   5. API CLIENT & BACKEND SYNC
   ========================================================================== */

/**
 * Core JSON POST helper to Cloudflare Worker backend.
 */
async function api(op, body) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op, ...body }),
  });
  if (!res.ok) throw new Error("api " + res.status);
  return res.json();
}

async function hostAuth(password) {
  try {
    const r = await api("host_auth", { password });
    if (r && r.token) {
      HOST_TOKEN = r.token;
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

async function sGet(key) {
  try {
    const r = await api("get", { key });
    return r.value ? JSON.parse(r.value) : null;
  } catch (e) {
    console.warn("get failed for key:", key, e);
    return null;
  }
}

async function sSet(key, val) {
  try {
    await api("set", { key, value: JSON.stringify(val), token: HOST_TOKEN });
    return true;
  } catch (e) {
    console.warn("set failed for key:", key, e);
    return false;
  }
}

async function sList(prefix) {
  try {
    const r = await api("list", { prefix });
    return r.keys || [];
  } catch (e) {
    console.warn("list failed for prefix:", prefix, e);
    return [];
  }
}

function useInterval(fn, ms, active) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => ref.current(), ms);
    ref.current();
    return () => clearInterval(id);
  }, [ms, active]);
}

const randCode = () => {
  const A = "ABCDEFGHJKMNPQRSTUVWXYZ";
  return Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join("");
};

const randId = () => Math.random().toString(36).slice(2, 8);

function csvEscape(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCSV(rows) {
  return [CSV_COLS.join(",")].concat(rows.map((r) => CSV_COLS.map((c) => csvEscape(r[c])).join(","))).join("\n");
}

function toTraceCSV(rows) {
  return [TRACE_CSV_COLS.join(",")].concat(rows.map((r) => TRACE_CSV_COLS.map((c) => csvEscape(r[c])).join(","))).join("\n");
}

/* ==========================================================================
   6. UI COMPONENTS
   ========================================================================== */

function Eyebrow({ children, color }) {
  return <div className={`eyebrow ${color === T.volt ? "eyebrow-volt" : ""}`}>{children}</div>;
}

function Btn({ children, onClick, variant = "primary", disabled, style }) {
  const classNames = ["btn", `btn-${variant}`].join(" ");
  return (
    <button disabled={disabled} onClick={onClick} className={classNames} style={style}>
      {children}
    </button>
  );
}

function Shell({ children, wide }) {
  return (
    <div className="app-shell">
      <div className={`shell-inner ${wide ? "wide" : ""}`}>{children}</div>
    </div>
  );
}

function QRCodeDisplay({ code }) {
  const [svgHtml, setSvgHtml] = useState("");
  const joinUrl = `${window.location.origin}${window.location.pathname}?code=${code}#team`;

  useEffect(() => {
    try {
      if (typeof window.qrcode === "function") {
        const qr = window.qrcode(0, "M");
        qr.addData(joinUrl);
        qr.make();
        // Generate SVG string with cellSize 5, margin 2
        setSvgHtml(qr.createSvgTag(5, 2));
      }
    } catch (e) {
      console.warn("Could not generate QR code:", e);
    }
  }, [joinUrl]);

  return (
    <div className="lobby-qr-card">
      {svgHtml ? (
        <div className="lobby-qr-svg" dangerouslySetInnerHTML={{ __html: svgHtml }} />
      ) : (
        <div style={{ color: T.muted, fontSize: 13 }}>Scan URL on screen</div>
      )}
      <div className="lobby-qr-label">Scan to join with phone</div>
    </div>
  );
}

function CountdownBar({ startTs, seconds, big, paused = false, remaining = null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [paused]);

  const left = paused && remaining != null
    ? Math.max(0, remaining)
    : Math.max(0, seconds - (now - startTs) / 1000);
  const frac = Math.max(0, Math.min(1, left / seconds));
  const low = !paused && frac < 0.15;

  return (
    <div className="countdown-container">
      <div className={`countdown-track ${big ? "big" : ""} ${low ? "low" : ""} ${paused ? "paused" : ""}`} aria-label={`${Math.ceil(left)} seconds remaining`}>
        <div className={`countdown-fill ${low ? "low" : ""} ${paused ? "paused" : ""}`} style={{ width: `${frac * 100}%` }} />
      </div>
      <div className={`countdown-tip ${low ? "low" : ""}`} />
      <div className={`countdown-text ${big ? "big" : ""} ${low ? "low" : ""} ${paused ? "paused" : ""}`}>
        {paused ? "⏸ " : ""}{String(Math.floor(left / 60))}:{String(Math.ceil(left) % 60).padStart(2, "0")}
      </div>
    </div>
  );
}

function StatChip({ label, value, good }) {
  return (
    <div className="stat-chip">
      <div className={`stat-chip-val ${good === true ? "good" : good === false ? "bad" : ""}`}>{value}</div>
      <div className="stat-chip-lbl">{label}</div>
    </div>
  );
}

function WeightBars({ weights }) {
  const labels = {
    energy: "Energy (Wh/kg)",
    cost: "Cost",
    safety: "Safety",
    power: "Power",
    lifespan: "Lifespan",
  };
  return (
    <div className="weight-bars-stack">
      {Object.entries(weights || {}).filter(([_, w]) => w > 0).map(([k, w]) => (
        <div key={k} className="weight-bar-row">
          <span className="weight-bar-label">{labels[k] || k}</span>
          <div className="weight-bar-track">
            <div className="weight-bar-fill" style={{ width: `${Math.min(100, w * 100)}%` }} />
          </div>
          <span className="weight-bar-num">{Math.round(w * 100)}%</span>
        </div>
      ))}
    </div>
  );
}

function Leaderboard({ scores, highlightId, compact }) {
  const rows = Object.entries(scores || {}).map(([id, s]) => ({ id, ...s })).sort((a, b) => b.total - a.total);
  const max = Math.max(1, ...rows.map((r) => r.total));

  return (
    <div className={`leaderboard-list ${compact ? "compact" : ""}`}>
      {rows.map((r, i) => (
        <div key={r.id} className="leaderboard-row">
          <div className={`leaderboard-rank ${i === 0 ? "first" : ""}`}>{String(i + 1).padStart(2, "0")}</div>
          <div className="leaderboard-content">
            <div className="leaderboard-header">
              <div>
                <span className={`leaderboard-name ${r.id === highlightId ? "highlight" : ""}`}>
                  {r.name}{r.id === highlightId ? " · you" : ""}
                </span>
                {r.chem && <span className="leaderboard-subtext">· {r.chem}</span>}
              </div>
              <span className="leaderboard-pts">{r.total}</span>
            </div>
            <div className="leaderboard-bar-track">
              <div
                className={`leaderboard-bar-fill ${i === 0 ? "first" : ""}`}
                style={{ width: `${(r.total / max) * 100}%` }}
              />
            </div>
          </div>
        </div>
      ))}
      {rows.length === 0 && <div style={{ color: T.muted }}>No scores yet.</div>}
    </div>
  );
}

/**
 * Dynamically renders the scenario image from the filename in scenarios.csv.
 * No image names or paths are hardcoded.
 */
function ScenarioPhoto({ imageFile, title }) {
  const [imgError, setImgError] = useState(false);
  if (!imageFile || imgError) return null;

  return (
    <img
      src={IMG_BASE + imageFile}
      alt={title || "Scenario brief illustration"}
      className="scenario-img"
      onError={() => setImgError(true)}
    />
  );
}

/**
 * Interactive SVG schematic of a galvanic cell on discharge.
 */
function CellSchematic({ build, compact }) {
  const h = compact ? 150 : 190;
  if (!build) {
    return (
      <div style={{
        height: h, display: "flex", alignItems: "center", justifyContent: "center",
        border: `1.5px dashed ${T.line}`, borderRadius: 12, color: T.muted, fontSize: 13.5
      }}>
        Pick an anode, cathode, and electrolyte — cell schematic renders here.
      </div>
    );
  }

  const { a, c, e, V, viable } = build;
  const ELYTE_FILL = { koh: "#1E4A57", acid: "#573A1E", org: "#3E3357" };
  const ELYTE_LABEL = { koh: "OH⁻", acid: "H⁺", org: "Li⁺ / Na⁺" };
  const fill = ELYTE_FILL[e.id] || T.panelSoft;
  const dead = !viable;
  const ink = dead ? T.red : T.ink;

  return (
    <svg viewBox="0 0 320 190" style={{ width: "100%", height: h, display: "block" }}
      role="img" aria-label={`Cell schematic: ${a.name} anode, ${c.name} cathode, ${e.name}`}>
      {/* External circuit */}
      <path d="M69,58 L69,28 L251,28 L251,58" fill="none" stroke={ink} strokeWidth="2" />
      <rect x="142" y="18" width="36" height="20" rx="3" fill={T.panelSoft} stroke={ink} strokeWidth="2" />
      <text x="160" y="32" textAnchor="middle" fill={ink} fontSize="9" fontFamily="monospace">LOAD</text>
      {!dead && (
        <>
          <path d="M104,28 l10,-5 l0,10 z" fill={T.volt} />
          <text x="112" y="16" textAnchor="middle" fill={T.volt} fontSize="11" fontFamily="monospace">e⁻</text>
        </>
      )}

      {/* Electrode Polarities */}
      <text x="69" y="52" textAnchor="middle" fill={dead ? T.red : T.teal} fontSize="15" fontWeight="bold">−</text>
      <text x="251" y="52" textAnchor="middle" fill={dead ? T.red : T.volt} fontSize="15" fontWeight="bold">+</text>

      {/* Electrolyte bath */}
      <rect x="40" y="60" width="240" height="86" rx="6" fill={fill} stroke={T.line} strokeWidth="1.5" />

      {/* Porous separator */}
      <line x1="160" y1="64" x2="160" y2="142" stroke={T.muted} strokeWidth="1.5" strokeDasharray="4 4" />
      <text x="160" y="158" textAnchor="middle" fill={T.muted} fontSize="8.5">separator</text>

      {/* Anode & Cathode Electrodes */}
      <rect x="60" y="70" width="18" height="68" rx="2" fill={dead ? "#4A2A2A" : "#7C8AA8"} stroke={ink} strokeWidth="1.5" />
      <rect x="242" y="70" width="18" height="68" rx="2" fill={dead ? "#4A2A2A" : "#A8907C"} stroke={ink} strokeWidth="1.5" />

      {/* Internal ion migration */}
      {!dead && (
        <>
          {e.id === "koh" ? (
            <>
              {/* Anions (OH⁻) migrate from cathode (right) to anode (left) to balance external electron flow */}
              <path d="M136,104 l-12,-5 l0,10 z" fill={T.teal} opacity="0.9" />
              <text x="142" y="100" textAnchor="start" fill={T.teal} fontSize="9" fontFamily="monospace">
                OH⁻
              </text>
            </>
          ) : (
            <>
              {/* Cations (H⁺, Li⁺, Na⁺) migrate from anode (left) to cathode (right) */}
              <path d="M118,104 l12,-5 l0,10 z" fill={T.teal} opacity="0.9" />
              <text x="112" y="100" textAnchor="end" fill={T.teal} fontSize="9" fontFamily="monospace">
                {ELYTE_LABEL[e.id] || ""}
              </text>
            </>
          )}
        </>
      )}


      {/* Labels */}
      <text x="69" y="176" textAnchor="middle" fill={T.ink} fontSize="10.5" fontWeight="600">{a.name}</text>
      <text x="69" y="186" textAnchor="middle" fill={T.muted} fontSize="8.5">anode · oxidised</text>
      <text x="251" y="176" textAnchor="middle" fill={T.ink} fontSize="10.5" fontWeight="600">{c.name}</text>
      <text x="251" y="186" textAnchor="middle" fill={T.muted} fontSize="8.5">cathode · reduced</text>

      {/* Voltage readout */}
      <text x="160" y="100" textAnchor="middle" fill={dead ? T.red : T.volt} fontSize="21" fontWeight="bold" fontFamily="monospace">
        {dead ? "✕" : V.toFixed(2) + " V"}
      </text>
      <text x="160" y="118" textAnchor="middle" fill={T.muted} fontSize="8.5">{dead ? "not viable" : e.short}</text>
    </svg>
  );
}

function MaterialGrid({ items, selected, onPick, kind }) {
  return (
    <div className="material-grid">
      {items.map((m) => {
        const on = selected === m.id;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onPick(m.id)}
            className={`material-card ${on ? "active" : ""}`}
          >
            <div className="material-title">{m.name}</div>
            <div className="material-stats">
              {kind === "elyte"
                ? `power ${m.power}/5 · ${"$".repeat(m.cost)}`
                : `${m.E > 0 ? "+" : ""}${m.E.toFixed(2)} V · ${m.Q} mAh/g · ${"$".repeat(m.cost)}`}
            </div>
            <div className="material-tag">{m.tag || m.short}</div>
          </button>
        );
      })}
    </div>
  );
}

function CellDesigner({ round, onSubmit, submitted, onTrace }) {
  const [aId, setA] = useState(null);
  const [cId, setC] = useState(null);
  const [eId, setE] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const tried = useRef(new Set());

  useEffect(() => {
    if (aId && cId && eId) tried.current.add(`${aId}|${cId}|${eId}`);
  }, [aId, cId, eId]);

  const build = aId && cId && eId ? buildCell(aId, cId, eId) : null;
  const preview = build && build.viable ? scoreCell(build, round) : null;

  const handlePickAnode = (id) => {
    setA(id);
    if (onTrace) onTrace("pick_anode", "anode", id, id, cId, eId);
  };

  const handlePickCathode = (id) => {
    setC(id);
    if (onTrace) onTrace("pick_cathode", "cathode", id, aId, id, eId);
  };

  const handlePickElyte = (id) => {
    setE(id);
    if (onTrace) onTrace("pick_elyte", "elyte", id, aId, cId, id);
  };

  const handleSubmit = () => {
    if (!build || !build.viable || submitted) return;
    if (onTrace) onTrace("submit_design", "cell", `${aId}|${cId}|${eId}`, aId, cId, eId);
    onSubmit({ kind: "cell", aId, cId, eId, tries: tried.current.size });
  };

  const toggleSheet = () => {
    setSheetOpen((prev) => {
      const next = !prev;
      if (onTrace) onTrace(next ? "open_drawer" : "close_drawer", "ui", next ? "expanded" : "collapsed", aId, cId, eId);
      return next;
    });
  };

  return (
    <div className="cell-designer-container">
      <Eyebrow>1 · Anode (oxidised on discharge)</Eyebrow>
      <MaterialGrid items={ANODES} selected={aId} onPick={handlePickAnode} kind="anode" />
      <div style={{ height: 16 }} />

      <Eyebrow>2 · Cathode (reduced on discharge)</Eyebrow>
      <MaterialGrid items={CATHODES} selected={cId} onPick={handlePickCathode} kind="cathode" />
      <div style={{ height: 16 }} />

      <Eyebrow>3 · Electrolyte</Eyebrow>
      <MaterialGrid items={ELYTES} selected={eId} onPick={handlePickElyte} kind="elyte" />

      <div className="designer-dock">
        {/* Mobile quick-bar (collapsed summary) */}
        <div className="dock-mobile-bar" onClick={toggleSheet}>
          <div className="dock-summary">
            {build ? (
              <>
                <div className="dock-metric">
                  {build.viable ? `${build.V.toFixed(2)} V · ${Math.round(build.energy)} Wh/kg` : "Non-viable cell ⚠️"}
                </div>
                {build.viable && preview !== null && (
                  <div className="dock-submetric">Score Est.: {preview} pts</div>
                )}
              </>
            ) : (
              <div className="dock-metric" style={{ color: T.muted }}>Tap to view schematic & stats</div>
            )}
          </div>
          <button type="button" className="dock-toggle-btn" onClick={(e) => { e.stopPropagation(); toggleSheet(); }}>
            {sheetOpen ? "Hide Details ▼" : "View Details ▲"}
          </button>
        </div>

        {/* Full Details & Schematic */}
        <div className={`dock-sheet-body ${sheetOpen ? "" : "collapsed"}`}>
          <CellSchematic build={build} compact />
          {build ? (
            <>
              {build.fatal.map((f, i) => (
                <div key={i} style={{ color: T.red, fontSize: 14, fontWeight: 600, marginBottom: 6 }}>⚠ {f}</div>
              ))}
              {build.viable && (
                <>
                  <div className="chip-grid">
                    <StatChip
                      label="Score Est."
                      value={`${preview !== null ? preview : 0} pts`}
                      good={preview !== null && preview >= 700 ? true : preview !== null && preview < 400 ? false : undefined}
                    />
                    <StatChip label="Cell voltage" value={`${build.V.toFixed(2)} V`} />
                    <StatChip label="Wh/kg (active)" value={Math.round(build.energy)} />
                    <StatChip label="Cost" value={"$".repeat(build.cost > 6 ? 3 : build.cost > 4 ? 2 : 1) + ` (${build.cost}/10)`} />
                    <StatChip label="Safety" value={`${build.safety.toFixed(1)}/5`} good={build.safety >= 3.5 ? true : build.safety < 2 ? false : undefined} />
                    <StatChip label="Power" value={`${build.power.toFixed(1)}/5`} />
                    <StatChip
                      label={round.requireRecharge ? "Cycle life" : "Shelf life"}
                      value={`${(round.requireRecharge ? build.cycleLife : build.shelfLife).toFixed(1)}/5`}
                      good={(round.requireRecharge ? build.cycleLife : build.shelfLife) >= 3.5 ? true : (round.requireRecharge ? build.cycleLife : build.shelfLife) < 2 ? false : undefined}
                    />
                    <StatChip label="Rechargeable" value={build.rech} good={round.requireRecharge ? build.rech === "yes" : undefined} />
                  </div>
                  {build.famous && <div style={{ color: T.volt, fontSize: 14, fontWeight: 600, marginBottom: 6 }}>★ You built {build.famous}</div>}
                  {build.notes.slice(0, 3).map((n, i) => (
                    <div key={i} style={{ color: T.muted, fontSize: 12.5, marginBottom: 3 }}>· {n}</div>
                  ))}
                </>
              )}
            </>
          ) : (
            <div style={{ color: T.muted, fontSize: 14, marginBottom: 8 }}>
              Pick one of each — live physical and electrochemical stats appear here as you tinker.
            </div>
          )}

          <Btn
            style={{ width: "100%", marginTop: 10 }}
            disabled={!build || !build.viable || submitted}
            onClick={handleSubmit}
          >
            {submitted ? "Design locked in 🔒" : preview !== null ? `Submit Design · Est. ${preview} pts` : "Submit"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   7. LANDING PAGE
   ========================================================================== */

function Landing({ onTeam }) {
  return (
    <Shell>
      <div style={{ textAlign: "center", paddingTop: 48 }}>
        <Eyebrow>GSOE9111 / ENGG4111 · Energy Storage</Eyebrow>
        <h1 className="page-title">
          Energy Storage<br /><span style={{ color: T.volt }}>Consultancy</span>
        </h1>
        <p className="page-subtitle">
          Your team is the design consultancy.<br />The client brief is on the screen. Build.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 40 }}>
          <Btn onClick={onTeam}>Join as a team</Btn>
        </div>
      </div>
    </Shell>
  );
}

/* ==========================================================================
   8. HOST VIEW (Lecturer screen on projector)
   ========================================================================== */

function HostApp({ session, onUpdateSession, onEndSession }) {
  const [code, setCode] = useState(session && session.code ? session.code : null);
  const [presetId, setPresetId] = useState(session && session.presetId ? session.presetId : null);
  const [game, setGame] = useState(null);
  const [teams, setTeams] = useState({});
  const [scores, setScores] = useState({});
  const [subCount, setSubCount] = useState(0);
  const [showcase, setShowcase] = useState(null);
  const [busy, setBusy] = useState(false);
  const [csvText, setCsvText] = useState(null);
  const [csvNote, setCsvNote] = useState("");
  const [traceCsvText, setTraceCsvText] = useState(null);
  const [traceCsvNote, setTraceCsvNote] = useState("");
  const [logged, setLogged] = useState(0);
  const [authed, setAuthed] = useState(!!(session && session.authed));
  const [pw, setPw] = useState("");
  const [authErr, setAuthErr] = useState("");
  const [uploadMsg, setUploadMsg] = useState("");
  const scenarioFileRef = useRef(null);
  const materialFileRef = useRef(null);

  const handleUploadCSV = (e, kind) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setBusy(true);
    setUploadMsg(`Uploading ${file.name} to Cloudflare D1...`);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target.result;
        const res = await api("upload_csv", { token: HOST_TOKEN, kind, content: text });
        if (res && res.ok) {
          if (kind === "scenarios") await loadScenarios(HOST_TOKEN);
          else await loadMaterials();
          setUploadMsg(`✓ Successfully uploaded ${file.name} (${(file.size / 1024).toFixed(1)} KB) to Cloudflare D1!`);
        } else {
          setUploadMsg(`Upload failed: ${res.error || "Unknown server error"}`);
        }
      } catch (err) {
        setUploadMsg(`Upload error: ${err.message}`);
      }
      setBusy(false);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  if (session && session.hostToken) {
    HOST_TOKEN = session.hostToken;
  }

  const preset = presetId ? PRESETS[presetId] : (PRESETS["builder"] || Object.values(PRESETS)[0]);
  const round = resolveRound(game, presetId);

  useEffect(() => {
    if (authed && HOST_TOKEN) {
      loadScenarios(HOST_TOKEN);
    }
  }, [authed]);

  useEffect(() => {
    if (code && authed) {
      sGet(K(code, "state")).then((st) => {
        if (st) {
          setGame(st);
          if (st.presetId) setPresetId(st.presetId);
        }
      });
      sGet(K(code, "scores")).then((sc) => {
        if (sc) setScores(sc);
      });
    }
  }, [code, authed]);

  const createGame = async (pid) => {
    setBusy(true);
    const c = randCode();
    const state = { phase: "lobby", roundIdx: -1, presetId: pid, startTs: 0 };
    if (await sSet(K(c, "state"), state)) {
      await sSet(K(c, "scores"), {});
      setCode(c);
      setPresetId(pid);
      setGame(state);
      setScores({});
      onUpdateSession({ mode: "host", authed: true, hostToken: HOST_TOKEN, code: c, presetId: pid });
    }
    setBusy(false);
  };

  // Lobby polling for connected teams
  useInterval(async () => {
    const keys = await sList(K(code, "team") + "-");
    const teamVals = await Promise.all(keys.map((k) => sGet(k)));
    const t = {};
    keys.forEach((key, idx) => {
      const v = teamVals[idx];
      if (v) t[key.split("-").pop()] = v;
    });
    setTeams(t);
  }, 3000, !!code && game && game.phase === "lobby");

  // In-round polling for submissions
  useInterval(async () => {
    const keys = await sList(K(code, "sub", game.roundIdx) + "-");
    setSubCount(keys.length);
  }, 3000, !!code && game && game.phase === "question");

  const setPhase = async (next) => {
    await sSet(K(code, "state"), next);
    setGame(next);
  };

  const startRound = async (idx) => {
    setBusy(true);
    setSubCount(0);
    setShowcase(null);
    await setPhase({ phase: "question", roundIdx: idx, presetId, startTs: Date.now(), paused: false, remaining: null });
    setBusy(false);
  };

  const togglePause = async () => {
    if (!game || game.phase !== "question" || !round) return;
    setBusy(true);
    if (!game.paused) {
      const left = Math.max(0, round.seconds - (Date.now() - game.startTs) / 1000);
      const nextState = { ...game, paused: true, remaining: Math.round(left) };
      await setPhase(nextState);
    } else {
      const rem = game.remaining != null ? game.remaining : round.seconds;
      const newStartTs = Date.now() - (round.seconds - rem) * 1000;
      const nextState = { ...game, paused: false, remaining: null, startTs: newStartTs };
      await setPhase(nextState);
    }
    setBusy(false);
  };

  const reveal = async () => {
    setBusy(true);
    const keys = await sList(K(code, "sub", game.roundIdx) + "-");
    const newScores = { ...scores };
    for (const [tid, tv] of Object.entries(teams)) {
      if (!newScores[tid]) newScores[tid] = { name: tv.name, total: 0, last: 0 };
    }

    const subs = await Promise.all(keys.map((k) => sGet(k)));
    const scoredList = [];
    keys.forEach((key, idx) => {
      const sub = subs[idx];
      if (!sub) return;
      const tid = key.split("-").pop();
      const res = scoreSubmission(sub, round);
      if (!newScores[tid]) newScores[tid] = { name: sub.name || "Team", total: 0, last: 0 };
      newScores[tid].total += res.pts;
      newScores[tid].last = res.pts;
      newScores[tid].chem = res.chem || res.summary;
      scoredList.push({ ...res, team: newScores[tid].name, design: sub });
    });

    let best = null;
    let runnerUp = null;

    const getOptionFromSpec = (spec) => {
      if (!spec || typeof spec !== "string") return null;
      const parts = spec.split("|").map((p) => p.trim().toLowerCase());
      if (parts.length === 3) {
        let [p1, p2, p3] = parts;
        let aId = null, cId = null, eId = null;

        if (ANODES.some((a) => a.id === p1) && CATHODES.some((c) => c.id === p2) && ELYTES.some((e) => e.id === p3)) {
          aId = p1; cId = p2; eId = p3;
        } else if (ANODES.some((a) => a.id === p1) && ELYTES.some((e) => e.id === p2) && CATHODES.some((c) => c.id === p3)) {
          aId = p1; eId = p2; cId = p3;
        } else {
          aId = ANODES.find((a) => a.id === p1 || a.id === p2 || a.id === p3)?.id;
          cId = CATHODES.find((c) => c.id === p1 || c.id === p2 || c.id === p3)?.id;
          eId = ELYTES.find((e) => e.id === p1 || e.id === p2 || e.id === p3)?.id;
        }

        if (aId && cId && eId) {
          const b = buildCell(aId, cId, eId);
          if (b && b.viable) {
            const pts = scoreCell(b, round);
            const matchingTeams = scoredList.filter((s) => s.design && s.design.aId === aId && s.design.cId === cId && s.design.eId === eId).map((s) => s.team);
            return {
              pts,
              summary: `${b.a.name} | ${b.e.short || b.e.name} | ${b.c.name} — ${b.V.toFixed(2)} V · ${Math.round(b.energy)} Wh/kg`,
              famous: b.famous,
              team: matchingTeams.length > 0 ? `Picked by ${matchingTeams.join(", ")}` : null,
              design: { kind: "cell", aId, cId, eId },
            };
          }
        }
      }
      return null;
    };

    if (round.best1) best = getOptionFromSpec(round.best1);
    if (round.best2) runnerUp = getOptionFromSpec(round.best2);

    if (!best || !runnerUp) {
      const allOptions = [];
      ANODES.forEach((a) => {
        CATHODES.forEach((c) => {
          ELYTES.forEach((e) => {
            const b = buildCell(a.id, c.id, e.id);
            if (b && b.viable) {
              const pts = scoreCell(b, round);
              const matchingTeams = scoredList.filter((s) => s.design && s.design.aId === a.id && s.design.cId === c.id && s.design.eId === e.id).map((s) => s.team);
              allOptions.push({
                pts,
                summary: `${b.a.name} | ${b.e.short || b.e.name} | ${b.c.name} — ${b.V.toFixed(2)} V · ${Math.round(b.energy)} Wh/kg`,
                famous: b.famous,
                team: matchingTeams.length > 0 ? `Picked by ${matchingTeams.join(", ")}` : null,
                design: { kind: "cell", aId: a.id, cId: c.id, eId: e.id },
              });
            }
          });
        });
      });
      allOptions.sort((x, y) => y.pts - x.pts);
      if (!best && allOptions[0]) best = allOptions[0];
      if (!runnerUp && allOptions[1]) runnerUp = allOptions[1];
    }

    const showcaseData = { ...(best || {}), best, runnerUp };
    setScores(newScores);
    setShowcase(showcaseData);
    await sSet(K(code, "scores"), newScores);
    await sSet(K(code, "showcase", game.roundIdx), showcaseData);
    await setPhase({ phase: "reveal", roundIdx: game.roundIdx, presetId, startTs: 0 });
    logRound(game.roundIdx).catch(() => {});
    setBusy(false);
  };

  const rowsForRound = async (i) => {
    const rid = preset.rounds[i];
    const rd = SCENARIOS.find((s) => s.id === rid);
    if (!rd) return [];
    const rows = [];
    const keys = await sList(K(code, "sub", i) + "-");
    const subs = await Promise.all(keys.map((k) => sGet(k)));

    keys.forEach((key, idx) => {
      const sub = subs[idx];
      if (!sub) return;
      const tid = key.split("-").pop();
      const res = scoreSubmission(sub, rd);
      const b = buildCell(sub.aId, sub.cId, sub.eId);

      const row = {
        session_code: code,
        round_id: rid,
        round_title: rd.title,
        team_name: sub.name || (teams[tid] && teams[tid].name) || "",
        team_id: tid,
        seconds_to_submit: sub.elapsed != null ? Math.round(sub.elapsed) : "",
        design_iterations: sub.tries != null ? sub.tries : "",
        points: res.pts,
        anode: b ? b.a.name : "",
        cathode: b ? b.c.name : "",
        electrolyte: b ? b.e.name : "",
        cell_voltage_V: b ? b.V.toFixed(3) : "",
        energy_Wh_per_kg: b ? Math.round(b.energy) : "",
        cost_index: b ? b.cost : "",
        safety_of_5: b ? b.safety.toFixed(1) : "",
        power_of_5: b ? b.power.toFixed(1) : "",
        rechargeable: b ? b.rech : "",
        viable: b && b.viable ? "yes" : "no",
        famous_cell: res.famous || "",
        design_summary: res.summary,
      };
      rows.push(row);
    });
    return rows;
  };

  const logRound = async (i) => {
    const rows = await rowsForRound(i);
    if (!rows.length) return;
    try {
      await api("log", { cols: CSV_COLS, rows, token: HOST_TOKEN });
      setLogged((n) => n + rows.length);
    } catch (e) {
      console.warn("CSV log to backend failed:", e);
    }
  };

  const next = async () => {
    if (game.roundIdx + 1 >= preset.rounds.length) {
      await setPhase({ phase: "final", roundIdx: game.roundIdx, presetId, startTs: 0 });
    } else {
      await startRound(game.roundIdx + 1);
    }
  };

  const exportCSV = async () => {
    setBusy(true);
    let rows = [];
    for (let i = 0; i < preset.rounds.length; i++) {
      rows = rows.concat(await rowsForRound(i));
    }
    rows.sort((a, b) => Number(a.round_id) - Number(b.round_id) || b.points - a.points);
    const csv = toCSV(rows);
    setCsvText(csv);
    try {
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `energy-storage-course-activities-${code}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setCsvNote(`${rows.length} submissions exported. If no download appeared, copy the text below.`);
    } catch (e) {
      setCsvNote(`${rows.length} submissions found. Download was blocked — copy the text below into a .csv file.`);
    }
    setBusy(false);
  };

  const exportClickstreamCSV = async () => {
    setBusy(true);
    let allClicks = [];

    // 1. First attempt direct query from D1 results_log via export_log
    try {
      const res = await api("export_log", { session_code: code });
      if (res && Array.isArray(res.rows) && res.rows.length > 0) {
        res.rows.forEach((r) => {
          try {
            const parsed = typeof r.data_json === "string" ? JSON.parse(r.data_json) : r.data_json;
            if (parsed && (parsed.event_type || parsed.event_seq)) allClicks.push(parsed);
          } catch (e) {}
        });
      }
    } catch (e) {
      console.warn("Backend export_log query failed, using live_session_store trace keys:", e);
    }

    // 2. If D1 returned empty, fallback to live_session_store trace keys
    if (allClicks.length === 0) {
      for (let i = 0; i < preset.rounds.length; i++) {
        const keys = await sList(K(code, "trace", i) + "-");
        const traces = await Promise.all(keys.map((k) => sGet(k)));
        traces.forEach((t) => {
          if (Array.isArray(t)) allClicks = allClicks.concat(t);
        });
      }
    }

    allClicks.sort((a, b) => Number(a.round_id) - Number(b.round_id) || (a.team_name || "").localeCompare(b.team_name || "") || Number(a.event_seq) - Number(b.event_seq));
    const csv = toTraceCSV(allClicks);
    setTraceCsvText(csv);
    try {
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `energy-storage-course-activities-${code}-clickstream-trace-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setTraceCsvNote(`${allClicks.length} telemetry clicks exported. If download was blocked, copy the text below.`);
    } catch (e) {
      setTraceCsvNote(`${allClicks.length} telemetry clicks found. Download blocked — copy the text below into a .csv file.`);
    }
    setBusy(false);
  };

  const tryAuth = async () => {
    setBusy(true);
    setAuthErr("");
    try {
      if (await hostAuth(pw)) {
        await loadScenarios(HOST_TOKEN);
        setAuthed(true);
        onUpdateSession({ mode: "host", authed: true, hostToken: HOST_TOKEN, code, presetId });
      } else {
        setAuthErr("That password was not accepted.");
      }
    } catch (e) {
      setAuthErr("Could not reach the server — check your connection.");
    }
    setBusy(false);
  };

  // Screen 1: Password Authenticator
  if (!authed) {
    return (
      <Shell>
        <div style={{ paddingTop: 40 }}>
          <Eyebrow>Lecturer access</Eyebrow>
          <h2 style={{ fontFamily: T.display, fontSize: 30, marginBottom: 8 }}>Password required</h2>
          <p style={{ color: T.muted, fontSize: 15, marginBottom: 22 }}>
            Checked securely against the Cloudflare Worker backend.
          </p>
          <input
            type="password"
            value={pw}
            autoFocus
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && pw) tryAuth(); }}
            placeholder="Lecturer password"
            className="form-input"
            style={{ marginBottom: 14 }}
          />
          {authErr && <div style={{ color: T.red, marginBottom: 14, fontSize: 14.5 }}>{authErr}</div>}
          <Btn onClick={tryAuth} disabled={busy || !pw} style={{ width: "100%" }}>
            {busy ? "Checking…" : "Unlock"}
          </Btn>
          <div style={{ marginTop: 16, textAlign: "center" }}>
            <button type="button" onClick={onEndSession} style={{ color: T.muted, fontSize: 15 }}>
              ← Return to Main Menu
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  // Screen 2: Session Picker
  if (!code) {
    return (
      <Shell>
        <Eyebrow>Host setup</Eyebrow>
        <h2 style={{ fontFamily: T.display, fontSize: 34, marginBottom: 8 }}>Launch In-Class Activity</h2>
        <p style={{ color: T.muted, marginBottom: 28 }}>
          Each design round runs ~5 minutes plus your debrief.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {Object.entries(PRESETS).map(([id, p]) => (
            <button
              key={id}
              type="button"
              disabled={busy}
              onClick={() => createGame(id)}
              style={{
                textAlign: "left", background: T.panel, border: `2px solid ${T.line}`,
                borderRadius: 12, padding: "18px 20px", color: T.ink, cursor: "pointer",
              }}
            >
              <div style={{ fontFamily: T.display, fontWeight: 700, fontSize: 20 }}>{p.label}</div>
              <div style={{ color: T.muted, fontSize: 14, marginTop: 4 }}>{p.desc}</div>
              <div style={{ color: T.teal, fontSize: 13, marginTop: 8, fontFamily: T.mono }}>
                Scenarios loaded: {SCENARIOS.map((s) => s.order).join(" → ")}
              </div>
            </button>
          ))}
        </div>

        <div style={{ marginTop: 24, padding: "18px 20px", background: T.panelSoft, border: `1.5px solid ${T.line}`, borderRadius: 12 }}>
          <div style={{ fontFamily: T.display, fontWeight: 700, fontSize: 16, marginBottom: 6, color: T.volt }}>
            📂 Cloudflare D1 Course Data Management
          </div>
          <p style={{ color: T.muted, fontSize: 13.5, marginBottom: 14 }}>
            Update scenarios or materials anytime without touching code. Uploaded CSVs are stored securely in Cloudflare D1.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              type="file"
              accept=".csv"
              ref={scenarioFileRef}
              style={{ display: "none" }}
              onChange={(e) => handleUploadCSV(e, "scenarios")}
            />
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => scenarioFileRef.current && scenarioFileRef.current.click()}
              style={{ fontSize: 13, padding: "8px 14px", background: T.panel, border: `1px solid ${T.line}`, color: T.ink, cursor: "pointer", borderRadius: 8 }}
            >
              📄 Upload scenarios.csv
            </button>

            <input
              type="file"
              accept=".csv"
              ref={materialFileRef}
              style={{ display: "none" }}
              onChange={(e) => handleUploadCSV(e, "materials")}
            />
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => materialFileRef.current && materialFileRef.current.click()}
              style={{ fontSize: 13, padding: "8px 14px", background: T.panel, border: `1px solid ${T.line}`, color: T.ink, cursor: "pointer", borderRadius: 8 }}
            >
              🔬 Upload materials.csv
            </button>
          </div>
          {uploadMsg && (
            <div style={{ marginTop: 10, fontSize: 13.5, color: uploadMsg.startsWith("✓") ? T.teal : T.red }}>
              {uploadMsg}
            </div>
          )}
        </div>

        <div style={{ marginTop: 24 }}>
          <Btn variant="ghost" onClick={onEndSession}>← Main Menu</Btn>
        </div>
      </Shell>
    );
  }

  // Screen 3: Lobby
  if (game && game.phase === "lobby") {
    return (
      <Shell wide>
        <div style={{ textAlign: "center", paddingTop: 24 }}>
          <Eyebrow>{preset ? preset.label : ""}</Eyebrow>
          <div style={{ color: T.muted, fontSize: 20 }}>Join at this page with code</div>
          <div style={{ fontFamily: T.mono, fontSize: 110, fontWeight: 600, color: T.volt, letterSpacing: "0.12em", margin: "8px 0 16px" }}>
            {code}
          </div>

          <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
            <QRCodeDisplay code={code} />
          </div>

          <div style={{ fontFamily: T.display, fontSize: 22, marginBottom: 16 }}>
            {Object.keys(teams).length} team{Object.keys(teams).length === 1 ? "" : "s"} connected
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", marginBottom: 36, minHeight: 40 }}>
            {Object.values(teams).map((t, i) => (
              <span key={i} style={{ background: T.panelSoft, border: `1.5px solid ${T.line}`, borderRadius: 999, padding: "8px 18px", fontWeight: 600 }}>
                {t.name}
              </span>
            ))}
          </div>
          <Btn disabled={busy} onClick={() => startRound(0)} style={{ fontSize: 22, padding: "18px 44px" }}>
            Start Round 1
          </Btn>
        </div>
      </Shell>
    );
  }

  // Screen 4: Active Question / Brief
  if (game && game.phase === "question") {
    if (!round) {
      return (
        <Shell wide>
          <div style={{ textAlign: "center", paddingTop: 60 }}>
            <Eyebrow>Round {(game.roundIdx >= 0 ? game.roundIdx : 0) + 1}</Eyebrow>
            <p style={{ color: T.muted, marginTop: 18, fontSize: 17, animation: "pulseVolt 2s infinite" }}>
              Loading scenario brief…
            </p>
          </div>
        </Shell>
      );
    }
    return (
      <Shell wide>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
          <Eyebrow>{round.title} · {game.roundIdx + 1} of {preset ? preset.rounds.length : 0}</Eyebrow>
          <span style={{ fontFamily: T.mono, color: T.muted }}>
            code {code} · {subCount}/{Object.keys(teams).length || "?"} submitted
          </span>
        </div>

        <div className="countdown-header">
          <button
            type="button"
            onClick={togglePause}
            disabled={busy}
            className={`btn-pause ${game.paused ? "is-paused" : ""}`}
            title="Pause or resume timer for students"
          >
            {game.paused ? "▶ Resume Timer" : "⏸ Pause Timer"}
          </button>
          {game.paused && <span className="pause-badge">TIMER PAUSED</span>}
        </div>

        <CountdownBar
          startTs={game.startTs}
          seconds={round.seconds}
          big
          paused={game.paused}
          remaining={game.remaining}
        />
        <h2 style={{ fontFamily: T.display, fontSize: 30, lineHeight: 1.3, margin: "30px 0 18px" }}>CLIENT BRIEF</h2>

        <div className="scenario-card">
          <ScenarioPhoto imageFile={round.image_file} title={round.title} />
          <p className="scenario-brief">{round.brief}</p>
        </div>

        <div style={{ marginTop: 24, maxWidth: 560 }}>
          <Eyebrow>What the client is paying for</Eyebrow>
          <WeightBars weights={round.weights} />
          {round.requireRecharge && <div style={{ color: T.volt, fontSize: 15, marginTop: 8, fontWeight: 600 }}>⚡ Must be rechargeable</div>}
        </div>

        <div style={{ marginTop: 34 }}>
          <Btn onClick={reveal} disabled={busy} variant="teal">
            Close submissions & reveal
          </Btn>
        </div>
      </Shell>
    );
  }

  // Screen 5: Round Debrief & Reveal
  if (game && game.phase === "reveal") {
    if (!round) {
      return (
        <Shell wide>
          <div style={{ textAlign: "center", paddingTop: 60 }}>
            <Eyebrow color={T.volt}>Round {(game.roundIdx >= 0 ? game.roundIdx : 0) + 1} · Results</Eyebrow>
            <p style={{ color: T.muted, marginTop: 18, fontSize: 17, animation: "pulseVolt 2s infinite" }}>
              Loading round debrief…
            </p>
          </div>
        </Shell>
      );
    }
    const best = showcase ? (showcase.best || (showcase.team ? showcase : null)) : null;
    const runnerUp = showcase ? showcase.runnerUp : null;

    return (
      <Shell wide>
        <Eyebrow color={T.volt}>{round.title} · results</Eyebrow>
        <div style={{ display: "grid", gridTemplateColumns: runnerUp && runnerUp.summary ? "repeat(auto-fit, minmax(380px, 1fr))" : "1fr", gap: 20, marginBottom: 24 }}>
          {best && (best.team || best.summary) && (
            <div style={{ background: T.panel, border: `2px solid ${T.volt}`, borderRadius: 14, padding: "18px 22px" }}>
              <div style={{ fontFamily: T.mono, fontSize: 13, letterSpacing: "0.15em", color: T.volt, marginBottom: 6 }}>
                {best.team ? `🥇 1st BEST DESIGN · ${best.team}` : "🎯 1st BENCHMARK OPTIMAL CHEMISTRY"} {best.pts ? `· ${best.pts} pts` : ""}
              </div>
              <div style={{ fontFamily: T.display, fontSize: 22, fontWeight: 700 }}>{best.summary}</div>
              {best.famous && <div style={{ color: T.teal, marginTop: 6, fontSize: 15 }}>★ aka {best.famous}</div>}
              {best.design && (
                <div style={{ marginTop: 14 }}>
                  <CellSchematic build={buildCell(best.design.aId, best.design.cId, best.design.eId)} />
                </div>
              )}
            </div>
          )}

          {runnerUp && runnerUp.summary && (
            <div style={{ background: T.panel, border: `2px solid ${T.teal}`, borderRadius: 14, padding: "18px 22px" }}>
              <div style={{ fontFamily: T.mono, fontSize: 13, letterSpacing: "0.15em", color: T.teal, marginBottom: 6 }}>
                {runnerUp.team ? `🥈 2nd BEST DESIGN · ${runnerUp.team}` : "🎯 2nd BENCHMARK OPTIMAL CHEMISTRY"} {runnerUp.pts ? `· ${runnerUp.pts} pts` : ""}
              </div>
              <div style={{ fontFamily: T.display, fontSize: 22, fontWeight: 700 }}>{runnerUp.summary}</div>
              {runnerUp.famous && <div style={{ color: T.teal, marginTop: 6, fontSize: 15 }}>★ aka {runnerUp.famous}</div>}
              {runnerUp.design && (
                <div style={{ marginTop: 14 }}>
                  <CellSchematic build={buildCell(runnerUp.design.aId, runnerUp.design.cId, runnerUp.design.eId)} />
                </div>
              )}
            </div>
          )}
        </div>

        {round.reveal ? (
          <p style={{ fontSize: 19, lineHeight: 1.55, background: T.panel, border: `1.5px solid ${T.line}`, borderRadius: 12, padding: "18px 22px", marginBottom: 26 }}>
            {round.reveal}
          </p>
        ) : null}

        <Eyebrow>Leaderboard</Eyebrow>
        <Leaderboard scores={scores} />

        <div style={{ marginTop: 30 }}>
          <Btn onClick={next} disabled={busy}>
            {preset && game.roundIdx + 1 >= preset.rounds.length ? "Finish session" : "Next round"}
          </Btn>
        </div>
      </Shell>
    );
  }

  // Screen 6: Final Standings & Data Export (Strictly Guarded)
  if (game && game.phase === "final") {
    return (
      <Shell wide>
        <div style={{ textAlign: "center", marginBottom: 30, paddingTop: 20 }}>
          <Eyebrow color={T.volt}>Final standings</Eyebrow>
          <h2 style={{ fontFamily: T.display, fontSize: 44 }}>Consultancy of the year 🏆</h2>
        </div>
        <Leaderboard scores={scores} />

        <div style={{ marginTop: 34, background: T.panel, border: `1.5px solid ${T.line}`, borderRadius: 12, padding: "18px 20px" }}>
          <Eyebrow>Session data</Eyebrow>
          <p style={{ color: T.muted, fontSize: 14.5, lineHeight: 1.5, marginBottom: 14 }}>
            Every team's design, its computed cell metrics, duration taken, and number of explored combinations — one row per submission.
          </p>
          <p style={{ color: logged ? T.teal : T.muted, fontSize: 13.5, marginBottom: 14 }}>
            {logged
              ? `✓ ${logged} rows saved to Cloudflare results_log on the server.`
              : "Server-side logging is off or unreachable — use the button below to download the CSV directly."}
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
            <Btn variant="teal" onClick={exportCSV} disabled={busy}>{busy ? "Collecting…" : "Export Submissions CSV"}</Btn>
            <Btn variant="primary" onClick={exportClickstreamCSV} disabled={busy}>{busy ? "Collecting…" : "📊 Export Clickstream Telemetry CSV"}</Btn>
          </div>
          {csvNote && <div style={{ color: T.volt, fontSize: 13.5, marginTop: 12 }}>{csvNote}</div>}
          {csvText && (
            <textarea
              readOnly
              value={csvText}
              onFocus={(e) => e.target.select()}
              style={{
                width: "100%", height: 130, marginTop: 10, fontFamily: T.mono, fontSize: 11.5,
                background: T.bg, color: T.ink, border: `1.5px solid ${T.line}`, borderRadius: 8, padding: 10
              }}
            />
          )}
          {traceCsvNote && <div style={{ color: T.teal, fontSize: 13.5, marginTop: 12 }}>{traceCsvNote}</div>}
          {traceCsvText && (
            <textarea
              readOnly
              value={traceCsvText}
              onFocus={(e) => e.target.select()}
              style={{
                width: "100%", height: 160, marginTop: 10, fontFamily: T.mono, fontSize: 11.5,
                background: T.bg, color: T.ink, border: `1.5px solid ${T.line}`, borderRadius: 8, padding: 10
              }}
            />
          )}
        </div>

        <div style={{ marginTop: 30, display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
          <Btn onClick={() => createGame(presetId)} disabled={busy}>Restart Activity</Btn>
          <Btn variant="teal" onClick={() => { setCode(null); setGame(null); setTeams({}); onUpdateSession({ authed: true, hostToken: HOST_TOKEN, code: null, presetId: null }); }}>
            Close & Pick Activity
          </Btn>
          <Btn variant="ghost" onClick={onEndSession}>Main Menu</Btn>
        </div>
      </Shell>
    );
  }

  // Fallback for HostApp during state transitions
  return (
    <Shell wide>
      <div style={{ textAlign: "center", paddingTop: 60 }}>
        <p style={{ color: T.muted, fontSize: 17, animation: "pulseVolt 2s infinite" }}>
          Loading session state…
        </p>
      </div>
    </Shell>
  );
}

/* ==========================================================================
   9. TEAM VIEW (Student mobile & desktop view)
   ========================================================================== */

function TeamApp({ session, onUpdateSession, onEndSession }) {
  const urlParams = new URLSearchParams(window.location.search);
  const urlCode = (urlParams.get("code") || "").toUpperCase();
  const [code, setCode] = useState(session && session.code ? session.code : urlCode);
  const [name, setName] = useState(session && session.name ? session.name : "");
  const [joined, setJoined] = useState(!!(session && session.joined));
  const [err, setErr] = useState("");
  const [game, setGame] = useState(null);
  const [scores, setScores] = useState({});
  const [showcase, setShowcase] = useState(null);
  const teamId = useRef(session && session.teamId ? session.teamId : randId());
  const [submittedRound, setSubmittedRound] = useState(session && session.submittedRound !== undefined ? session.submittedRound : -1);
  const lastRound = useRef(-99);
  const [subErr, setSubErr] = useState("");
  const traceSeq = useRef(1);
  const traceEvents = useRef([]);
  const pendingBatch = useRef([]);
  const lastEventTs = useRef(null);
  const lastScore = useRef(0);
  const batchTimer = useRef(null);

  const preset = game && game.presetId ? PRESETS[game.presetId] : (PRESETS["builder"] || Object.values(PRESETS)[0]);
  const round = resolveRound(game, game && game.presetId);

  useEffect(() => {
    traceEvents.current = [];
    pendingBatch.current = [];
    traceSeq.current = 1;
    lastEventTs.current = null;
    lastScore.current = 0;
  }, [game && game.roundIdx]);

  const flushTelemetryBatch = () => {
    if (pendingBatch.current.length === 0) return;
    const batchToSend = [...pendingBatch.current];
    pendingBatch.current = [];
    api("log", { cols: TRACE_CSV_COLS, rows: batchToSend }).catch((e) => {
      console.warn("Telemetry batch log failed:", e);
    });
  };

  const handleTrace = (eventType, itemKind, itemId, curA, curC, curE) => {
    if (!game || !round) return;
    const now = Date.now();
    const relSec = game.startTs ? Math.max(0, (now - game.startTs) / 1000) : 0;
    const deltaT = lastEventTs.current ? Math.max(0, (now - lastEventTs.current) / 1000) : 0;
    lastEventTs.current = now;

    // Cognitive deliberation classification
    const delibCat = deltaT < 2.0 ? "rapid_exploration" : deltaT <= 15.0 ? "deliberation" : "extended_pause";

    const isComplete = Boolean(curA && curC && curE);
    const b = isComplete ? buildCell(curA, curC, curE) : null;
    const itemObj = itemKind === "anode" ? ANODES.find((m) => m.id === itemId)
                  : itemKind === "cathode" ? CATHODES.find((m) => m.id === itemId)
                  : itemKind === "elyte" ? ELYTES.find((m) => m.id === itemId)
                  : null;

    const currentScore = b && b.viable ? scoreCell(b, round) : 0;
    const deltaScore = currentScore - lastScore.current;
    if (isComplete) lastScore.current = currentScore;

    // Count components matching benchmark optimum
    let benchMatch = 0;
    const checkBench = (spec) => {
      if (!spec) return 0;
      const parts = spec.toLowerCase().split("|").map((s) => s.trim());
      let m = 0;
      if (curA && parts.includes(curA.toLowerCase())) m++;
      if (curC && parts.includes(curC.toLowerCase())) m++;
      if (curE && parts.includes(curE.toLowerCase())) m++;
      return m;
    };
    if (round.best1) benchMatch = Math.max(benchMatch, checkBench(round.best1));
    if (round.best2) benchMatch = Math.max(benchMatch, checkBench(round.best2));

    // Identify underlying misconception category if non-viable
    let misconception = "";
    if (b && b.fatal.length > 0) {
      const fStr = b.fatal.join(" ").toLowerCase();
      if (fStr.includes("water") || fStr.includes("electrolyses") || fStr.includes("window")) {
        misconception = "aqueous_window_exceeded";
      } else if (fStr.includes("violently") || fStr.includes("alkali")) {
        misconception = "lithium_water_reaction";
      } else if (fStr.includes("acid")) {
        misconception = "acidic_dissolution_hazard";
      } else {
        misconception = "thermodynamic_incompatibility";
      }
    } else if (b && round.requireRecharge && b.rech === "no") {
      misconception = "irreversible_primary_chemistry";
    }

    const deviceType = typeof window !== "undefined" && window.innerWidth < 768 ? "mobile" : "desktop";
    const screenWidth = typeof window !== "undefined" ? window.innerWidth : 1024;

    const row = {
      session_code: code,
      round_id: round.id,
      round_title: round.title,
      team_name: name.trim(),
      team_id: teamId.current,
      event_seq: traceSeq.current++,
      event_type: eventType,
      item_kind: itemKind,
      item_id: itemId,
      item_name: itemObj ? itemObj.name : itemId,
      t_relative_sec: Math.round(relSec * 10) / 10,
      delta_t_sec: Math.round(deltaT * 10) / 10,
      deliberation_category: delibCat,
      current_anode: curA ? (ANODES.find((m) => m.id === curA)?.name || curA) : "",
      current_cathode: curC ? (CATHODES.find((m) => m.id === curC)?.name || curC) : "",
      current_elyte: curE ? (ELYTES.find((m) => m.id === curE)?.name || curE) : "",
      cell_complete: isComplete ? 1 : 0,
      cell_viable: b ? (b.viable ? "yes" : "no") : "",
      cell_voltage_V: b ? b.V.toFixed(3) : "",
      cell_energy_Wh_kg: b ? Math.round(b.energy) : "",
      cell_safety: b ? b.safety.toFixed(1) : "",
      cell_power: b ? b.power.toFixed(1) : "",
      cell_cost: b ? b.cost : "",
      cell_rechargeable: b ? b.rech : "",
      est_score: currentScore,
      delta_score: deltaScore,
      benchmark_match_count: benchMatch,
      active_misconception: misconception,
      fatal_issues: b && b.fatal.length ? b.fatal.join("; ") : "",
      famous_cell: b && b.famous ? b.famous : "",
      device_type: deviceType,
      screen_width: screenWidth,
      logged_at_utc: new Date().toISOString(),
    };

    traceEvents.current.push(row);
    pendingBatch.current.push(row);

    // Save full live trace buffer in live_session_store under esca-ABCD-trace-roundIdx-teamId
    sSet(K(code, "trace", game.roundIdx, teamId.current), traceEvents.current).catch(() => {});

    // Debounce batch send to Cloudflare D1 results_log (flushes every 1.5 seconds)
    if (batchTimer.current) clearTimeout(batchTimer.current);
    batchTimer.current = setTimeout(() => {
      flushTelemetryBatch();
    }, 1500);
  };

  useEffect(() => {
    const handleVis = () => {
      if (game && game.phase === "question") {
        handleTrace(document.hidden ? "tab_blur" : "tab_focus", "window", document.hidden ? "hidden" : "visible", null, null, null);
      }
    };
    document.addEventListener("visibilitychange", handleVis);
    return () => document.removeEventListener("visibilitychange", handleVis);
  }, [game && game.phase, game && game.roundIdx]);

  const join = async () => {
    setErr("");
    const c = code.trim().toUpperCase();
    const tName = name.trim().slice(0, 24);
    if (c.length !== 4 || !tName) {
      setErr("Enter the 4-letter code and a team name.");
      return;
    }
    const state = await sGet(K(c, "state"));
    if (!state) {
      setErr("Session not found — check the code on screen.");
      return;
    }

    const existingKeys = await sList(K(c, "team") + "-");
    const existingTeams = await Promise.all(existingKeys.map((k) => sGet(k)));
    const isDup = existingTeams.some((t) => t && t.name && t.name.trim().toLowerCase() === tName.toLowerCase());
    if (isDup) {
      setErr("That consultancy name is already taken in this session. Pick a unique name!");
      return;
    }

    if (!(await sSet(K(c, "team", teamId.current), { name: tName }))) {
      setErr("Could not join — try again.");
      return;
    }
    setCode(c);
    setGame(state);
    setJoined(true);
    onUpdateSession({ mode: "team", joined: true, code: c, name: tName, teamId: teamId.current, submittedRound: -1 });
  };

  useEffect(() => {
    if (joined && code) {
      sGet(K(code, "state")).then((state) => {
        if (state) {
          setGame(state);
          if (state.phase === "question") {
            sGet(K(code, "sub", state.roundIdx, teamId.current)).then((sub) => {
              if (sub) {
                setSubmittedRound(state.roundIdx);
                onUpdateSession({ mode: "team", joined: true, code, name, teamId: teamId.current, submittedRound: state.roundIdx });
              }
            });
          }
        }
      });
    }
  }, [joined, code]);

  useInterval(async () => {
    const state = await sGet(K(code, "state"));
    if (state) {
      if (state.phase === "question") {
        if (state.roundIdx !== lastRound.current) {
          lastRound.current = state.roundIdx;
        }
        const sub = await sGet(K(code, "sub", state.roundIdx, teamId.current));
        if (sub && submittedRound !== state.roundIdx) {
          setSubmittedRound(state.roundIdx);
          onUpdateSession({ mode: "team", joined: true, code, name, teamId: teamId.current, submittedRound: state.roundIdx });
        }
      }
      if (state.phase === "reveal" || state.phase === "final") {
        const sc = await sGet(K(code, "scores"));
        if (sc) setScores(sc);
        if (state.phase === "reveal") {
          const sh = await sGet(K(code, "showcase", state.roundIdx));
          if (sh) setShowcase(sh);
        }
      }
      setGame(state);
    }
  }, 2500, joined);

  const submit = async (design) => {
    setSubErr("");
    flushTelemetryBatch();
    const elapsed = game && game.startTs ? (Date.now() - game.startTs) / 1000 : null;
    if (await sSet(K(code, "sub", game.roundIdx, teamId.current), { ...design, name: name.trim(), elapsed, clicks: traceEvents.current.length })) {
      setSubmittedRound(game.roundIdx);
      onUpdateSession({ mode: "team", joined: true, code, name, teamId: teamId.current, submittedRound: game.roundIdx });
    } else {
      setSubErr("Submission failed due to a network glitch — please try tapping Submit again!");
    }
  };

  // Screen 1: Join Session
  if (!joined) {
    return (
      <Shell>
        <Eyebrow>Join a session</Eyebrow>
        <h2 style={{ fontFamily: T.display, fontSize: 32, marginBottom: 24 }}>Enter the code on screen</h2>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="CODE"
          maxLength={4}
          className="form-input form-code-input"
          style={{ marginBottom: 14 }}
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Consultancy name (2–3 of you)"
          maxLength={24}
          className="form-input"
          style={{ marginBottom: 18 }}
        />
        {err && <div style={{ color: T.red, marginBottom: 14 }}>{err}</div>}
        <Btn onClick={join} style={{ width: "100%" }}>Join</Btn>
        <div style={{ marginTop: 16, textAlign: "center" }}>
          <button type="button" onClick={onEndSession} style={{ color: T.muted, fontSize: 15 }}>
            ← Back
          </button>
        </div>
      </Shell>
    );
  }

  // Screen 2: Waiting in Lobby
  if (!game || game.phase === "lobby") {
    return (
      <Shell>
        <div style={{ textAlign: "center", paddingTop: 70 }}>
          <Eyebrow>Connected as</Eyebrow>
          <h2 style={{ fontFamily: T.display, fontSize: 34, color: T.volt }}>{name}</h2>
          <p style={{ color: T.muted, marginTop: 18, fontSize: 17, animation: "pulseVolt 2s infinite" }}>
            Waiting for the lecturer to open the first brief…
          </p>
        </div>
      </Shell>
    );
  }

  // Screen 3: Question / Designing Cell
  if (game.phase === "question") {
    if (!round) {
      return (
        <Shell>
          <div style={{ textAlign: "center", paddingTop: 60 }}>
            <Eyebrow>Round {(game.roundIdx >= 0 ? game.roundIdx : 0) + 1}</Eyebrow>
            <p style={{ color: T.muted, marginTop: 18, fontSize: 17, animation: "pulseVolt 2s infinite" }}>
              Loading client brief…
            </p>
          </div>
        </Shell>
      );
    }
    const done = submittedRound === game.roundIdx;
    return (
      <Shell>
        <Eyebrow>{round.title}</Eyebrow>
        <CountdownBar
          startTs={game.startTs}
          seconds={round.seconds}
          paused={game.paused}
          remaining={game.remaining}
        />
        <p style={{ fontSize: 15, lineHeight: 1.5, color: T.muted, background: T.panel, border: `1.5px solid ${T.line}`, borderRadius: 12, padding: "12px 16px", margin: "16px 0" }}>
          {round.brief}
        </p>

        <div style={{ marginBottom: 18 }}>
          <WeightBars weights={round.weights} />
          {round.requireRecharge && <div style={{ color: T.volt, fontSize: 13.5, marginTop: 6, fontWeight: 600 }}>⚡ Must be rechargeable</div>}
        </div>

        {subErr && <div style={{ color: T.red, marginBottom: 12, fontWeight: 600, textAlign: "center" }}>⚠️ {subErr}</div>}

        {done ? (
          <div style={{ textAlign: "center", paddingTop: 30 }}>
            <div style={{ fontSize: 44 }}>🔒</div>
            <p style={{ color: T.teal, fontWeight: 600, fontSize: 18, marginTop: 10 }}>Design locked in.</p>
            <p style={{ color: T.muted, marginTop: 6 }}>Watch the screen for the client's verdict.</p>
          </div>
        ) : (
          <CellDesigner round={round} onSubmit={submit} submitted={done} onTrace={handleTrace} />
        )}
      </Shell>
    );
  }

  // Screen 4: Round Verdict / Reveal
  if (game.phase === "reveal") {
    if (!round) {
      return (
        <Shell>
          <div style={{ textAlign: "center", paddingTop: 60 }}>
            <Eyebrow color={T.volt}>Round {(game.roundIdx >= 0 ? game.roundIdx : 0) + 1} · Verdict</Eyebrow>
            <p style={{ color: T.muted, marginTop: 18, fontSize: 17, animation: "pulseVolt 2s infinite" }}>
              Loading round verdict…
            </p>
          </div>
        </Shell>
      );
    }
    const mine = scores[teamId.current];
    const rank = Object.values(scores).filter((s) => s.total > (mine ? mine.total : 0)).length + 1;
    const best = showcase ? (showcase.best || (showcase.team ? showcase : null)) : null;
    const runnerUp = showcase ? showcase.runnerUp : null;

    return (
      <Shell>
        <Eyebrow color={T.volt}>{round.title} · verdict</Eyebrow>
        {best && (best.team || best.summary) && (
          <div style={{ background: T.panel, border: `2px solid ${T.volt}`, borderRadius: 12, padding: "14px 16px", marginBottom: 10 }}>
            <div style={{ fontFamily: T.mono, fontSize: 12, letterSpacing: "0.14em", color: T.volt, marginBottom: 4 }}>
              🥇 1st BEST DESIGN {best.team ? `· ${best.team}` : ""}
            </div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{best.summary}</div>
            {best.famous && <div style={{ color: T.teal, marginTop: 4, fontSize: 13.5 }}>★ aka {best.famous}</div>}
          </div>
        )}
        {runnerUp && runnerUp.summary && (
          <div style={{ background: T.panel, border: `2px solid ${T.teal}`, borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
            <div style={{ fontFamily: T.mono, fontSize: 12, letterSpacing: "0.14em", color: T.teal, marginBottom: 4 }}>
              🥈 2nd BEST DESIGN {runnerUp.team ? `· ${runnerUp.team}` : ""}
            </div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{runnerUp.summary}</div>
            {runnerUp.famous && <div style={{ color: T.teal, marginTop: 4, fontSize: 13.5 }}>★ aka {runnerUp.famous}</div>}
          </div>
        )}
        {round.reveal ? (
          <p style={{ fontSize: 14.5, lineHeight: 1.55, color: T.muted, marginBottom: 18 }}>{round.reveal}</p>
        ) : null}

        {mine && (
          <div style={{ background: T.panel, border: `2px solid ${T.line}`, borderRadius: 14, padding: "16px 18px", textAlign: "center", marginBottom: 18 }}>
            <div style={{ fontFamily: T.mono, fontSize: 32, color: mine.last > 0 ? T.volt : T.red }}>+{mine.last}</div>
            <div style={{ color: T.muted, marginTop: 4 }}>Total {mine.total} · rank #{rank}</div>
          </div>
        )}
        <Leaderboard scores={scores} highlightId={teamId.current} compact />
      </Shell>
    );
  }

  // Screen 5: Final Result (Strictly Guarded)
  if (game && game.phase === "final") {
    const mine = scores[teamId.current];
    const rank = Object.values(scores).filter((s) => s.total > (mine ? mine.total : 0)).length + 1;
    return (
      <Shell>
        <div style={{ textAlign: "center", paddingTop: 30 }}>
          <Eyebrow color={T.volt}>Final result</Eyebrow>
          <div style={{ fontSize: 54 }}>{rank === 1 ? "🏆" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "🔋"}</div>
          <h2 style={{ fontFamily: T.display, fontSize: 34, margin: "10px 0 4px" }}>#{rank} — {name}</h2>
          <div style={{ fontFamily: T.mono, color: T.teal, fontSize: 22, marginBottom: 26 }}>{mine ? mine.total : 0} pts</div>
        </div>
        <Leaderboard scores={scores} highlightId={teamId.current} compact />
        <div style={{ marginTop: 30, textAlign: "center" }}>
          <Btn variant="ghost" onClick={onEndSession}>Main Menu</Btn>
        </div>
      </Shell>
    );
  }

  // Fallback for TeamApp during state transitions
  return (
    <Shell>
      <div style={{ textAlign: "center", paddingTop: 60 }}>
        <p style={{ color: T.muted, fontSize: 17, animation: "pulseVolt 2s infinite" }}>
          Syncing with session…
        </p>
      </div>
    </Shell>
  );
}

/* ==========================================================================
   10. ROOT CONTROLLER & NAVIGATION
   ========================================================================== */

function getTabMode() {
  try {
    const hash = window.location.hash.toLowerCase();
    if (hash === "#host") return "host";
    if (hash === "#team") return "team";
    const params = new URLSearchParams(window.location.search);
    if (params.get("code")) return "team";
    const mode = sessionStorage.getItem(TAB_MODE_KEY);
    if (mode === "host" && hash === "#host") return "host";
    if (mode === "team") return "team";
    const teamS = localStorage.getItem(TEAM_SESSION_KEY);
    if (teamS) return "team";
    return "landing";
  } catch (e) {
    return "landing";
  }
}

function setTabMode(mode) {
  try {
    if (mode === "host") {
      sessionStorage.setItem(TAB_MODE_KEY, "host");
      if (window.location.hash !== "#host") history.replaceState(null, "", "#host");
    } else if (mode === "team") {
      sessionStorage.setItem(TAB_MODE_KEY, "team");
      if (window.location.hash !== "#team") history.replaceState(null, "", "#team");
    } else {
      sessionStorage.removeItem(TAB_MODE_KEY);
      if (window.location.hash) history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  } catch (e) {}
}

function getStoredHostSession() {
  try {
    const raw = localStorage.getItem(HOST_SESSION_KEY) || sessionStorage.getItem(HOST_SESSION_KEY);
    const data = raw ? JSON.parse(raw) : null;
    if (data && data.hostToken) HOST_TOKEN = data.hostToken;
    return data;
  } catch (e) {
    return null;
  }
}

function saveStoredHostSession(data) {
  try {
    if (data) {
      if (HOST_TOKEN && !data.hostToken) data.hostToken = HOST_TOKEN;
      localStorage.setItem(HOST_SESSION_KEY, JSON.stringify(data));
      sessionStorage.setItem(HOST_SESSION_KEY, JSON.stringify(data));
    } else {
      HOST_TOKEN = null;
      localStorage.removeItem(HOST_SESSION_KEY);
      sessionStorage.removeItem(HOST_SESSION_KEY);
    }
  } catch (e) {}
}

function getStoredTeamSession() {
  try {
    const raw = localStorage.getItem(TEAM_SESSION_KEY) || sessionStorage.getItem(TEAM_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveStoredTeamSession(data) {
  try {
    if (data) {
      localStorage.setItem(TEAM_SESSION_KEY, JSON.stringify(data));
      sessionStorage.setItem(TEAM_SESSION_KEY, JSON.stringify(data));
    } else {
      localStorage.removeItem(TEAM_SESSION_KEY);
      sessionStorage.removeItem(TEAM_SESSION_KEY);
    }
  } catch (e) {}
}

function EnergyStorageCourseActivities() {
  const [ready, setReady] = useState(false);
  const [tabMode, setTabModeState] = useState(() => getTabMode());
  const [hostSession, setHostSession] = useState(() => getStoredHostSession());
  const [teamSession, setTeamSession] = useState(() => getStoredTeamSession());

  useEffect(() => {
    Promise.all([loadMaterials(), loadScenarios()]).finally(() => setReady(true));
  }, []);

  useEffect(() => {
    const handleHashChange = () => {
      setTabModeState(getTabMode());
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const updateHostSession = (newS) => {
    setTabMode("host");
    setTabModeState("host");
    setHostSession(newS);
    saveStoredHostSession(newS);
  };

  const endHostSession = () => {
    setTabMode("landing");
    setTabModeState("landing");
    setHostSession(null);
    saveStoredHostSession(null);
  };

  const updateTeamSession = (newS) => {
    setTabMode("team");
    setTabModeState("team");
    setTeamSession(newS);
    saveStoredTeamSession(newS);
  };

  const endTeamSession = () => {
    setTabMode("landing");
    setTabModeState("landing");
    setTeamSession(null);
    saveStoredTeamSession(null);
  };

  if (!ready) {
    return <div id="boot">Loading Energy Storage Course Activities…</div>;
  }

  if (tabMode === "host") {
    return (
      <HostApp
        session={hostSession}
        onUpdateSession={updateHostSession}
        onEndSession={endHostSession}
      />
    );
  }

  if (tabMode === "team") {
    return (
      <TeamApp
        session={teamSession}
        onUpdateSession={updateTeamSession}
        onEndSession={endTeamSession}
      />
    );
  }

  return (
    <Landing
      onTeam={() => updateTeamSession({ joined: false, code: "", name: "", teamId: randId() })}
    />
  );
}

// Mount the React Application
ReactDOM.createRoot(document.getElementById("root")).render(<EnergyStorageCourseActivities />);
