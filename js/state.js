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
const GPAD = 10, GAP = 5;
const MEDALS = ['🥇','🥈','🥉'];
const PAL = ['#2dff7f','#4dfffe','#ff4d6a','#ffe04d','#c084fc',
             '#ff9f43','#48dbfb','#ff6b9d','#a29bfe','#00b894'];

// ── Game state ──
let rows, cols, cellSize, baseNodes, initialSeed, currentDiff;
let cells = [], hiddenSet = new Set(), pathIndices = [];
let isDrawing = false, solvableCount = 0, totalNodes = 0;
let level = 1, timerInt, elapsedSec = 0, timerFrozen = false;
let gLeft = 0, gTop = 0;
let solutionPath = [];

// ── Battle / networking state ──
let peer = null, codePeer = null;
const myId = 'p' + Math.random().toString(36).slice(2, 8);
let myName = 'Racer';
let isHost = false, roomCode = '';
let guestConns = [], hostConn = null;
const connMap = new Map();
let lobbyPlayers = {};
let battleDiff = 'easy', battleSeed = 0;
let battleActive = false, totalExpected = 0;
let finishOrder = [];
let roundScores = {};
let battleRound = 0, maxRounds = 3;
let amSpectating = false;
let progressState = {};
let remotePaths = {};
let quitPlayers = new Set();
let nextRoundTimer = null;
let specViewPid = null;
let specPlayerOrder = [];
let chatMsgs = [];
let chatUnread = 0;

// ── UI / flow state ──
let rejoinAfterConflict = false; // true after name_conflict → re-send join on save
let pinBuffer = '';
let adminTargetId = myId;
let autoNextTimer = null;
let autoNextSec = 10;
