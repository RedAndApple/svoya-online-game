const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { generateGameData, resetUsedQuestions } = require("./questionEngine");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static("public"));

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "svoya-online-game",
    roomsCount: rooms.size,
    uptime: process.uptime(),
    time: new Date().toISOString()
  });
});

app.get("/api/rooms", (req, res) => {
  res.json({
    rooms: Array.from(rooms.values()).map(room => ({
      code: room.code,
      players: Object.keys(room.players || {}).length,
      hasHost: !!room.hostId,
      round: room.state?.round ?? 0,
      createdPreset: room.state?.roomPreset || "classic"
    }))
  });
});

const PORT = process.env.PORT || 3000;
const rooms = new Map();
const SNAPSHOT_PATH = require("path").join(__dirname, "roomsSnapshot.json");

function saveRoomsSnapshot() {
  try {
    const data = Array.from(rooms.entries()).map(([code, room]) => [code, {
      ...room,
      hostId: null
    }]);
    require("fs").writeFileSync(SNAPSHOT_PATH, JSON.stringify({ rooms: data, updatedAt: new Date().toISOString() }, null, 2), "utf8");
  } catch (e) {
    console.error("Snapshot save failed:", e.message);
  }
}

function loadRoomsSnapshot() {
  try {
    if (!require("fs").existsSync(SNAPSHOT_PATH)) return;
    const raw = JSON.parse(require("fs").readFileSync(SNAPSHOT_PATH, "utf8"));
    if (!Array.isArray(raw.rooms)) return;
    for (const [code, room] of raw.rooms) {
      if (!room || !room.code || !room.gameData || !room.state) continue;
      room.hostId = null;
      rooms.set(code, room);
    }
    console.log(`Loaded ${rooms.size} room snapshots`);
  } catch (e) {
    console.error("Snapshot load failed:", e.message);
  }
}

loadRoomsSnapshot();

function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function createRoom(hostId, topic, settings = {}, preset = "classic") {
  let code;
  do code = makeRoomCode(); while (rooms.has(code));

  const seed = `${code}-${Date.now()}-${Math.random()}`;
  const gameData = generateGameData({ seed, topic });

  const room = {
    code,
    hostId,
    gameData,
    players: {},
    state: {
      teamNames: ["Черные короли", "Усатые карлики"],
      teamAvatars: ["/assets/team1.jpeg", "/assets/team2.jpeg"],
      scores: [0, 0],
      round: 0,
      chooser: 0,
      used: {},
      currentQuestion: null,
      buzzes: [],
      finalApplied: [false, false],
      lastActions: [],
      timer: {
        active: false,
        duration: 30,
        startedAt: null
      },
      buzzLocked: false,
      winner: null,
      settings: {
        defaultTimer: 30,
        allowNegativeScores: true,
        autoLockAfterFirstBuzz: false
      },
      eventLog: [],
      teamWagers: [null, null],
      appeals: [],
      teamNotes: ["", ""],
      reports: [],
      kickedPlayers: {},
      roomPreset: "classic"
    }
  };

  room.state.roomPreset = sanitizeText(preset || "classic", 40);

  Object.assign(room.state.settings, {
    defaultTimer: [15, 30, 45, 60, 90].includes(Number(settings.defaultTimer)) ? Number(settings.defaultTimer) : 30,
    allowNegativeScores: settings.allowNegativeScores !== false,
    autoLockAfterFirstBuzz: !!settings.autoLockAfterFirstBuzz
  });

  rooms.set(code, room);
  saveRoomsSnapshot();
  return room;
}

function publicRoom(room) {
  return {
    code: room.code,
    players: room.players,
    gameData: room.gameData,
    state: room.state
  };
}

function emitRoom(code) {
  const room = rooms.get(code);
  if (!room) return;
  io.to(code).emit("room:update", publicRoom(room));
}

function getRoomBySocket(socket) {
  const code = socket.data.roomCode;
  if (!code) return null;
  return rooms.get(code);
}

function isHost(socket, room) {
  return room && room.hostId === socket.id;
}

const bannedTextPatterns = [
  /экстремизм/iu,
  /нацизм/iu,
  /террор/iu
];

function sanitizeText(text, max = 200) {
  text = String(text || "").trim().slice(0, max);
  for (const pattern of bannedTextPatterns) {
    text = text.replace(pattern, "[скрыто]");
  }
  return text;
}

function containsBlockedText(text) {
  return bannedTextPatterns.some(pattern => pattern.test(String(text || "")));
}

function validateImportedGameData(data) {
  if (!data || !Array.isArray(data.rounds) || data.rounds.length !== 3) return false;
  for (let r = 0; r < 3; r++) {
    const round = data.rounds[r];
    if (!round || !Array.isArray(round.categories) || round.categories.length !== 5) return false;
    round.name = round.name || `Раунд ${r + 1}`;
    round.multiplier = r + 1;

    for (const cat of round.categories) {
      if (!cat || typeof cat.title !== "string" || !Array.isArray(cat.qs) || cat.qs.length !== 5) return false;
      for (const qa of cat.qs) {
        if (!Array.isArray(qa) || qa.length !== 2) return false;
        if (typeof qa[0] !== "string" || typeof qa[1] !== "string") return false;
      }
    }
  }

  if (!data.final || typeof data.final.question !== "string" || typeof data.final.answer !== "string") return false;
  data.final.theme = data.final.theme || "Финал";
  return true;
}

function logEvent(room, text, type = "info") {
  if (!room.state.eventLog) room.state.eventLog = [];
  room.state.eventLog.push({
    id: `${Date.now()}-${Math.random()}`,
    type,
    text,
    at: Date.now()
  });
  room.state.eventLog = room.state.eventLog.slice(-80);
}

function applyScore(room, team, delta) {
  if (!room.state.settings?.allowNegativeScores) {
    room.state.scores[team] = Math.max(0, room.state.scores[team] + delta);
  } else {
    room.state.scores[team] += delta;
  }
}

io.on("connection", socket => {
  socket.on("host:reclaim", ({ code }) => {
    code = String(code || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return socket.emit("error:message", "Комната не найдена.");

    room.hostId = socket.id;
    socket.data.roomCode = code;
    socket.data.role = "host";
    socket.join(code);
    socket.emit("host:created", publicRoom(room));
    emitRoom(code);
  });

  socket.on("host:create", ({ topic, settings, preset } = {}) => {
    try {
      const room = createRoom(socket.id, topic, settings, preset);
      socket.data.roomCode = room.code;
      socket.data.role = "host";
      socket.join(room.code);
      socket.emit("host:created", publicRoom(room));
      console.log(`Room created: ${room.code}`);
      emitRoom(room.code);
    } catch (err) {
      console.error(err);
      socket.emit("error:message", "Не удалось создать комнату.");
    }
  });

  socket.on("spectator:join", ({ code }) => {
    code = String(code || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return socket.emit("error:message", "Комната не найдена.");

    socket.data.roomCode = code;
    socket.data.role = "spectator";
    socket.join(code);
    socket.emit("spectator:joined", publicRoom(room));
    emitRoom(code);
  });

  socket.on("player:join", ({ code, name, team }) => {
    code = String(code || "").trim().toUpperCase();
    name = sanitizeText(name, 30);
    team = Number(team);

    const room = rooms.get(code);
    if (!room) return socket.emit("error:message", "Комната не найдена.");
    if (room.state.kickedPlayers && room.state.kickedPlayers[name.toLowerCase()]) return socket.emit("error:message", "Этот игрок удален из комнаты.");
    if (!name) return socket.emit("error:message", "Введите имя.");
    if (![0,1].includes(team)) return socket.emit("error:message", "Выберите команду.");

    const teamCount = Object.values(room.players).filter(p => p.team === team).length;
    if (teamCount >= 6) return socket.emit("error:message", "В этой команде уже 6 игроков.");

    room.players[socket.id] = {
      id: socket.id,
      name,
      team,
      connected: true,
      ready: false,
      captain: false
    };

    socket.data.roomCode = code;
    socket.data.role = "player";
    socket.join(code);
    socket.emit("player:joined", publicRoom(room));
    console.log(`Player joined: ${name} -> ${code}`);
    emitRoom(code);
  });

  socket.on("host:openQuestion", ({ round, cat, q }) => {
    const room = getRoomBySocket(socket);
    if (!isHost(socket, room)) return;

    const r = room.gameData.rounds[round];
    if (!r || !r.categories[cat] || !r.categories[cat].qs[q]) return;

    const key = `${round}-${cat}-${q}`;
    if (room.state.used[key]) return;

    const value = (q + 1) * 100 * r.multiplier;
    const question = r.categories[cat].qs[q];

    room.state.currentQuestion = {
      key,
      round,
      cat,
      q,
      theme: r.categories[cat].title,
      value,
      text: question[0],
      answer: question[1],
      answerShown: false
    };
    room.state.buzzes = [];
    room.state.timer = {
      active: true,
      duration: room.state.settings?.defaultTimer || room.state.timer?.duration || 30,
      startedAt: Date.now()
    };
    room.state.buzzLocked = false;
    emitRoom(room.code);
  });

  socket.on("player:buzz", () => {
    const room = getRoomBySocket(socket);
    if (!room || !room.state.currentQuestion || room.state.buzzLocked) return;

    const player = room.players[socket.id];
    if (!player) return;

    const already = room.state.buzzes.find(b => b.id === socket.id);
    if (already) return;

    room.state.buzzes.push({
      id: socket.id,
      name: player.name,
      team: player.team,
      at: Date.now()
    });

    logEvent(room, `Нажал: ${player.name} (${room.state.teamNames[player.team]})`, "buzz");
    if (room.state.settings?.autoLockAfterFirstBuzz && room.state.buzzes.length === 1) {
      room.state.buzzLocked = true;
    }

    emitRoom(room.code);
  });

  socket.on("host:showAnswer", () => {
    const room = getRoomBySocket(socket);
    if (!isHost(socket, room) || !room.state.currentQuestion) return;
    room.state.currentQuestion.answerShown = true;
    emitRoom(room.code);
  });

  socket.on("host:award", ({ playerId, correct }) => {
    const room = getRoomBySocket(socket);
    if (!isHost(socket, room) || !room.state.currentQuestion) return;

    const player = room.players[playerId];
    if (!player) return;

    const team = player.team;
    const value = room.state.currentQuestion.value;

    const delta = correct ? value : -value;

    applyScore(room, team, delta);
    room.state.lastActions.push({
      type: "award",
      team,
      delta,
      questionKey: room.state.currentQuestion.key,
      questionText: room.state.currentQuestion.text,
      at: Date.now()
    });
    room.state.lastActions = room.state.lastActions.slice(-20);
    logEvent(room, `${correct ? "Верно" : "Неверно"}: ${player.name}, ${room.state.teamNames[team]}, ${delta > 0 ? "+" : ""}${delta}`, correct ? "success" : "danger");

    room.state.chooser = correct ? team : (team === 0 ? 1 : 0);
    room.state.used[room.state.currentQuestion.key] = true;
    room.state.currentQuestion = null;
    room.state.buzzes = [];
    room.state.timer = { active: false, duration: 30, startedAt: null };
    room.state.buzzLocked = false;
    room.state.winner = null;

    emitRoom(room.code);
  });

  socket.on("host:nobody", () => {
    const room = getRoomBySocket(socket);
    if (!isHost(socket, room) || !room.state.currentQuestion) return;

    room.state.lastActions.push({
      type: "nobody",
      team: null,
      delta: 0,
      questionKey: room.state.currentQuestion.key,
      questionText: room.state.currentQuestion.text,
      at: Date.now()
    });
    room.state.lastActions = room.state.lastActions.slice(-20);

    room.state.used[room.state.currentQuestion.key] = true;
    room.state.chooser = room.state.chooser === 0 ? 1 : 0;
    room.state.currentQuestion = null;
    room.state.buzzes = [];
    room.state.timer = { active: false, duration: 30, startedAt: null };

    emitRoom(room.code);
  });

  socket.on("host:setRound", ({ round }) => {
    const room = getRoomBySocket(socket);
    if (!isHost(socket, room)) return;
    round = Number(round);
    if (round < 0 || round > 2) return;
    room.state.round = round;
    room.state.currentQuestion = null;
    room.state.buzzes = [];
    room.state.timer = { active: false, duration: 30, startedAt: null };
    emitRoom(room.code);
  });

  socket.on("host:finalApply", ({ team, wager, correct }) => {
    const room = getRoomBySocket(socket);
    if (!isHost(socket, room)) return;

    team = Number(team);
    wager = Math.max(0, Number(wager || 0));
    if (![0,1].includes(team)) return;
    if (room.state.finalApplied[team]) return;

    wager = Math.min(wager, Math.max(0, room.state.scores[team]));
    applyScore(room, team, correct ? wager : -wager);
    room.state.finalApplied[team] = true;
    logEvent(room, `Финал: ${room.state.teamNames[team]} ${correct ? "верно" : "неверно"}, ставка ${wager}`, correct ? "success" : "danger");
    saveRoomsSnapshot();

    emitRoom(room.code);
  });

  socket.on("host:reset", () => {
    const room = getRoomBySocket(socket);
    if (!isHost(socket, room)) return;

    room.state.scores = [0, 0];
    room.state.round = 0;
    room.state.chooser = 0;
    room.state.used = {};
    room.state.currentQuestion = null;
    room.state.buzzes = [];
    room.state.finalApplied = [false, false];
    room.state.lastActions = [];
    room.state.timer = { active: false, duration: 30, startedAt: null };

    emitRoom(room.code);
  });


  socket.on("host:setTimer", ({ duration }) => {
    const room = getRoomBySocket(socket);
    if (!isHost(socket, room)) return;

    duration = Number(duration);
    if (![15, 30, 45, 60, 90].includes(duration)) duration = 30;

    room.state.timer = {
      active: !!room.state.currentQuestion,
      duration,
      startedAt: room.state.currentQuestion ? Date.now() : null
    };

    emitRoom(room.code);
  });

  socket.on("host:stopTimer", () => {
    const room = getRoomBySocket(socket);
    if (!isHost(socket, room)) return;

    room.state.timer = {
      active: false,
      duration: room.state.timer?.duration || 30,
      startedAt: null
    };

    emitRoom(room.code);
  });

  socket.on("host:undoLastAction", () => {
    const room = getRoomBySocket(socket);
    if (!isHost(socket, room)) return;

    const action = room.state.lastActions.pop();
    if (!action) return socket.emit("error:message", "Нечего отменять.");

    if (action.type === "award") {
      room.state.scores[action.team] -= action.delta;
      if (action.questionKey) delete room.state.used[action.questionKey];
      socket.emit("error:message", "Последнее начисление отменено. Вопрос снова доступен.");
    } else if (action.type === "nobody") {
      if (action.questionKey) delete room.state.used[action.questionKey];
      socket.emit("error:message", "Последнее действие отменено. Вопрос снова доступен.");
    } else if (action.type === "manual") {
      room.state.scores[action.team] -= action.delta;
      socket.emit("error:message", "Ручная корректировка отменена.");
    }

    emitRoom(room.code);
  });


  socket.on("player:setReady", ({ ready }) => {
    const room = getRoomBySocket(socket);
    if (!room || socket.data.role !== "player" || !room.players[socket.id]) return;

    room.players[socket.id].ready = !!ready;
    emitRoom(room.code);
  });

  socket.on("host:setBuzzLocked", ({ locked }) => {
    const room = getRoomBySocket(socket);
    if (!isHost(socket, room)) return;

    room.state.buzzLocked = !!locked;
    emitRoom(room.code);
  });

  socket.on("host:adjustScore", ({ team, delta }) => {
    const room = getRoomBySocket(socket);
    if (!isHost(socket, room)) return;

    team = Number(team);
    delta = Number(delta);
    if (![0, 1].includes(team) || !Number.isFinite(delta)) return;

    applyScore(room, team, delta);
    room.state.lastActions.push({
      type: "manual",
      team,
      delta,
      questionKey: null,
      questionText: "Ручная корректировка очков",
      at: Date.now()
    });
    room.state.lastActions = room.state.lastActions.slice(-20);
    logEvent(room, `Ручная корректировка: ${room.state.teamNames[team]} ${delta > 0 ? "+" : ""}${delta}`, "info");
    saveRoomsSnapshot();
    emitRoom(room.code);
  });

  socket.on("host:replaceGameData", ({ gameData }) => {
    const room = getRoomBySocket(socket);
    if (!isHost(socket, room)) return;

    if (!validateImportedGameData(gameData)) {
      return socket.emit("error:message", "Файл вопросов не подходит по структуре.");
    }

    room.gameData = gameData;
    room.state.round = 0;
    room.state.used = {};
    room.state.currentQuestion = null;
    room.state.buzzes = [];
    room.state.finalApplied = [false, false];
    room.state.timer = { active: false, duration: 30, startedAt: null };
    room.state.buzzLocked = false;
    room.state.winner = null;

    socket.emit("error:message", "Пакет вопросов загружен.");
    emitRoom(room.code);
  });

  socket.on("host:finishGame", () => {
    const room = getRoomBySocket(socket);
    if (!isHost(socket, room)) return;

    const s0 = room.state.scores[0];
    const s1 = room.state.scores[1];

    room.state.winner = s0 === s1
      ? { type: "draw", title: "Ничья", subtitle: `${s0} : ${s1}` }
      : s0 > s1
        ? { type: "team", team: 0, title: `Победили ${room.state.teamNames[0]}`, subtitle: `${s0} : ${s1}` }
        : { type: "team", team: 1, title: `Победили ${room.state.teamNames[1]}`, subtitle: `${s1} : ${s0}` };

    emitRoom(room.code);
  });

  socket.on("host:clearWinner", () => {
    const room = getRoomBySocket(socket);
    if (!isHost(socket, room)) return;
    room.state.winner = null;
    emitRoom(room.code);
  });


  socket.on("host:updateSettings", ({ settings }) => {
    const room = getRoomBySocket(socket);
    if (!isHost(socket, room)) return;

    room.state.settings = room.state.settings || {};
    if ([15, 30, 45, 60, 90].includes(Number(settings?.defaultTimer))) {
      room.state.settings.defaultTimer = Number(settings.defaultTimer);
    }
    if (typeof settings?.allowNegativeScores === "boolean") {
      room.state.settings.allowNegativeScores = settings.allowNegativeScores;
    }
    if (typeof settings?.autoLockAfterFirstBuzz === "boolean") {
      room.state.settings.autoLockAfterFirstBuzz = settings.autoLockAfterFirstBuzz;
    }

    logEvent(room, "Настройки комнаты обновлены", "info");
    saveRoomsSnapshot();
    emitRoom(room.code);
  });

  socket.on("host:setCaptain", ({ playerId }) => {
    const room = getRoomBySocket(socket);
    if (!isHost(socket, room)) return;

    const player = room.players[playerId];
    if (!player) return;

    for (const p of Object.values(room.players)) {
      if (p.team === player.team) p.captain = false;
    }
    player.captain = true;

    logEvent(room, `${player.name} назначен капитаном команды ${room.state.teamNames[player.team]}`, "info");
    saveRoomsSnapshot();
    emitRoom(room.code);
  });

  socket.on("player:appeal", ({ text }) => {
    const room = getRoomBySocket(socket);
    if (!room || socket.data.role !== "player") return;
    const player = room.players[socket.id];
    if (!player) return;

    text = sanitizeText(text, 220);
    if (!text) return;

    room.state.appeals = room.state.appeals || [];
    room.state.appeals.push({
      id: `${Date.now()}-${Math.random()}`,
      playerId: socket.id,
      playerName: player.name,
      team: player.team,
      text,
      status: "open",
      at: Date.now()
    });
    room.state.appeals = room.state.appeals.slice(-30);
    logEvent(room, `Апелляция: ${player.name} — ${text}`, "appeal");
    emitRoom(room.code);
  });

  socket.on("host:resolveAppeal", ({ appealId, accepted }) => {
    const room = getRoomBySocket(socket);
    if (!isHost(socket, room)) return;

    const appeal = (room.state.appeals || []).find(a => a.id === appealId);
    if (!appeal) return;
    appeal.status = accepted ? "accepted" : "rejected";
    logEvent(room, `Апелляция ${accepted ? "принята" : "отклонена"}: ${appeal.playerName}`, accepted ? "success" : "danger");
    emitRoom(room.code);
  });

  socket.on("player:submitWager", ({ wager }) => {
    const room = getRoomBySocket(socket);
    if (!room || socket.data.role !== "player") return;
    const player = room.players[socket.id];
    if (!player) return;

    const hasCaptain = Object.values(room.players).some(p => p.team === player.team && p.captain);
    if (hasCaptain && !player.captain) return socket.emit("error:message", "Ставку финала отправляет капитан.");

    wager = Math.max(0, Number(wager || 0));
    wager = Math.min(wager, Math.max(0, room.state.scores[player.team]));
    room.state.teamWagers[player.team] = {
      team: player.team,
      wager,
      by: player.name,
      at: Date.now()
    };

    logEvent(room, `${room.state.teamNames[player.team]} отправили финальную ставку`, "info");
    emitRoom(room.code);
  });

  socket.on("player:updateTeamNote", ({ text }) => {
    const room = getRoomBySocket(socket);
    if (!room || socket.data.role !== "player") return;
    const player = room.players[socket.id];
    if (!player) return;

    const hasCaptain = Object.values(room.players).some(p => p.team === player.team && p.captain);
    if (hasCaptain && !player.captain) return;

    text = sanitizeText(text, 500);
    room.state.teamNotes[player.team] = text;
    emitRoom(room.code);
  });

  socket.on("host:clearEventLog", () => {
    const room = getRoomBySocket(socket);
    if (!isHost(socket, room)) return;
    room.state.eventLog = [];
    emitRoom(room.code);
  });


  socket.on("player:report", ({ targetPlayerId, reason }) => {
    const room = getRoomBySocket(socket);
    if (!room || socket.data.role !== "player") return;

    const reporter = room.players[socket.id];
    const target = room.players[targetPlayerId];
    if (!reporter || !target) return;

    reason = sanitizeText(reason, 240) || "Без причины";

    room.state.reports = room.state.reports || [];
    room.state.reports.push({
      id: `${Date.now()}-${Math.random()}`,
      reporterId: socket.id,
      reporterName: reporter.name,
      targetPlayerId,
      targetName: target.name,
      targetTeam: target.team,
      reason,
      status: "open",
      at: Date.now()
    });
    room.state.reports = room.state.reports.slice(-50);

    logEvent(room, `Жалоба: ${reporter.name} на ${target.name}`, "appeal");
    saveRoomsSnapshot();
    emitRoom(room.code);
  });

  socket.on("host:resolveReport", ({ reportId, accepted }) => {
    const room = getRoomBySocket(socket);
    if (!isHost(socket, room)) return;

    const report = (room.state.reports || []).find(r => r.id === reportId);
    if (!report) return;
    report.status = accepted ? "accepted" : "rejected";

    logEvent(room, `Жалоба ${accepted ? "принята" : "отклонена"}: ${report.targetName}`, accepted ? "success" : "danger");
    saveRoomsSnapshot();
    emitRoom(room.code);
  });

  socket.on("host:kickPlayer", ({ playerId }) => {
    const room = getRoomBySocket(socket);
    if (!isHost(socket, room)) return;

    const player = room.players[playerId];
    if (!player) return;

    room.state.kickedPlayers = room.state.kickedPlayers || {};
    room.state.kickedPlayers[player.name.toLowerCase()] = true;
    delete room.players[playerId];

    io.to(playerId).emit("error:message", "Ведущий удалил вас из комнаты.");
    io.sockets.sockets.get(playerId)?.leave(room.code);

    logEvent(room, `Игрок удален: ${player.name}`, "danger");
    saveRoomsSnapshot();
    emitRoom(room.code);
  });

  socket.on("host:resetUsedQuestions", () => {
    const room = getRoomBySocket(socket);
    if (!isHost(socket, room)) return;

    resetUsedQuestions();
    socket.emit("error:message", "История использованных вопросов сброшена.");
  });

  socket.on("disconnect", () => {
    const room = getRoomBySocket(socket);
    if (!room) return;

    if (socket.data.role === "player" && room.players[socket.id]) {
      room.players[socket.id].connected = false;
      emitRoom(room.code);
    }

    if (socket.data.role === "host") {
      room.hostId = null;
      io.to(room.code).emit("error:message", "Ведущий отключился. Комната сохранена. Ведущий может восстановить комнату по коду.");
      saveRoomsSnapshot();
      emitRoom(room.code);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Game server running on http://localhost:${PORT}`);
});