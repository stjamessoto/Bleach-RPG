// factions.js
// Canon-aligned faction definitions. Each defines its primary resource gauge,
// core disciplines, and starting stat spread.

export const FACTIONS = {
  soul_reaper: {
    id: "soul_reaper",
    name: "Soul Reaper",
    jp: "死神 · Shinigami",
    resource: { key: "reiryoku", label: "Reiryoku", color: "#4fb6ff", max: 100 },
    disciplines: ["Zanjutsu", "Kidō", "Hohō (Shunpo)", "Hakuda"],
    blurb:
      "Guardians of balance who sever the chains between the living and the dead. Wielders of the Zanpakutō.",
    stats: { vitality: 70, speed: 65, mastery: 40 },
    releaseName: "Shikai → Bankai",
    auraColorDefault: "#4fb6ff",
  },
  quincy: {
    id: "quincy",
    name: "Quincy",
    jp: "滅却師 · Quincy",
    resource: {
      key: "reishi",
      label: "Ambient Reishi",
      color: "#66e0c8",
      max: 100,
      environmentScaled: true,
    },
    disciplines: ["Reishi Manipulation", "Heilig Bogen", "Hirenkyaku", "Blut"],
    blurb:
      "Human archers who bend ambient Reishi into holy bows. Their power swells or starves with the world around them.",
    stats: { vitality: 60, speed: 70, mastery: 45 },
    releaseName: "Letzt Stil / Vollständig",
    auraColorDefault: "#66e0c8",
  },
  fullbringer: {
    id: "fullbringer",
    name: "Fullbringer",
    jp: "完現術者 · Fullbringer",
    resource: { key: "affinity", label: "Matter Affinity", color: "#c48cff", max: 100 },
    disciplines: ["Object Affinity", "Bringer Light", "Soul-Matter Shaping"],
    blurb:
      "Those touched by Hollow before birth, who pull the soul out of matter itself and bend it to their will.",
    stats: { vitality: 65, speed: 68, mastery: 42 },
    releaseName: "Fullbring → Complete Fullbring",
    auraColorDefault: "#c48cff",
  },
  hollow: {
    id: "hollow",
    name: "Arrancar / Hollow",
    jp: "破面 · Arrancar",
    resource: { key: "negative", label: "Negative Soul Energy", color: "#ff5470", max: 100 },
    disciplines: ["Cero", "Sonído", "Hierro", "Evolutionary Consumption"],
    blurb:
      "Born of despair in the endless desert. Climb the ladder — Gillian, Adjuchas, Vasto Lorde — by consuming your own kind.",
    stats: { vitality: 80, speed: 60, mastery: 35 },
    releaseName: "Resurrección → Segunda Etapa",
    auraColorDefault: "#ff5470",
    evolution: ["Gillian", "Adjuchas", "Vasto Lorde", "Arrancar"],
  },
};

// Hybrids get multiple gauges + an instability meter.
export function buildResourcePools(primaryId, secondaryId) {
  const pools = {};
  const primary = FACTIONS[primaryId];
  pools[primary.resource.key] = {
    ...primary.resource,
    current: primary.resource.max,
  };
  if (secondaryId && secondaryId !== primaryId) {
    const secondary = FACTIONS[secondaryId];
    pools[secondary.resource.key] = {
      ...secondary.resource,
      current: Math.round(secondary.resource.max * 0.6), // secondary path starts weaker
    };
    // Hybrid-only instability gauge
    pools.instability = {
      key: "instability",
      label: "Spiritual Instability",
      color: "#ffb347",
      max: 100,
      current: 15,
    };
  }
  return pools;
}
