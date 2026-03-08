// --- Konfiguration ---
const CELL_SIZE = 12;
const CANVAS_W = 800;
const CANVAS_H = 600;
const COLS = Math.floor(CANVAS_W / CELL_SIZE);
const ROWS = Math.floor(CANVAS_H / CELL_SIZE);

const COLOR_ALIVE = "#00d4aa";
const COLOR_DEAD  = "#0a0a1a";
const COLOR_GRID  = "#1a1a2e";

// Farbe je Struktur-ID (0 = keine bekannte Struktur)
const STRUCTURE_COLORS = ["", "#ff6b6b", "#c084fc", "#38bdf8", "#fb923c", "#fde047"];
// IDs:                        1=Blinker  2=Glider   3=LWSS     4=Pulsar   5=Gun

const STRUCTURE_IDS = { blinker: 1, glider: 2, lwss: 3, pulsar: 4, gun: 5 };

// --- Strukturen ---
const STRUCTURES = {
    blinker: {
        name: "Blinker",
        cells: [[0,0],[0,1],[0,2]]
    },
    glider: {
        name: "Glider",
        cells: [[0,1],[1,2],[2,0],[2,1],[2,2]]
    },
    lwss: {
        name: "Spaceship",
        cells: [[0,1],[0,2],[0,3],[0,4],[1,0],[1,4],[2,4],[3,0],[3,3]]
    },
    pulsar: {
        name: "Pulsar",
        cells: [
            [0,2],[0,3],[0,4],[0,8],[0,9],[0,10],
            [2,0],[2,5],[2,7],[2,12],
            [3,0],[3,5],[3,7],[3,12],
            [4,0],[4,5],[4,7],[4,12],
            [5,2],[5,3],[5,4],[5,8],[5,9],[5,10],
            [7,2],[7,3],[7,4],[7,8],[7,9],[7,10],
            [8,0],[8,5],[8,7],[8,12],
            [9,0],[9,5],[9,7],[9,12],
            [10,0],[10,5],[10,7],[10,12],
            [12,2],[12,3],[12,4],[12,8],[12,9],[12,10]
        ]
    },
    gun: {
        name: "Glider Gun",
        cells: [
            [0,24],
            [1,22],[1,24],
            [2,12],[2,13],[2,20],[2,21],[2,34],[2,35],
            [3,11],[3,15],[3,20],[3,21],[3,34],[3,35],
            [4,0],[4,1],[4,10],[4,16],[4,20],[4,21],
            [5,0],[5,1],[5,10],[5,14],[5,16],[5,17],[5,22],[5,24],
            [6,10],[6,16],[6,24],
            [7,11],[7,15],
            [8,12],[8,13]
        ]
    }
};

// --- Muster-Erkennung: Hilfsfunktionen ---
function normalizePattern(cells) {
    const minR = Math.min(...cells.map(([r]) => r));
    const minC = Math.min(...cells.map(([, c]) => c));
    const norm = cells.map(([r, c]) => [r - minR, c - minC]);
    norm.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return norm;
}

function rotate90(cells) {
    return normalizePattern(cells.map(([r, c]) => [c, -r]));
}

function reflectH(cells) {
    return normalizePattern(cells.map(([r, c]) => [r, -c]));
}

function generateVariants(phases) {
    const seen = new Set();
    const result = [];
    for (const phase of phases) {
        let current = normalizePattern(phase);
        for (let rot = 0; rot < 4; rot++) {
            for (const cells of [current, reflectH(current)]) {
                const key = cells.map(([r, c]) => `${r},${c}`).join('|');
                if (!seen.has(key)) {
                    seen.add(key);
                    result.push(cells);
                }
            }
            current = rotate90(current);
        }
    }
    return result;
}

function simulateStep(cells) {
    const aliveSet = new Set(cells.map(([r, c]) => `${r},${c}`));
    const neighborCount = new Map();
    for (const [r, c] of cells) {
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const key = `${r + dr},${c + dc}`;
                neighborCount.set(key, (neighborCount.get(key) || 0) + 1);
            }
        }
    }
    const next = [];
    for (const [key, count] of neighborCount) {
        const [r, c] = key.split(',').map(Number);
        if (aliveSet.has(key) ? (count === 2 || count === 3) : count === 3) {
            next.push([r, c]);
        }
    }
    return next;
}

function computePhases(cells, period) {
    const phases = [];
    let current = [...cells];
    for (let i = 0; i < period; i++) {
        phases.push(normalizePattern(current));
        current = simulateStep(current);
    }
    return phases;
}

// Alle Erkennungsmuster beim Start berechnen (mit Struktur-ID und Randprüfung)
const DETECTION_VARIANTS = (() => {
    const defs = [
        { cells: STRUCTURES.blinker.cells, period: 2, id: STRUCTURE_IDS.blinker },
        { cells: STRUCTURES.glider.cells,  period: 4, id: STRUCTURE_IDS.glider  },
        { cells: STRUCTURES.lwss.cells,    period: 4, id: STRUCTURE_IDS.lwss    },
        { cells: STRUCTURES.pulsar.cells,  period: 3, id: STRUCTURE_IDS.pulsar  },
    ];
    const all = [];
    for (const { cells, period, id } of defs) {
        const phases   = computePhases(cells, period);
        const variants = generateVariants(phases);
        for (const v of variants) {
            const maxR = Math.max(...v.map(([r]) => r));
            const maxC = Math.max(...v.map(([, c]) => c));
            // Randzellen vorberechnen: alle Positionen im Bounding-Box-Rand, die NICHT zum Muster gehören
            const patternSet = new Set(v.map(([r, c]) => `${r},${c}`));
            const borderCells = [];
            for (let r = -1; r <= maxR + 1; r++) {
                for (let c = -1; c <= maxC + 1; c++) {
                    if (!patternSet.has(`${r},${c}`)) borderCells.push([r, c]);
                }
            }
            all.push({ cells: v, id, maxR, maxC, borderCells });
        }
    }
    return all;
})();

// --- Zustand ---
let grid          = [];
let highlightGrid = [];
let generation    = 0;
let running       = false;
let intervalId    = null;
let isDrawing     = false;
let drawValue     = 1;
let selectedStructure = null;
let coloringEnabled = true;
let maxGenerations  = Infinity;

// Struktur-Protokoll: Zählt wie oft jede Struktur NEU aufgetreten ist
let structureCounts  = { 1: 0, 2: 0, 3: 0, 4: 0 };
// Schwerpunkte der zuletzt erkannten Instanzen je Struktur-ID
let prevInstances    = { 1: [], 2: [], 3: [], 4: [] };

// --- Canvas ---
const canvas = document.getElementById("canvas");
const ctx    = canvas.getContext("2d");

// --- Muster-Erkennung ---
const MATCH_THRESHOLD = 5; // Max. Abstand (Zellen) für "gleiche Instanz" zwischen Generationen

function detectAndMark() {
    const currentInstances = { 1: [], 2: [], 3: [], 4: [] };

    for (const { cells, id, maxR, maxC, borderCells } of DETECTION_VARIANTS) {
        for (let startR = 0; startR + maxR < ROWS; startR++) {
            for (let startC = 0; startC + maxC < COLS; startC++) {
                // 1. Alle Musterzellen müssen lebendig sein
                let match = true;
                for (const [dr, dc] of cells) {
                    if (!grid[startR + dr][startC + dc]) { match = false; break; }
                }
                if (!match) continue;
                // 2. Isolationscheck: alle Randzellen müssen tot sein
                let isolated = true;
                for (const [dr, dc] of borderCells) {
                    const gr = startR + dr, gc = startC + dc;
                    if (gr >= 0 && gr < ROWS && gc >= 0 && gc < COLS && grid[gr][gc]) {
                        isolated = false; break;
                    }
                }
                if (!isolated) continue;
                // 3. Markieren
                for (const [dr, dc] of cells) {
                    highlightGrid[startR + dr][startC + dc] = id;
                }
                // 4. Schwerpunkt berechnen und als aktuelle Instanz merken
                if (id in currentInstances) {
                    const centR = startR + cells.reduce((s, [r]) => s + r, 0) / cells.length;
                    const centC = startC + cells.reduce((s, [, c]) => s + c, 0) / cells.length;
                    currentInstances[id].push({ centR, centC });
                }
            }
        }
    }

    // 5. Neue Instanzen erkennen: Schwerpunkt-Matching mit Vorgeneration
    for (const id of [1, 2, 3, 4]) {
        const prev = prevInstances[id];
        const used = new Set();
        for (const curr of currentInstances[id]) {
            let matched = false;
            let bestDist = MATCH_THRESHOLD + 1, bestIdx = -1;
            for (let i = 0; i < prev.length; i++) {
                if (used.has(i)) continue;
                const d = Math.hypot(curr.centR - prev[i].centR, curr.centC - prev[i].centC);
                if (d < bestDist) { bestDist = d; bestIdx = i; }
            }
            if (bestIdx >= 0) {
                used.add(bestIdx); // gleiche Instanz aus Vorgeneration
            } else {
                structureCounts[id]++; // neue Instanz!
            }
            matched = bestIdx >= 0; // suppress lint warning
            void matched;
        }
        prevInstances[id] = currentInstances[id];
    }

    updateStatsDisplay();
}

function updateStatsDisplay() {
    const names = { 1: "Blinker", 2: "Glider", 3: "Spaceship", 4: "Pulsar" };
    for (const id of [1, 2, 3, 4]) {
        document.getElementById(`stat-${id}`).textContent =
            `${names[id]}: ${structureCounts[id]}`;
    }
}

function resetCounts() {
    structureCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
    prevInstances   = { 1: [], 2: [], 3: [], 4: [] };
    updateStatsDisplay();
}

// --- Zeichnen ---
function draw() {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const x = c * CELL_SIZE;
            const y = r * CELL_SIZE;
            if (grid[r][c]) {
                const sid = coloringEnabled ? highlightGrid[r][c] : 0;
                ctx.fillStyle = sid ? STRUCTURE_COLORS[sid] : COLOR_ALIVE;
                ctx.fillRect(x + 1, y + 1, CELL_SIZE - 1, CELL_SIZE - 1);
            } else {
                ctx.fillStyle = COLOR_DEAD;
                ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
            }
        }
    }
    ctx.strokeStyle = COLOR_GRID;
    ctx.lineWidth = 0.5;
    for (let r = 0; r <= ROWS; r++) {
        ctx.beginPath(); ctx.moveTo(0, r * CELL_SIZE); ctx.lineTo(CANVAS_W, r * CELL_SIZE); ctx.stroke();
    }
    for (let c = 0; c <= COLS; c++) {
        ctx.beginPath(); ctx.moveTo(c * CELL_SIZE, 0); ctx.lineTo(c * CELL_SIZE, CANVAS_H); ctx.stroke();
    }
}

// --- Spiellogik ---
function countNeighbors(r, c) {
    let count = 0;
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            count += grid[(r + dr + ROWS) % ROWS][(c + dc + COLS) % COLS];
        }
    }
    return count;
}

function nextGeneration() {
    const newGrid      = Array.from({ length: ROWS }, () => new Uint8Array(COLS));
    const newHighlight = Array.from({ length: ROWS }, () => new Uint8Array(COLS));
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const n = countNeighbors(r, c);
            if (grid[r][c]) {
                if (n === 2 || n === 3) {
                    newGrid[r][c]      = 1;
                    newHighlight[r][c] = highlightGrid[r][c]; // Highlight bleibt bei überlebenden Zellen
                }
            } else {
                if (n === 3) newGrid[r][c] = 1; // Neugeborene: zunächst kein Highlight
            }
        }
    }
    grid          = newGrid;
    highlightGrid = newHighlight;
    detectAndMark();
    generation++;
    document.getElementById("generation").textContent = `Generation: ${generation}`;
    draw();
    if (generation >= maxGenerations) toggleRunning();
}

// --- Steuerung ---
function toggleRunning() {
    running = !running;
    const btn = document.getElementById("btn-start");
    if (running) {
        btn.textContent = "⏸ Pause";
        const speed = parseInt(document.getElementById("speed").value);
        intervalId = setInterval(nextGeneration, Math.floor(1000 / speed));
    } else {
        btn.textContent = "▶ Start";
        clearInterval(intervalId);
        intervalId = null;
    }
}

function step() {
    if (running) toggleRunning();
    nextGeneration();
}

function clearGrid() {
    if (running) toggleRunning();
    grid          = Array.from({ length: ROWS }, () => new Uint8Array(COLS));
    highlightGrid = Array.from({ length: ROWS }, () => new Uint8Array(COLS));
    generation    = 0;
    document.getElementById("generation").textContent = "Generation: 0";
    resetCounts();
    draw();
}

function randomGrid() {
    const density = parseInt(document.getElementById("density").value) / 100;
    grid = Array.from({ length: ROWS }, () =>
        Array.from({ length: COLS }, () => Math.random() < density ? 1 : 0)
    );
    highlightGrid = Array.from({ length: ROWS }, () => new Uint8Array(COLS));
    generation    = 0;
    document.getElementById("generation").textContent = "Generation: 0";
    resetCounts();
    detectAndMark();
    draw();
}

// --- Struktur-Platzierung ---
function selectStructure(key) {
    selectedStructure = (selectedStructure === key) ? null : key;
    document.querySelectorAll(".btn-structure").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.structure === selectedStructure);
    });
    canvas.style.cursor = selectedStructure ? "copy" : "crosshair";
}

function placeStructure(r, c) {
    const cells   = STRUCTURES[selectedStructure].cells;
    const maxR    = Math.max(...cells.map(([dr]) => dr));
    const maxC    = Math.max(...cells.map(([, dc]) => dc));
    const offsetR = Math.floor(maxR / 2);
    const offsetC = Math.floor(maxC / 2);
    const sid = STRUCTURE_IDS[selectedStructure] || 1;
    for (const [dr, dc] of cells) {
        const nr = r - offsetR + dr;
        const nc = c - offsetC + dc;
        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
            grid[nr][nc]          = 1;
            highlightGrid[nr][nc] = sid;
        }
    }
    detectAndMark();
    draw();
}

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && selectedStructure) selectStructure(selectedStructure);
});

// --- Maus-Interaktion ---
function getCell(event) {
    const rect = canvas.getBoundingClientRect();
    return {
        r: Math.floor((event.clientY - rect.top)  / CELL_SIZE),
        c: Math.floor((event.clientX - rect.left) / CELL_SIZE)
    };
}

canvas.addEventListener("mousedown", (event) => {
    const { r, c } = getCell(event);
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return;
    if (selectedStructure) { placeStructure(r, c); return; }
    drawValue     = grid[r][c] ? 0 : 1;
    grid[r][c]    = drawValue;
    isDrawing     = true;
    draw();
});

canvas.addEventListener("mousemove", (event) => {
    if (!isDrawing) return;
    const { r, c } = getCell(event);
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS) { grid[r][c] = drawValue; draw(); }
});

canvas.addEventListener("mouseup",    () => { isDrawing = false; });
canvas.addEventListener("mouseleave", () => { isDrawing = false; });

// --- Geschwindigkeits-Slider ---
document.getElementById("speed").addEventListener("input", (event) => {
    const speed = parseInt(event.target.value);
    document.getElementById("speed-label").textContent = `${speed} FPS`;
    if (running) {
        clearInterval(intervalId);
        intervalId = setInterval(nextGeneration, Math.floor(1000 / speed));
    }
});

// --- Button-Events ---
const modalOverlay = document.getElementById("modal-overlay");
document.getElementById("btn-info").addEventListener("click",  () => modalOverlay.classList.add("visible"));
document.getElementById("modal-close").addEventListener("click", () => modalOverlay.classList.remove("visible"));
modalOverlay.addEventListener("click", (e) => { if (e.target === modalOverlay) modalOverlay.classList.remove("visible"); });

document.getElementById("density").addEventListener("input", (event) => {
    document.getElementById("density-label").textContent = `${event.target.value}%`;
});

document.getElementById("limit-enabled").addEventListener("change", (e) => {
    const input = document.getElementById("max-gen");
    input.disabled = !e.target.checked;
    maxGenerations = e.target.checked ? parseInt(input.value) : Infinity;
});

document.getElementById("max-gen").addEventListener("input", (e) => {
    maxGenerations = parseInt(e.target.value) || Infinity;
});

document.getElementById("btn-reset-counts").addEventListener("click", resetCounts);

document.getElementById("btn-coloring").addEventListener("click", () => {
    coloringEnabled = !coloringEnabled;
    const btn = document.getElementById("btn-coloring");
    btn.textContent = `Färbung: ${coloringEnabled ? "AN" : "AUS"}`;
    btn.classList.toggle("active", coloringEnabled);
    draw();
});

document.getElementById("btn-start").addEventListener("click",  toggleRunning);
document.getElementById("btn-step").addEventListener("click",   step);
document.getElementById("btn-clear").addEventListener("click",  clearGrid);
document.getElementById("btn-random").addEventListener("click", randomGrid);

document.querySelectorAll(".btn-structure").forEach(btn => {
    btn.addEventListener("click", () => selectStructure(btn.dataset.structure));
});

// --- Start ---
clearGrid();
