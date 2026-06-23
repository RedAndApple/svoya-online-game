const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { generateGameData } = require("./questionEngine");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  pingInterval: 25000,
  pingTimeout: 20000
});

const PORT = process.env.PORT || 3000;
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const rooms = new Map();

app.use(express.static("public", {
  etag: false,
  maxAge: 0,
  setHeaders(res) {
    res.setHeader("Cache-Control", "no-store");
  }
}));

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    roomsCount: rooms.size,
    uptime: process.uptime(),
    time: new Date().toISOString()
  });
});

app.get("/api/rooms", (req, res) => {
  res.json({
    rooms: Array.from(rooms.values()).map(room => ({
      code: room.code,
      players: Object.keys(room.players).length,
      hasHost: !!room.hostSocketId,
      round: room.state.round,
      createdAt: room.createdAt
    }))
  });
});

function sanitizeText(value, max = 40) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
}

function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function publicRoom(room, forRole = "player") {
  return {
    code: room.code,
    createdAt: room.createdAt,
    players: room.players,
    gameData: room.gameData,
    state: room.state,
    forRole
  };
}

function getRoom(code) {
  return rooms.get(String(code || "").trim().toUpperCase());
}

function getSocketRoom(socket) {
  return getRoom(socket.data.roomCode);
}

function isHost(socket, room) {
  return room && room.hostSocketId === socket.id;
}

function emitRoom(code) {
  const room = getRoom(code);
  if (!room) return;
  room.updatedAt = Date.now();
  io.to(room.code).emit("room:update", publicRoom(room));
}

function createRoom(hostSocketId, topic = "") {
  let code;
  do code = makeRoomCode(); while (rooms.has(code));

  const room = {
    code,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    hostSocketId,
    gameData: generateGameData({ seed: `${code}-${Date.now()}`, topic }),
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
      buzzLocked: false,
      answerShown: false,
      timer: { active: false, duration: 30, startedAt: null },
      finalApplied: [false, false],
      finalWagers: [null, null],
      lastActions: [],
      winner: null,
      eventLog: []
    }
  };

  rooms.set(code, room);
  console.log(`Room created: ${code}`);
  return room;
}

function logEvent(room, text, type = "info") {
  room.state.eventLog.push({ text, type, at: Date.now() });
  room.state.eventLog = room.state.eventLog.slice(-60);
}

function closeQuestion(room, markUsed = true) {
  if (room.state.currentQuestion && markUsed) {
    room.state.used[room.state.currentQuestion.key] = true;
  }
  room.state.currentQuestion = null;
  room.state.buzzes = [];
  room.state.buzzLocked = false;
  room.state.answerShown = false;
  room.state.timer = { active: false, duration: room.state.timer.duration || 30, startedAt: null };
}

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const hasSockets = io.sockets.adapter.rooms.has(code);
    if (!hasSockets && now - room.updatedAt > ROOM_TTL_MS) {
      rooms.delete(code);
      console.log(`Room expired: ${code}`);
    }
  }
}, 10 * 60 * 1000);

io.on("connection", socket => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on("host:create", ({ topic } = {}) => {
    const room = createRoom(socket.id, sanitizeText(topic, 120));
    socket.data.role = "host";
    socket.data.roomCode = room.code;
    socket.join(room.code);
    socket.emit("host:created", publicRoom(room, "host"));
    emitRoom(room.code);
  });

  socket.on("host:reclaim", ({ code }) => {
    const room = getRoom(code);
    if (!room) return socket.emit("error:message", "Комната не найдена.");

    room.hostSocketId = socket.id;
    socket.data.role = "host";
    socket.data.roomCode = room.code;
    socket.join(room.code);

    logEvent(room, "Ведущий восстановил управление комнатой");
    socket.emit("host:created", publicRoom(room, "host"));
    emitRoom(room.code);
  });

  socket.on("display:join", ({ code }) => {
    const room = getRoom(code);
    if (!room) return socket.emit("error:message", "Комната не найдена.");

    socket.data.role = "display";
    socket.data.roomCode = room.code;
    socket.join(room.code);
    socket.emit("display:joined", publicRoom(room, "display"));
    emitRoom(room.code);
  });

  socket.on("player:join", ({ code, name, team }) => {
    const room = getRoom(code);
    if (!room) return socket.emit("error:message", "Комната не найдена.");

    name = sanitizeText(name, 30);
    team = Number(team);

    if (!name) return socket.emit("error:message", "Введите имя.");
    if (![0, 1].includes(team)) return socket.emit("error:message", "Выберите команду.");

    const teamCount = Object.values(room.players).filter(p => p.team === team).length;
    if (teamCount >= 6) return socket.emit("error:message", "В команде уже 6 игроков.");

    room.players[socket.id] = {
      id: socket.id,
      name,
      team,
      ready: false,
      connected: true
    };

    socket.data.role = "player";
    socket.data.roomCode = room.code;
    socket.join(room.code);

    logEvent(room, `${name} вошел в команду ${room.state.teamNames[team]}`, "join");
    socket.emit("player:joined", publicRoom(room, "player"));
    emitRoom(room.code);
    console.log(`Player joined: ${name} -> ${room.code}`);
  });

  socket.on("player:ready", ({ ready }) => {
    const room = getSocketRoom(socket);
    if (!room || !room.players[socket.id]) return;
    room.players[socket.id].ready = !!ready;
    emitRoom(room.code);
  });

  socket.on("host:openQuestion", ({ round, cat, q }) => {
    const room = getSocketRoom(socket);
    if (!isHost(socket, room)) return;

    round = Number(round);
    cat = Number(cat);
    q = Number(q);

    const roundData = room.gameData.rounds[round];
    const qa = roundData?.categories?.[cat]?.qs?.[q];
    if (!qa) return;

    const key = `${round}-${cat}-${q}`;
    if (room.state.used[key]) return;

    const value = (q + 1) * 100 * roundData.multiplier;

    room.state.currentQuestion = {
      key,
      round,
      cat,
      q,
      theme: roundData.categories[cat].title,
      value,
      text: qa[0],
      answer: qa[1]
    };
    room.state.buzzes = [];
    room.state.buzzLocked = false;
    room.state.answerShown = false;
    room.state.timer = {
      active: true,
      duration: room.state.timer.duration || 30,
      startedAt: Date.now()
    };

    logEvent(room, `Открыт вопрос: ${room.state.currentQuestion.theme} ${value}`, "question");
    emitRoom(room.code);
  });

  socket.on("player:buzz", () => {
    const room = getSocketRoom(socket);
    if (!room || !room.state.currentQuestion || room.state.buzzLocked) return;

    const player = room.players[socket.id];
    if (!player) return;
    if (room.state.buzzes.some(b => b.id === socket.id)) return;

    room.state.buzzes.push({
      id: socket.id,
      name: player.name,
      team: player.team,
      at: Date.now()
    });

    logEvent(room, `Нажал: ${player.name}`, "buzz");
    emitRoom(room.code);
  });

  socket.on("host:setBuzzLocked", ({ locked }) => {
    const room = getSocketRoom(socket);
    if (!isHost(socket, room)) return;
    room.state.buzzLocked = !!locked;
    emitRoom(room.code);
  });

  socket.on("host:showAnswer", () => {
    const room = getSocketRoom(socket);
    if (!isHost(socket, room) || !room.state.currentQuestion) return;
    room.state.answerShown = true;
    emitRoom(room.code);
  });

  socket.on("host:award", ({ playerId, correct }) => {
    const room = getSocketRoom(socket);
    if (!isHost(socket, room) || !room.state.currentQuestion) return;

    const player = room.players[playerId];
    if (!player) return;

    const team = player.team;
    const value = room.state.currentQuestion.value;
    const delta = correct ? value : -value;

    room.state.scores[team] += delta;
    room.state.lastActions.push({
      type: "award",
      team,
      delta,
      question: room.state.currentQuestion,
      previousChooser: room.state.chooser
    });
    room.state.lastActions = room.state.lastActions.slice(-20);

    room.state.chooser = correct ? team : team === 0 ? 1 : 0;
    logEvent(room, `${player.name}: ${correct ? "верно" : "неверно"} (${delta > 0 ? "+" : ""}${delta})`, correct ? "success" : "danger");

    closeQuestion(room, true);
    emitRoom(room.code);
  });

  socket.on("host:nobody", () => {
    const room = getSocketRoom(socket);
    if (!isHost(socket, room) || !room.state.currentQuestion) return;

    room.state.lastActions.push({
      type: "nobody",
      question: room.state.currentQuestion,
      previousChooser: room.state.chooser
    });
    room.state.lastActions = room.state.lastActions.slice(-20);

    room.state.chooser = room.state.chooser === 0 ? 1 : 0;
    logEvent(room, "Вопрос закрыт без ответа", "info");
    closeQuestion(room, true);
    emitRoom(room.code);
  });

  socket.on("host:undo", () => {
    const room = getSocketRoom(socket);
    if (!isHost(socket, room)) return;

    const action = room.state.lastActions.pop();
    if (!action) return socket.emit("error:message", "Нечего отменять.");

    if (action.type === "award") {
      room.state.scores[action.team] -= action.delta;
    }

    if (action.question?.key) {
      delete room.state.used[action.question.key];
    }

    room.state.chooser = action.previousChooser;
    logEvent(room, "Последнее действие отменено", "info");
    emitRoom(room.code);
  });

  socket.on("host:setRound", ({ round }) => {
    const room = getSocketRoom(socket);
    if (!isHost(socket, room)) return;

    round = Number(round);
    if (![0, 1, 2].includes(round)) return;

    room.state.round = round;
    closeQuestion(room, false);
    emitRoom(room.code);
  });

  socket.on("host:setTimer", ({ duration }) => {
    const room = getSocketRoom(socket);
    if (!isHost(socket, room)) return;

    duration = Number(duration);
    if (![15, 30, 45, 60, 90].includes(duration)) duration = 30;

    room.state.timer.duration = duration;
    if (room.state.currentQuestion) {
      room.state.timer.active = true;
      room.state.timer.startedAt = Date.now();
    }
    emitRoom(room.code);
  });

  socket.on("host:adjustScore", ({ team, delta }) => {
    const room = getSocketRoom(socket);
    if (!isHost(socket, room)) return;

    team = Number(team);
    delta = Number(delta);
    if (![0, 1].includes(team) || !Number.isFinite(delta)) return;

    room.state.scores[team] += delta;
    room.state.lastActions.push({ type: "manual", team, delta, previousChooser: room.state.chooser });
    logEvent(room, `Ручная корректировка: ${room.state.teamNames[team]} ${delta > 0 ? "+" : ""}${delta}`, "info");
    emitRoom(room.code);
  });

  socket.on("player:submitWager", ({ wager }) => {
    const room = getSocketRoom(socket);
    if (!room || !room.players[socket.id]) return;

    const player = room.players[socket.id];
    wager = Math.max(0, Number(wager || 0));
    wager = Math.min(wager, Math.max(0, room.state.scores[player.team]));

    room.state.finalWagers[player.team] = { wager, by: player.name, at: Date.now() };
    logEvent(room, `${room.state.teamNames[player.team]} отправили финальную ставку`, "info");
    emitRoom(room.code);
  });

  socket.on("host:finalApply", ({ team, correct }) => {
    const room = getSocketRoom(socket);
    if (!isHost(socket, room)) return;

    team = Number(team);
    if (![0, 1].includes(team)) return;
    if (room.state.finalApplied[team]) return;

    const wager = Number(room.state.finalWagers[team]?.wager || 0);
    const delta = correct ? wager : -wager;

    room.state.scores[team] += delta;
    room.state.finalApplied[team] = true;
    logEvent(room, `Финал ${room.state.teamNames[team]}: ${correct ? "верно" : "неверно"} ${delta > 0 ? "+" : ""}${delta}`, correct ? "success" : "danger");
    emitRoom(room.code);
  });

  socket.on("host:finish", () => {
    const room = getSocketRoom(socket);
    if (!isHost(socket, room)) return;

    const [a, b] = room.state.scores;
    room.state.winner = a === b
      ? { title: "Ничья", subtitle: `${a} : ${b}` }
      : a > b
        ? { title: `Победили ${room.state.teamNames[0]}`, subtitle: `${a} : ${b}` }
        : { title: `Победили ${room.state.teamNames[1]}`, subtitle: `${b} : ${a}` };

    emitRoom(room.code);
  });

  socket.on("host:reset", () => {
    const room = getSocketRoom(socket);
    if (!isHost(socket, room)) return;

    room.state.scores = [0, 0];
    room.state.round = 0;
    room.state.chooser = 0;
    room.state.used = {};
    room.state.currentQuestion = null;
    room.state.buzzes = [];
    room.state.buzzLocked = false;
    room.state.answerShown = false;
    room.state.finalApplied = [false, false];
    room.state.finalWagers = [null, null];
    room.state.lastActions = [];
    room.state.winner = null;
    room.state.eventLog = [];

    emitRoom(room.code);
  });

  socket.on("disconnect", () => {
    const room = getSocketRoom(socket);
    if (!room) return;

    if (socket.data.role === "player" && room.players[socket.id]) {
      room.players[socket.id].connected = false;
      logEvent(room, `${room.players[socket.id].name} отключился`, "info");
      emitRoom(room.code);
    }

    if (socket.data.role === "host" && room.hostSocketId === socket.id) {
      room.hostSocketId = null;
      logEvent(room, "Ведущий отключился. Комнату можно восстановить по коду.", "danger");
      emitRoom(room.code);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Render perfect server running on port ${PORT}`);
});