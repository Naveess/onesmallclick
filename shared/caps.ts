// The per-network daily cap (phase 9a, prompt 54): one person with many devices on one connection can't
// ping or vote dozens of times a day. Generous, so a household, office or school is never blocked.
// Counted per network per UTC day; only pings and votes that went through count.

// Phase Q1a: feedback, 20 a day per network (a household can still send plenty; a flood can't).
export const NETWORK_CAP = { ping: 50, vote: 50, feedback: 20 } as const;

export type CapKind = keyof typeof NETWORK_CAP;
