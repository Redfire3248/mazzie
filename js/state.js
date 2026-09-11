// ══════════════════════════════════════════════════
// js/state.js — All shared global state
// ══════════════════════════════════════════════════

// ── Game constants ──
const CONFIGS = {
  baby:   { r:4,  c:4, n:2 },
  easy:   { r:5,  c:5, n:3 },
  medium: { r:7,  c:6, n:4 },
  hard:   { r:9,  c:7, n:5 },
  expert: { r:10, c:7, n:7 }
};
const DIFFS = Object.keys(CONFIGS);
const GPAD = 10, GAP = 5;
const PAL = ['#2dff7f','#4dfffe','#ff4d6a','#ffe04d','#c084fc',
             '#ff9f43','#48dbfb','#ff6b9d','#a29bfe','#00b894'];
const MAX_ROOM_PLAYERS = 8;

// ── Game state ──
let rows, cols, cellSize, baseNodes, initialSeed, currentDiff;
let cells = [], hiddenSet = new Set(), obstacleSet = new Set(), pathIndices = [];
let pathSet = new Set(), curHigh = 0;
let isDrawing = false, solvableCount = 0, totalNodes = 0;
let level = 1, timerInt, elapsedSec = 0, timerMs = 0, timerFrozen = false;
let selfFreezeUntil = 0;
let gLeft = 0, gTop = 0, boardOffX = 0, boardOffY = 0;
let solutionPath = [];
let dailyMode = false;

// ── Boosts / abilities ──
let pickupMap = new Map();     // cell idx → ability kind (uncollected)
let abilityInv = [];           // up to 3 ability kinds
let inputLockedUntil = 0;      // Frost (hit by rival)
let shieldUntil = 0;
let abilitiesEnabled = true;   // battle lobby toggle
let partyMode = false;         // "Random Events" modifier is on (chaos trolls during the match)
let battleMods = [];           // room modifiers the host picked (see MODIFIERS in battle.js)

// ── Battle / networking state ──
let peer = null, codePeer = null;
let myId = 'tmp_' + Math.random().toString(36).slice(2, 8); // overwritten after account login
let myName = 'Racer';
let isHost = false, roomCode = '';
let guestConns = [], hostConn = null;
const connMap = new Map();
let lobbyPlayers = {};
let battleDiff = 'easy', battleDiffSetting = 'easy', battleSeed = 0;
let battleActive = false, totalExpected = 0;
let finishOrder = [];
let roundScores = {};
let battleRound = 0, maxRounds = 3;
let roundEnded = false;
let amSpectating = false;
let progressState = {};
let remotePaths = {};
let quitPlayers = new Set();
let specViewPid = null;
let specPlayerOrder = [];
let chatMsgs = [];
let chatUnread = 0;
let isQuickMatch = false;

// ── UI / flow state ──
let rejoinAfterConflict = false; // true after name_conflict → re-send join on save
let adminTargetId = myId;
let autoNextTimer = null;
let autoNextSec = 6;
