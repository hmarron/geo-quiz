// ─── Pure utility functions (no DOM, no globals) ─────────────────────────────

function normalizeString(str) {
    return str.toLowerCase()
        .replace(/^the\s+/i, '')
        .replace(/[^a-z0-9\s]/gi, '')
        .trim();
}

function levenshteinDistance(s1, s2) {
    const m = s1.length;
    const n = s2.length;
    const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) d[i][0] = i;
    for (let j = 0; j <= n; j++) d[0][j] = j;
    for (let j = 1; j <= n; j++) {
        for (let i = 1; i <= m; i++) {
            const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        }
    }
    return d[m][n];
}

function getCountryName(feature) {
    if (!feature) return "Unknown";
    const p = feature.properties;
    return p.NAME || p.ADMIN || p.name || "Unnamed Territory";
}

function getAcceptableNames(feature) {
    if (!feature) return [];
    const p = feature.properties;
    const candidates = [p.NAME, p.ADMIN, p.NAME_LONG, p.ABBREV, p.ISO_A3, p.ISO_A2];
    return [...new Set(candidates.filter(Boolean).map(normalizeString).filter(n => n.length > 0))];
}

function formatTime(ms) {
    const secs = Math.floor(ms / 1000);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}
