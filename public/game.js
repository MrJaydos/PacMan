// Pac-Man: vanilla JS + Canvas, no build step.
//
// Movement model: every entity's position is stored as fractional (col, row)
// tile coordinates. Because entities only ever change direction exactly when
// they are centered on a tile, a "leg" of movement between two centers is
// always exactly 1.0 tile long -- that lets the step loop below advance by
// whatever distance a frame's dt allows, snap cleanly onto the next center
// when it's reached (regardless of frame rate/hitches), and only then ask
// "which way now?". That single trick avoids drift and avoids skipping
// intersections when dt briefly spikes.
(() => {
  "use strict";

  // ---------------------------------------------------------------------
  // Maze data. '#' wall, '.' dot, 'o' power pellet, ' ' empty (ghost house
  // interior/door -- walkable, no pellet). Each layout was generated with a
  // symmetric recursive-backtracker + braid pass, then flood-fill verified
  // so every dot is reachable; see the project history for the generator.
  // All five share the same fixed footprint -- ghost house box, door, exit,
  // tunnel row, and corner pellets at the same coordinates -- so any layout
  // can be dropped in for any level without touching the rest of the game.
  // One board is picked per level (see mazeForLevel) so the game doesn't
  // replay the same layout every board.
  // ---------------------------------------------------------------------
  const MAZES = [
    [
      "###################",
      "#o...............o#",
      "#.###.###.###.###.#",
      "#.#...#.#.#.#...#.#",
      "#.#.###.#.#.###.#.#",
      "#.#...#.....#...#.#",
      "#.###.#######.###.#",
      "#...#.........#...#",
      "###.###.#.#.###.###",
      "#.....### ###.....#",
      "#.###.##   ##.###.#",
      "......##   ##......",
      "#.######   ######.#",
      "#.#....#####....#.#",
      "#.#.#####.#####.#.#",
      "#.#.............#.#",
      "#.#####.#.#.#####.#",
      "#.#.....#.#.....#.#",
      "#.#.#####.#####.#.#",
      "#...#...#.#...#...#",
      "#.###.#.#.#.#.###.#",
      "#o....#.....#....o#",
      "###################",
    ],
    [
      "###################",
      "#o...............o#",
      "#.#.#.###.###.#.#.#",
      "#...#...#.#...#...#",
      "#######.#.#.#######",
      "#.....#.#.#.#.....#",
      "#.#.#.#.#.#.#.#.#.#",
      "#.#.#...#.#...#.#.#",
      "#.#.###.#.#.###.#.#",
      "#.#...### ###...#.#",
      "#.###.##   ##.###.#",
      "..#....#   #....#..",
      "#.#.####   ####.#.#",
      "#.#....#####....#.#",
      "#.#.#.###.###.#.#.#",
      "#.#.#.........#.#.#",
      "#.#.#.#######.#.#.#",
      "#.#.............#.#",
      "#.#######.#######.#",
      "#.................#",
      "#.#######.#######.#",
      "#o...............o#",
      "###################",
    ],
    [
      "###################",
      "#o...............o#",
      "#.###.#.#.#.#.###.#",
      "#.....#.#.#.#.....#",
      "#.#####.#.#.#####.#",
      "#.....#.#.#.#.....#",
      "#.#.#.#.#.#.#.#.#.#",
      "#...#.#.....#.#...#",
      "#.###.###.###.###.#",
      "#.#....## ##....#.#",
      "#.#.####   ####.#.#",
      "..#...##   ##...#..",
      "#.###.##   ##.###.#",
      "#.....#######.....#",
      "###.#.#.###.#.#.###",
      "#...#.#.....#.#...#",
      "#.###.#.#.#.#.###.#",
      "#...#.#.....#.#...#",
      "#.#.#.###.###.#.#.#",
      "#.#.#.#.....#.#.#.#",
      "#.#.###.###.###.#.#",
      "#o#.............#o#",
      "###################",
    ],
    [
      "###################",
      "#o..#.........#..o#",
      "###.#####.#####.###",
      "#.#.............#.#",
      "#.#######.#######.#",
      "#.................#",
      "#.#.###########.#.#",
      "#.#.............#.#",
      "#.###.#.#.#.#.###.#",
      "#...#.### ###.#...#",
      "#.#.#.##   ##.#.#.#",
      "..#.#..#   #..#.#..",
      "#.#.####   ####.#.#",
      "#.#.#..#####..#.#.#",
      "#.#.#.###.###.#.#.#",
      "#...#.#.....#.#...#",
      "#.###.#.#.#.#.###.#",
      "#...#...#.#...#...#",
      "###.#.#.#.#.#.#.###",
      "#...#.#.#.#.#.#...#",
      "#.#####.#.#.#####.#",
      "#o...............o#",
      "###################",
    ],
    [
      "###################",
      "#o...............o#",
      "#.#######.#######.#",
      "#.......#.#.......#",
      "#.#######.#######.#",
      "#.................#",
      "#.###############.#",
      "#...#.........#...#",
      "###.#.###.###.#.###",
      "#.#...### ###...#.#",
      "#.###.##   ##.###.#",
      "......##   ##......",
      "#.######   ######.#",
      "#.#...#######...#.#",
      "#.#.#.###.###.#.#.#",
      "#.#.#.........#.#.#",
      "#.#.#####.#####.#.#",
      "#.#.....#.#.....#.#",
      "#.###.#.###.#.###.#",
      "#...#.#.....#.#...#",
      "#.#.#.###.###.#.#.#",
      "#o...............o#",
      "###################",
    ],
  ];
  // Reassigned per level by setMazeForLevel(); every layout above is the
  // same 19x23 footprint so COLS/ROWS/TUNNEL_ROW etc. stay valid for all of them.
  let MAZE = MAZES[0];
  function mazeForLevel(level) {
    return MAZES[(level - 1) % MAZES.length];
  }
  function setMazeForLevel(level) {
    MAZE = mazeForLevel(level);
  }

  const COLS = MAZE[0].length;
  const ROWS = MAZE.length;
  const TUNNEL_ROW = 11;
  const TILE = 20;

  const WIN_LEVEL = 5; // clearing this many boards is a win, not an endless climb

  const PACMAN_START = { col: 9, row: 15 };
  const HOUSE_DOOR = { col: 9, row: 9 };
  const HOUSE_EXIT = { col: 9, row: 8 }; // tile a ghost reaches to be considered "out"

  function isHouseArea(col, row) {
    return row >= 9 && row <= 13 && col >= 7 && col <= 11;
  }

  function tileChar(col, row) {
    if (row < 0 || row >= ROWS) return "#";
    if (col < 0 || col >= COLS) return row === TUNNEL_ROW ? "." : "#";
    return MAZE[row][col];
  }

  // allowHouse: ghosts entering/leaving/inside the house need to ignore the
  // "house is off-limits" rule that keeps Pac-Man and roaming ghosts out.
  function isOpenTile(col, row, allowHouse) {
    const ch = tileChar(col, row);
    if (ch === "#") return false;
    if (!allowHouse && isHouseArea(col, row)) return false;
    return true;
  }

  const DIRS = {
    UP: { x: 0, y: -1 },
    DOWN: { x: 0, y: 1 },
    LEFT: { x: -1, y: 0 },
    RIGHT: { x: 1, y: 0 },
    NONE: { x: 0, y: 0 },
  };
  // Tie-break order the classic game uses when two directions are equally good.
  const DIR_PRIORITY = [DIRS.UP, DIRS.LEFT, DIRS.DOWN, DIRS.RIGHT];
  function reverseOf(dir) {
    return { x: -dir.x, y: -dir.y };
  }
  function sameDir(a, b) {
    return a.x === b.x && a.y === b.y;
  }

  // ---------------------------------------------------------------------
  // Collectibles: parsed once from MAZE into a mutable grid so a level can
  // be refilled without re-parsing the source layout.
  // ---------------------------------------------------------------------
  let dots; // dots[row][col] = 'dot' | 'pellet' | null
  let dotsRemaining = 0;
  function resetDots() {
    dots = [];
    dotsRemaining = 0;
    for (let row = 0; row < ROWS; row++) {
      dots[row] = [];
      for (let col = 0; col < COLS; col++) {
        const ch = MAZE[row][col];
        if (ch === ".") {
          dots[row][col] = "dot";
          dotsRemaining++;
        } else if (ch === "o") {
          dots[row][col] = "pellet";
          dotsRemaining++;
        } else {
          dots[row][col] = null;
        }
      }
    }
  }

  // ---------------------------------------------------------------------
  // Canvas + responsive scaling
  // ---------------------------------------------------------------------
  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");
  const gameWrap = document.getElementById("game-wrap");
  const hud = document.getElementById("hud");

  function setupCanvasResolution() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = COLS * TILE * dpr;
    canvas.height = ROWS * TILE * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function resizeCanvasDisplay() {
    const aspect = COLS / ROWS;
    const availW = gameWrap.clientWidth - 16;
    const availH = gameWrap.clientHeight - hud.offsetHeight - 24;
    let w = availW;
    let h = w / aspect;
    if (h > availH) {
      h = availH;
      w = h * aspect;
    }
    canvas.style.width = `${Math.max(160, Math.floor(w))}px`;
    canvas.style.height = `${Math.max(160 / aspect, Math.floor(h))}px`;
  }
  setupCanvasResolution();
  window.addEventListener("resize", resizeCanvasDisplay);
  window.addEventListener("orientationchange", resizeCanvasDisplay);

  // ---------------------------------------------------------------------
  // Entities
  // ---------------------------------------------------------------------
  function makePacman() {
    return {
      col: PACMAN_START.col,
      row: PACMAN_START.row,
      dir: DIRS.NONE,
      nextDir: DIRS.LEFT,
      speed: 6.2, // tiles/sec
      mouthPhase: 0,
    };
  }

  const GHOST_DEFS = [
    { name: "red", color: "#ff0000", corner: { col: COLS - 2, row: 1 }, releaseDelay: 0 },
    { name: "pink", color: "#ffb8ff", corner: { col: 1, row: 1 }, releaseDelay: 3 },
    { name: "cyan", color: "#00ffff", corner: { col: COLS - 2, row: ROWS - 2 }, releaseDelay: 6 },
    { name: "orange", color: "#ffb851", corner: { col: 1, row: ROWS - 2 }, releaseDelay: 9 },
  ];
  const HOUSE_SLOTS = [
    { col: 9, row: 10 },
    { col: 9, row: 11 },
    { col: 8, row: 11 },
    { col: 10, row: 11 },
  ];

  function makeGhosts() {
    return GHOST_DEFS.map((def, i) => ({
      ...def,
      col: HOUSE_SLOTS[i].col,
      row: HOUSE_SLOTS[i].row,
      dir: DIRS.UP,
      state: "inHouse", // inHouse -> exiting -> active -> (frightened) -> eaten -> inHouse ...
      mode: "scatter",
      respawnAt: 0,
      bobPhase: i,
    }));
  }

  let pacman = makePacman();
  let ghosts = makeGhosts();

  // ---------------------------------------------------------------------
  // Global game state
  // ---------------------------------------------------------------------
  const MODE_SCHEDULE = [
    { mode: "scatter", duration: 7 },
    { mode: "chase", duration: 20 },
    { mode: "scatter", duration: 7 },
    { mode: "chase", duration: 20 },
    { mode: "scatter", duration: 5 },
    { mode: "chase", duration: 20 },
    { mode: "scatter", duration: 5 },
    { mode: "chase", duration: Infinity },
  ];

  const state = {
    phase: "menu", // menu | ready | playing | paused | levelcomplete | gameover
    score: 0,
    lives: 3,
    level: 1,
    modeIndex: 0,
    modeTimer: 0,
    globalMode: "scatter",
    frightenedTimer: 0,
    frightenedCombo: 0,
    readyTimer: 0,
    levelCompleteTimer: 0,
    elapsed: 0,
    levelStartElapsed: 0,
    lastSubmittedScore: null,
  };

  function scatterChaseDurationFor(index) {
    const entry = MODE_SCHEDULE[Math.min(index, MODE_SCHEDULE.length - 1)];
    if (entry.mode === "scatter") {
      // Deeper levels get shorter (and eventually just one) breather before
      // the permanent-chase jump below kicks in.
      const floor = state.level >= 3 ? 1 : 2;
      return Math.max(floor, entry.duration - (state.level - 1));
    }
    return entry.duration;
  }

  function frightenedDuration() {
    return Math.max(1.5, 7 - (state.level - 1) * 0.5);
  }

  // Pac-Man moves at 6.2 tiles/sec (see makePacman). Ghosts start noticeably
  // slower so early levels feel fair, then close the gap and overtake by the
  // final level so chase mode is a real, escalating threat rather than
  // background noise the player can always outrun in open corridors.
  function ghostNormalSpeed() {
    return Math.min(6.8, 5.3 + (state.level - 1) * 0.3);
  }

  // ---------------------------------------------------------------------
  // Movement helpers shared by Pac-Man and ghosts
  // ---------------------------------------------------------------------
  function wrapCol(col) {
    if (col < 0) return col + COLS;
    if (col >= COLS) return col - COLS;
    return col;
  }

  function roundTo(v) {
    return Math.round(v * 1e6) / 1e6;
  }

  // How far (in tile units, 0..1) an entity must still travel along `dir`
  // before it lands exactly on the next tile center. This has to be derived
  // from the entity's actual current position -- NOT from a single frame's
  // speed*dt -- because at normal frame rates speed*dt is a small fraction
  // of a tile, so a fixed per-frame threshold would (and, in an earlier
  // version of this file, did) almost never trigger a wall/turn check,
  // letting entities slide through walls indefinitely.
  function distanceToCenter(pos, sign) {
    if (Number.isInteger(pos)) return 1;
    return sign > 0 ? Math.ceil(pos) - pos : pos - Math.floor(pos);
  }

  // ---------------------------------------------------------------------
  // Pac-Man movement + eating
  // ---------------------------------------------------------------------
  function updatePacman(dt) {
    let remaining = pacman.speed * dt;
    while (remaining > 0) {
      if (sameDir(pacman.dir, DIRS.NONE)) {
        if (isOpenTile(pacman.col + pacman.nextDir.x, pacman.row + pacman.nextDir.y, false)) {
          pacman.dir = pacman.nextDir;
        } else {
          break;
        }
      }
      const axis = pacman.dir.x !== 0 ? "col" : "row";
      const sign = pacman.dir.x !== 0 ? pacman.dir.x : pacman.dir.y;
      const distToCenter = distanceToCenter(pacman[axis], sign);

      if (remaining >= distToCenter) {
        if (axis === "col") pacman.col = wrapCol(roundTo(pacman.col + pacman.dir.x * distToCenter));
        else pacman.row = roundTo(pacman.row + pacman.dir.y * distToCenter);
        remaining -= distToCenter;
        eatAt(pacman.col, pacman.row);
        if (isOpenTile(pacman.col + pacman.nextDir.x, pacman.row + pacman.nextDir.y, false)) {
          pacman.dir = pacman.nextDir;
        } else if (!isOpenTile(pacman.col + pacman.dir.x, pacman.row + pacman.dir.y, false)) {
          pacman.dir = DIRS.NONE;
          remaining = 0;
        }
      } else {
        pacman.col = wrapCol(pacman.col + pacman.dir.x * remaining);
        pacman.row += pacman.dir.y * remaining;
        remaining = 0;
      }
    }
  }

  function eatAt(col, row) {
    const r = Math.round(row);
    const c = Math.round(col);
    const item = dots[r] && dots[r][c];
    if (!item) return;
    dots[r][c] = null;
    dotsRemaining--;
    if (item === "dot") {
      state.score += 10;
    } else if (item === "pellet") {
      state.score += 50;
      triggerFrightened();
    }
    updateHud();
    if (dotsRemaining <= 0) {
      startLevelComplete();
    }
  }

  function triggerFrightened() {
    state.frightenedTimer = frightenedDuration();
    state.frightenedCombo = 0;
    for (const g of ghosts) {
      if (g.state === "active") {
        g.dir = reverseOf(g.dir);
        g.mode = "frightened";
      }
    }
  }

  // ---------------------------------------------------------------------
  // Ghost AI: choose a target tile per mode, then at each intersection pick
  // the open, non-reversing direction whose resulting tile is closest
  // (squared distance) to that target. This is the classic simplified rule.
  // ---------------------------------------------------------------------
  function ghostTarget(g) {
    if (g.state === "eaten") return HOUSE_DOOR;
    if (g.state === "exiting" || g.state === "inHouse") return HOUSE_EXIT;
    if (g.mode === "frightened") return null; // random movement
    if (g.mode === "scatter") return g.corner;

    // chase
    const pdir = sameDir(pacman.dir, DIRS.NONE) ? DIRS.LEFT : pacman.dir;
    if (g.name === "red") {
      return { col: pacman.col, row: pacman.row };
    }
    if (g.name === "pink") {
      return { col: pacman.col + pdir.x * 4, row: pacman.row + pdir.y * 4 };
    }
    if (g.name === "cyan") {
      const red = ghosts.find((x) => x.name === "red");
      const pivot = { col: pacman.col + pdir.x * 2, row: pacman.row + pdir.y * 2 };
      return { col: pivot.col * 2 - red.col, row: pivot.row * 2 - red.row };
    }
    // orange: chase when far, retreat to corner when close (shy)
    const dc = g.col - pacman.col;
    const dr = g.row - pacman.row;
    if (dc * dc + dr * dr > 64) {
      return { col: pacman.col, row: pacman.row };
    }
    return g.corner;
  }

  // True shortest-path distance (in tile steps) from every reachable tile to
  // (targetCol, targetRow), via BFS. Ghosts pick the neighbor with the
  // smallest value here rather than straight-line distance to the target --
  // straight-line distance can point a ghost into a pocket whose only exit
  // runs briefly *away* from the target, which a 1-step lookahead can never
  // discover and which then leaves the ghost oscillating in place forever
  // (this maze has a few such pockets flanking the ghost house). BFS-distance
  // guarantees every step actually shortens the real path, so it can't happen.
  function bfsDistanceGrid(targetCol, targetRow, allowHouse) {
    const tc = Math.max(0, Math.min(COLS - 1, Math.round(targetCol)));
    const tr = Math.max(0, Math.min(ROWS - 1, Math.round(targetRow)));
    if (!isOpenTile(tc, tr, allowHouse)) return null;

    const dist = Array.from({ length: ROWS }, () => new Array(COLS).fill(Infinity));
    dist[tr][tc] = 0;
    const queue = [[tc, tr]];
    for (let head = 0; head < queue.length; head++) {
      const [c, r] = queue[head];
      for (const d of DIR_PRIORITY) {
        const nc = wrapCol(c + d.x);
        const nr = r + d.y;
        if (nr < 0 || nr >= ROWS) continue;
        if (!isOpenTile(nc, nr, allowHouse)) continue;
        if (dist[nr][nc] > dist[r][c] + 1) {
          dist[nr][nc] = dist[r][c] + 1;
          queue.push([nc, nr]);
        }
      }
    }
    return dist;
  }

  function chooseGhostDirection(g) {
    const allowHouse = g.state !== "active";
    const candidates = DIR_PRIORITY.filter((d) => {
      if (sameDir(d, reverseOf(g.dir)) && g.state === "active") return false;
      return isOpenTile(g.col + d.x, g.row + d.y, allowHouse);
    });
    if (candidates.length === 0) {
      // dead end: reversing is the only legal option
      return isOpenTile(g.col + reverseOf(g.dir).x, g.row + reverseOf(g.dir).y, allowHouse)
        ? reverseOf(g.dir)
        : g.dir;
    }
    if (g.mode === "frightened" && g.state === "active") {
      return candidates[Math.floor(Math.random() * candidates.length)];
    }
    const target = ghostTarget(g);
    const distGrid = bfsDistanceGrid(target.col, target.row, allowHouse);
    let best = candidates[0];
    let bestDist = Infinity;
    for (const d of candidates) {
      const nc = wrapCol(Math.round(g.col) + d.x);
      const nr = Math.round(g.row) + d.y;
      const dist = distGrid
        ? distGrid[nr]?.[nc] ?? Infinity
        : (nc - target.col) ** 2 + (nr - target.row) ** 2; // fallback if target tile is unreachable
      if (dist < bestDist) {
        bestDist = dist;
        best = d;
      }
    }
    return best;
  }

  function updateGhost(g, dt) {
    if (g.state === "inHouse") {
      g.respawnAt -= dt;
      if (g.respawnAt <= 0 && state.elapsed - state.levelStartElapsed >= g.releaseDelay) {
        g.state = "exiting";
      }
      return;
    }

    const speed =
      g.state === "eaten"
        ? 9
        : g.mode === "frightened"
        ? ghostNormalSpeed() * 0.6
        : ghostNormalSpeed();

    let remaining = speed * dt;
    while (remaining > 0) {
      if (sameDir(g.dir, DIRS.NONE)) {
        g.dir = chooseGhostDirection(g);
      }
      const axis = g.dir.x !== 0 ? "col" : "row";
      const sign = g.dir.x !== 0 ? g.dir.x : g.dir.y;
      const distToCenter = distanceToCenter(g[axis], sign);

      if (remaining >= distToCenter) {
        if (axis === "col") g.col = wrapCol(roundTo(g.col + g.dir.x * distToCenter));
        else g.row = roundTo(g.row + g.dir.y * distToCenter);
        remaining -= distToCenter;
        onGhostArrive(g);
        if (g.state === "inHouse") return; // just got absorbed back into the house
        g.dir = chooseGhostDirection(g);
      } else {
        g.col = wrapCol(g.col + g.dir.x * remaining);
        g.row += g.dir.y * remaining;
        remaining = 0;
      }
    }
  }

  function onGhostArrive(g) {
    const col = Math.round(g.col);
    const row = Math.round(g.row);
    if (g.state === "exiting" && col === HOUSE_EXIT.col && row === HOUSE_EXIT.row) {
      g.state = "active";
      g.mode = state.frightenedTimer > 0 ? "frightened" : state.globalMode;
    } else if (g.state === "eaten" && col === HOUSE_DOOR.col && row >= HOUSE_DOOR.row) {
      g.state = "inHouse";
      g.mode = "scatter";
      g.respawnAt = 1.5;
      g.row = HOUSE_SLOTS[GHOST_DEFS.findIndex((d) => d.name === g.name)].row;
      g.col = HOUSE_SLOTS[GHOST_DEFS.findIndex((d) => d.name === g.name)].col;
    }
  }

  // ---------------------------------------------------------------------
  // Mode scheduling + collisions
  // ---------------------------------------------------------------------
  function updateGlobalMode(dt) {
    if (state.frightenedTimer > 0) {
      state.frightenedTimer -= dt;
      if (state.frightenedTimer <= 0) {
        state.frightenedTimer = 0;
        for (const g of ghosts) {
          if (g.state === "active") g.mode = state.globalMode;
        }
      }
      return;
    }
    state.modeTimer += dt;
    const duration = scatterChaseDurationFor(state.modeIndex);
    if (state.modeTimer >= duration) {
      state.modeTimer = 0;
      // From level 3 on, skip straight to the permanent-chase phase after
      // just one scatter/chase cycle instead of alternating several times --
      // ghosts stay on the hunt for most of the level.
      if (state.level >= 3 && state.modeIndex >= 1) {
        state.modeIndex = MODE_SCHEDULE.length - 1;
      } else {
        state.modeIndex = Math.min(state.modeIndex + 1, MODE_SCHEDULE.length - 1);
      }
      state.globalMode = MODE_SCHEDULE[state.modeIndex].mode;
      for (const g of ghosts) {
        if (g.state === "active") {
          g.dir = reverseOf(g.dir);
          g.mode = state.globalMode;
        }
      }
    }
  }

  function checkCollisions() {
    for (const g of ghosts) {
      if (g.state !== "active") continue;
      const dc = g.col - pacman.col;
      const dr = g.row - pacman.row;
      if (dc * dc + dr * dr > 0.35) continue;

      if (g.mode === "frightened") {
        const points = [200, 400, 800, 1600][Math.min(state.frightenedCombo, 3)];
        state.score += points;
        state.frightenedCombo++;
        g.state = "eaten";
        g.mode = "eaten";
        updateHud();
      } else {
        loseLife();
        return;
      }
    }
  }

  function loseLife() {
    state.lives--;
    updateHud();
    if (state.lives <= 0) {
      endGame(false);
      return;
    }
    resetPositions();
    enterReady();
  }

  function resetPositions() {
    pacman = makePacman();
    ghosts = makeGhosts();
    state.modeIndex = 0;
    state.modeTimer = 0;
    state.globalMode = "scatter";
    state.frightenedTimer = 0;
    state.frightenedCombo = 0;
    state.levelStartElapsed = state.elapsed;
  }

  function enterReady() {
    state.phase = "ready";
    state.readyTimer = 1.4;
  }

  function startLevelComplete() {
    state.phase = "levelcomplete";
    state.levelCompleteTimer = 2;
  }

  function advanceLevel() {
    state.level++;
    setMazeForLevel(state.level);
    resetDots();
    resetPositions();
    enterReady();
  }

  // ---------------------------------------------------------------------
  // Update / render loop
  // ---------------------------------------------------------------------
  function update(dt) {
    state.elapsed += dt;

    if (state.phase === "ready") {
      state.readyTimer -= dt;
      for (const g of ghosts) if (g.bobPhase !== undefined) g.bobPhase += dt;
      if (state.readyTimer <= 0) state.phase = "playing";
      return;
    }
    if (state.phase === "levelcomplete") {
      state.levelCompleteTimer -= dt;
      if (state.levelCompleteTimer <= 0) {
        if (state.level >= WIN_LEVEL) endGame(true);
        else advanceLevel();
      }
      return;
    }
    if (state.phase !== "playing") return;

    updateGlobalMode(dt);
    updatePacman(dt);
    for (const g of ghosts) updateGhost(g, dt);
    checkCollisions();
  }

  function render() {
    ctx.clearRect(0, 0, COLS * TILE, ROWS * TILE);
    drawMaze();
    drawDots();
    if (state.phase !== "menu") {
      drawPacman();
      for (const g of ghosts) drawGhost(g);
    }
    if (state.phase === "ready") drawCenterText("READY!", "#ffd400");
    if (state.phase === "levelcomplete") drawCenterText("LEVEL COMPLETE!", "#00ff00");
  }

  function drawMaze() {
    ctx.fillStyle = "#0000a8";
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (MAZE[row][col] === "#") {
          ctx.fillRect(col * TILE + 1, row * TILE + 1, TILE - 2, TILE - 2);
        }
      }
    }
  }

  function drawDots() {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const item = dots[row][col];
        if (!item) continue;
        const cx = col * TILE + TILE / 2;
        const cy = row * TILE + TILE / 2;
        ctx.fillStyle = "#ffd4b8";
        ctx.beginPath();
        if (item === "dot") {
          ctx.arc(cx, cy, TILE * 0.08, 0, Math.PI * 2);
        } else {
          const pulse = 0.22 + 0.06 * Math.sin(state.elapsed * 6);
          ctx.arc(cx, cy, TILE * pulse, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    }
  }

  function drawPacman() {
    const cx = pacman.col * TILE + TILE / 2;
    const cy = pacman.row * TILE + TILE / 2;
    const r = TILE * 0.45;
    let angle = 0;
    if (sameDir(pacman.dir, DIRS.LEFT)) angle = Math.PI;
    else if (sameDir(pacman.dir, DIRS.UP)) angle = -Math.PI / 2;
    else if (sameDir(pacman.dir, DIRS.DOWN)) angle = Math.PI / 2;

    pacman.mouthPhase += 0.18;
    const mouthOpen = Math.abs(Math.sin(pacman.mouthPhase)) * 0.28 + 0.04;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = "#ffd400";
    ctx.beginPath();
    ctx.arc(0, 0, r, mouthOpen * Math.PI, (2 - mouthOpen) * Math.PI);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawGhost(g) {
    let cx = g.col * TILE + TILE / 2;
    let cy = g.row * TILE + TILE / 2;
    if (g.state === "inHouse" && g.bobPhase !== undefined) {
      cy += Math.sin(g.bobPhase * 3) * 2;
    }
    const r = TILE * 0.45;

    if (g.state !== "eaten") {
      let color = g.color;
      if (g.mode === "frightened") {
        const flashing = state.frightenedTimer < 2 && Math.floor(state.frightenedTimer * 6) % 2 === 0;
        color = flashing ? "#ffffff" : "#2121ff";
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.15, r, Math.PI, 0, false);
      ctx.lineTo(cx + r, cy + r * 0.7);
      for (let i = 0; i < 3; i++) {
        const bx = cx + r - ((i + 0.5) * (2 * r)) / 3;
        ctx.quadraticCurveTo(bx + r / 6, cy + r, bx, cy + r * 0.7);
      }
      ctx.lineTo(cx - r, cy - r * 0.15);
      ctx.closePath();
      ctx.fill();

      if (g.mode !== "frightened") {
        drawEyes(cx, cy, r, g.dir, "#fff", ["#003", "#003"]);
      } else {
        drawEyes(cx, cy, r, DIRS.NONE, "#fff", null);
      }
    } else {
      drawEyes(cx, cy, r, g.dir, "#fff", ["#00f", "#00f"]);
    }
  }

  function drawEyes(cx, cy, r, dir, scleraColor, pupilColors) {
    const ex = r * 0.32;
    const ey = -r * 0.15;
    const er = r * 0.24;
    [-1, 1].forEach((side, i) => {
      const eyeCx = cx + side * ex;
      const eyeCy = cy + ey;
      ctx.fillStyle = scleraColor;
      ctx.beginPath();
      ctx.arc(eyeCx, eyeCy, er, 0, Math.PI * 2);
      ctx.fill();
      if (pupilColors) {
        const pdx = dir.x * er * 0.45;
        const pdy = dir.y * er * 0.45;
        ctx.fillStyle = pupilColors[i];
        ctx.beginPath();
        ctx.arc(eyeCx + pdx, eyeCy + pdy, er * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  function drawCenterText(text, color) {
    ctx.save();
    ctx.font = `bold ${TILE * 0.9}px "Courier New", monospace`;
    ctx.fillStyle = "#000";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const x = (COLS * TILE) / 2;
    const y = (ROWS * TILE) / 2;
    ctx.fillText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y - 1);
    ctx.restore();
  }

  function updateHud() {
    document.getElementById("score-value").textContent = state.score;
    document.getElementById("level-value").textContent = state.level;
    document.getElementById("lives-value").textContent = Math.max(0, state.lives);
  }

  // ---------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------
  const KEY_TO_DIR = {
    ArrowUp: DIRS.UP,
    ArrowDown: DIRS.DOWN,
    ArrowLeft: DIRS.LEFT,
    ArrowRight: DIRS.RIGHT,
    w: DIRS.UP,
    s: DIRS.DOWN,
    a: DIRS.LEFT,
    d: DIRS.RIGHT,
    W: DIRS.UP,
    S: DIRS.DOWN,
    A: DIRS.LEFT,
    D: DIRS.RIGHT,
  };

  window.addEventListener("keydown", (e) => {
    // Let normal typing happen when a form field (e.g. the high-score name
    // input) has focus -- otherwise WASD/arrows/P/Escape get hijacked as
    // game controls instead of reaching the text field.
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) {
      return;
    }
    if (e.key === "p" || e.key === "P" || e.key === "Escape") {
      togglePause();
      return;
    }
    const dir = KEY_TO_DIR[e.key];
    if (dir) {
      pacman.nextDir = dir;
      e.preventDefault();
    }
  });

  function togglePause() {
    if (state.phase === "playing") {
      state.phase = "paused";
      document.getElementById("pause-overlay").classList.remove("hidden");
    } else if (state.phase === "paused") {
      state.phase = "playing";
      document.getElementById("pause-overlay").classList.add("hidden");
    }
  }

  // ---------------------------------------------------------------------
  // Leaderboard integration
  // ---------------------------------------------------------------------
  async function fetchLeaderboard() {
    try {
      const res = await fetch("/api/leaderboard");
      if (!res.ok) throw new Error("bad response");
      return await res.json();
    } catch (err) {
      console.error("Failed to fetch leaderboard", err);
      return [];
    }
  }

  function renderLeaderboard(listEl, entries, highlight) {
    listEl.innerHTML = "";
    if (entries.length === 0) {
      const li = document.createElement("li");
      li.className = "lb-empty";
      li.textContent = "No scores yet -- be the first!";
      listEl.appendChild(li);
      return;
    }
    for (const entry of entries) {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.textContent = entry.name;
      const score = document.createElement("span");
      score.textContent = entry.score;
      li.appendChild(name);
      li.appendChild(score);
      if (
        highlight &&
        entry.name === highlight.name &&
        entry.score === highlight.score &&
        !li.dataset.matched
      ) {
        li.classList.add("highlight");
        li.dataset.matched = "1";
        highlight.matched = true;
      }
      listEl.appendChild(li);
    }
  }

  async function refreshMenuLeaderboard() {
    const entries = await fetchLeaderboard();
    renderLeaderboard(document.getElementById("menu-leaderboard"), entries, null);
  }

  // ---------------------------------------------------------------------
  // Game state transitions / overlays
  // ---------------------------------------------------------------------
  const menuOverlay = document.getElementById("menu-overlay");
  const pauseOverlay = document.getElementById("pause-overlay");
  const endOverlay = document.getElementById("end-overlay");
  const endTitle = document.getElementById("end-title");
  const endScore = document.getElementById("end-score");
  const nameForm = document.getElementById("name-form");
  const nameInput = document.getElementById("name-input");
  const submitStatus = document.getElementById("submit-status");
  const endLeaderboardList = document.getElementById("end-leaderboard");

  function startGame() {
    state.score = 0;
    state.lives = 3;
    state.level = 1;
    state.elapsed = 0;
    setMazeForLevel(1);
    resetDots();
    resetPositions();
    updateHud();
    menuOverlay.classList.add("hidden");
    endOverlay.classList.add("hidden");
    nameForm.classList.remove("hidden");
    submitStatus.textContent = "";
    nameInput.value = "";
    enterReady();
  }

  function endGame(won) {
    state.phase = "gameover";
    endTitle.textContent = won ? "YOU WIN!" : "GAME OVER";
    endScore.textContent = `Final score: ${state.score}`;
    endOverlay.classList.remove("hidden");
    fetchLeaderboard().then((entries) => renderLeaderboard(endLeaderboardList, entries, null));
  }

  document.getElementById("start-button").addEventListener("click", startGame);
  window.addEventListener("keydown", (e) => {
    if (state.phase === "menu" && (e.key === "Enter" || e.key === " ")) startGame();
  });
  document.getElementById("restart-button").addEventListener("click", () => {
    endOverlay.classList.add("hidden");
    menuOverlay.classList.remove("hidden");
    refreshMenuLeaderboard();
    state.phase = "menu";
  });

  nameForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const rawName = nameInput.value;
    const sanitized = rawName
      .replace(/[^a-zA-Z0-9 ]/g, "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 12);
    if (sanitized.length < 3) {
      submitStatus.textContent = "Name must be 3-12 letters/numbers.";
      return;
    }
    submitStatus.textContent = "Submitting...";
    try {
      const res = await fetch("/api/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: sanitized, score: state.score }),
      });
      if (res.status === 429) {
        submitStatus.textContent = "Too many submissions -- try again in a minute.";
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        submitStatus.textContent = body.error || "Could not submit score.";
        return;
      }
      const top10 = await res.json();
      submitStatus.textContent = "Score submitted!";
      nameForm.classList.add("hidden");
      renderLeaderboard(endLeaderboardList, top10, { name: sanitized, score: state.score });
    } catch (err) {
      submitStatus.textContent = "Network error -- could not submit score.";
    }
  });

  // ---------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------
  resetDots();
  updateHud();
  resizeCanvasDisplay();
  refreshMenuLeaderboard();

  let lastTime = performance.now();
  function tick(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    update(dt);
    render();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
