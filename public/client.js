const $ = id => document.getElementById(id);

const socket = io({
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 700
});

let room = null;
let myRole = null;
let myTeam = 0;
let myName = "";
let ready = false;
let lastQuestionKey = null;

function show(id) {
  ["home", "hostScreen", "playerScreen", "displayScreen"].forEach(x => $(x).classList.add("hidden"));
  $(id).classList.remove("hidden");
}

function toast(msg) {
  $("toast").textContent = msg;
  $("toast").classList.remove("hidden");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => $("toast").classList.add("hidden"), 2600);
}

function publicBaseUrl() {
  return location.origin;
}

socket.on("connect", () => {
  console.log("socket connected", socket.id);
});

socket.on("connect_error", () => {
  toast("Нет подключения к серверу");
});

socket.on("error:message", toast);

socket.on("host:created", data => {
  room = data;
  myRole = "host";
  show("hostScreen");
  render();
});

socket.on("player:joined", data => {
  room = data;
  myRole = "player";
  show("playerScreen");
  render();
});

socket.on("display:joined", data => {
  room = data;
  myRole = "display";
  show("displayScreen");
  render();
});

socket.on("room:update", data => {
  room = data;
  render();
});

$("createRoomBtn").onclick = () => {
  myRole = "host";
  socket.emit("host:create", { topic: $("gameTopic").value.trim() });
};

$("reclaimBtn").onclick = () => {
  const code = $("reclaimCode").value.trim().toUpperCase();
  if (!code) return toast("Введите код комнаты");
  myRole = "host";
  socket.emit("host:reclaim", { code });
};

document.querySelectorAll(".team-pick").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".team-pick").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    myTeam = Number(btn.dataset.team);
  };
});

$("joinRoomBtn").onclick = () => {
  const code = $("joinCode").value.trim().toUpperCase();
  const name = $("playerName").value.trim();

  myName = name;
  socket.emit("player:join", { code, name, team: myTeam });
};

$("copyLinkBtn").onclick = async () => {
  const url = `${publicBaseUrl()}?room=${room.code}`;
  try {
    await navigator.clipboard.writeText(url);
    toast("Ссылка скопирована");
  } catch {
    toast(url);
  }
};

$("displayBtn").onclick = () => {
  window.open(`${publicBaseUrl()}?display=${room.code}`, "_blank");
};

$("prevRoundBtn").onclick = () => socket.emit("host:setRound", { round: Math.max(0, room.state.round - 1) });
$("nextRoundBtn").onclick = () => socket.emit("host:setRound", { round: Math.min(2, room.state.round + 1) });
$("lockBtn").onclick = () => socket.emit("host:setBuzzLocked", { locked: !room.state.buzzLocked });
$("undoBtn").onclick = () => socket.emit("host:undo");
$("resetBtn").onclick = () => confirm("Сбросить игру?") && socket.emit("host:reset");
$("finishBtn").onclick = () => socket.emit("host:finish");

document.querySelectorAll(".timerBtn").forEach(btn => {
  btn.onclick = () => socket.emit("host:setTimer", { duration: Number(btn.dataset.sec) });
});

document.querySelectorAll(".scoreBtn").forEach(btn => {
  btn.onclick = () => socket.emit("host:adjustScore", {
    team: Number(btn.dataset.team),
    delta: Number(btn.dataset.delta)
  });
});

$("showAnswerBtn").onclick = () => socket.emit("host:showAnswer");
$("nobodyBtn").onclick = () => socket.emit("host:nobody");
$("closeFinalBtn").onclick = () => $("finalModal").classList.add("hidden");

document.querySelectorAll(".finalApply").forEach(btn => {
  btn.onclick = () => socket.emit("host:finalApply", {
    team: Number(btn.dataset.team),
    correct: btn.dataset.correct === "true"
  });
});

$("readyBtn").onclick = () => {
  ready = !ready;
  socket.emit("player:ready", { ready });
};

$("buzzBtn").onclick = () => socket.emit("player:buzz");

$("wagerBtn").onclick = () => {
  socket.emit("player:submitWager", { wager: Number($("wagerInput").value || 0) });
  toast("Ставка отправлена");
};

function render() {
  if (!room) return;
  if (myRole === "host") renderHost();
  if (myRole === "player") renderPlayer();
  if (myRole === "display") renderDisplay();
}

function teamPlayers(team) {
  const players = Object.values(room.players).filter(p => p.team === team);
  return players.length
    ? players.map(p => `${p.connected ? "●" : "○"} ${p.name}${p.ready ? " ✓" : ""}`).join("<br>")
    : "Пока никого";
}

function renderHost() {
  $("hostCode").textContent = room.code;

  const joinUrl = `${publicBaseUrl()}?room=${room.code}`;
  $("qrCode").src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(joinUrl)}`;

  $("hTeam0Name").textContent = room.state.teamNames[0];
  $("hTeam1Name").textContent = room.state.teamNames[1];
  $("hScore0").textContent = room.state.scores[0];
  $("hScore1").textContent = room.state.scores[1];
  $("hPlayers0").innerHTML = teamPlayers(0);
  $("hPlayers1").innerHTML = teamPlayers(1);
  $("hostTeam0").classList.toggle("active", room.state.chooser === 0);
  $("hostTeam1").classList.toggle("active", room.state.chooser === 1);

  $("roundLabel").textContent = room.gameData.rounds[room.state.round].name;
  $("chooserLabel").textContent = `Выбирает: ${room.state.teamNames[room.state.chooser]}`;
  $("progressLabel").textContent = `Открыто: ${Object.keys(room.state.used).length}/75`;
  $("lockBtn").textContent = room.state.buzzLocked ? "Открыть кнопки" : "Закрыть кнопки";

  renderTimer();
  renderBoard();
  renderQuestionModal();
  renderEventLog();
  renderWinnerToast();
}

function renderBoard() {
  const round = room.gameData.rounds[room.state.round];
  let html = `<div class="board-head">Темы</div>`;
  for (let i = 1; i <= 5; i++) html += `<div class="board-head">${i * 100 * round.multiplier}</div>`;

  round.categories.forEach((cat, catIndex) => {
    html += `<div class="cat-head">${cat.title}</div>`;
    for (let q = 0; q < 5; q++) {
      const key = `${room.state.round}-${catIndex}-${q}`;
      html += `<button class="board-cell ${room.state.used[key] ? "used" : ""}" data-cat="${catIndex}" data-q="${q}">${(q + 1) * 100 * round.multiplier}</button>`;
    }
  });

  $("board").innerHTML = html;

  document.querySelectorAll(".board-cell").forEach(btn => {
    btn.onclick = () => socket.emit("host:openQuestion", {
      round: room.state.round,
      cat: Number(btn.dataset.cat),
      q: Number(btn.dataset.q)
    });
  });
}

function renderQuestionModal() {
  const q = room.state.currentQuestion;
  $("questionModal").classList.toggle("hidden", !q);
  if (!q) return;

  $("modalTheme").textContent = q.theme;
  $("modalValue").textContent = `${q.value} очков`;
  $("modalQuestion").textContent = q.text;
  $("hostAnswer").textContent = q.answer;

  $("publicAnswer").textContent = `Ответ игрокам: ${q.answer}`;
  $("publicAnswer").classList.toggle("hidden", !room.state.answerShown);

  const buzzes = room.state.buzzes || [];
  $("buzzList").innerHTML = buzzes.length
    ? buzzes.map((b, i) => `
      <div class="buzz-row">
        <strong>${i + 1}. ${b.name} · ${room.state.teamNames[b.team]}</strong>
        <div class="buzz-actions">
          <button class="gold award" data-id="${b.id}" data-correct="true">Верно</button>
          <button class="danger award" data-id="${b.id}" data-correct="false">Неверно</button>
        </div>
      </div>
    `).join("")
    : `<div class="status">Пока никто не нажал</div>`;

  document.querySelectorAll(".award").forEach(btn => {
    btn.onclick = () => socket.emit("host:award", {
      playerId: btn.dataset.id,
      correct: btn.dataset.correct === "true"
    });
  });
}

function renderTimer() {
  const timer = room.state.timer;
  if (!timer.active || !timer.startedAt) {
    $("hostTimer").classList.add("hidden");
    return;
  }

  const left = Math.max(0, timer.duration - Math.floor((Date.now() - timer.startedAt) / 1000));
  $("hostTimer").classList.remove("hidden");
  $("hostTimer").textContent = left;
  $("hostTimer").classList.toggle("low", left <= 5);
}

function renderEventLog() {
  const events = (room.state.eventLog || []).slice().reverse();
  $("eventLog").innerHTML = events.length
    ? events.map(e => `<div class="event-item ${e.type || ""}">${new Date(e.at).toLocaleTimeString("ru-RU")} — ${e.text}</div>`).join("")
    : `<div class="event-item">Событий пока нет</div>`;
}

function renderPlayer() {
  const player = room.players[socket.id];
  if (player) {
    ready = !!player.ready;
    myTeam = player.team;
    myName = player.name;
  }

  $("myName").textContent = myName || "Игрок";
  $("myTeamAvatar").src = room.state.teamAvatars[myTeam];
  $("myTeamName").textContent = room.state.teamNames[myTeam];
  $("pTeam0Name").textContent = room.state.teamNames[0];
  $("pTeam1Name").textContent = room.state.teamNames[1];
  $("pScore0").textContent = room.state.scores[0];
  $("pScore1").textContent = room.state.scores[1];

  $("readyBtn").textContent = ready ? "Готов ✓" : "Я готов";

  const q = room.state.currentQuestion;
  const box = $("playerQuestionBox");

  if (!q) {
    box.innerHTML = `<h2>Ждем вопрос</h2>`;
    $("buzzBtn").disabled = true;
    $("buzzStatus").textContent = "";
    lastQuestionKey = null;
    return;
  }

  if (lastQuestionKey !== q.key) {
    lastQuestionKey = q.key;
    try { navigator.vibrate && navigator.vibrate([80, 40, 80]); } catch {}
  }

  box.innerHTML = `
    <div>
      <h3>${q.theme} · ${q.value}</h3>
      <p>${q.text}</p>
      ${room.state.answerShown ? `<div class="answer">Ответ: ${q.answer}</div>` : ""}
    </div>
  `;

  const already = room.state.buzzes.some(b => b.id === socket.id);
  $("buzzBtn").disabled = already || room.state.buzzLocked;
  $("buzzStatus").textContent = room.state.buzzLocked
    ? "Кнопки закрыты ведущим"
    : already
      ? "Ты уже нажал"
      : "Нажимай, если знаешь ответ";
}

function renderDisplay() {
  $("dCode").textContent = `Комната ${room.code}`;
  $("dTeam0Name").textContent = room.state.teamNames[0];
  $("dTeam1Name").textContent = room.state.teamNames[1];
  $("dScore0").textContent = room.state.scores[0];
  $("dScore1").textContent = room.state.scores[1];
  $("dRound").textContent = room.gameData.rounds[room.state.round].name;

  const q = room.state.currentQuestion;
  if (!q) {
    $("dQuestion").innerHTML = "Ждем вопрос";
  } else {
    $("dQuestion").innerHTML = `
      <div>
        <div>${q.theme} · ${q.value}</div>
        <p>${q.text}</p>
        ${room.state.answerShown ? `<div class="answer">Ответ: ${q.answer}</div>` : ""}
      </div>
    `;
  }

  renderWinnerToast();
}

function renderWinnerToast() {
  const winner = room.state.winner;
  if ($("dWinner")) {
    $("dWinner").classList.toggle("hidden", !winner);
    $("dWinner").innerHTML = winner ? `<div>${winner.title}</div><small>${winner.subtitle}</small>` : "";
  }
  if (winner && myRole !== "display") toast(`${winner.title} · ${winner.subtitle}`);
}

setInterval(() => {
  if (room && myRole === "host") renderTimer();
}, 250);

const params = new URLSearchParams(location.search);
const roomParam = params.get("room");
const displayParam = params.get("display");

if (displayParam) {
  myRole = "display";
  socket.emit("display:join", { code: displayParam.toUpperCase() });
} else if (roomParam) {
  $("joinCode").value = roomParam.toUpperCase();
}