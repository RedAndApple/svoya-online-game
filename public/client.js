const socket = io();

let myRole = null;
let myTeam = null;
let myName = null;
let room = null;
let selectedTeam = 0;

const $ = id => document.getElementById(id);

function show(id) {
  ["home", "hostScreen", "playerScreen"].forEach(x => $(x).classList.add("hidden"));
  $(id).classList.remove("hidden");
}

function toast(msg) {
  $("toast").textContent = msg;
  $("toast").classList.remove("hidden");
  setTimeout(() => $("toast").classList.add("hidden"), 2400);
}

document.querySelectorAll(".team-pick").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".team-pick").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedTeam = Number(btn.dataset.team);
  };
});

$("createRoomBtn").onclick = () => {
  myRole = "host";
  socket.emit("host:create");
};

$("joinRoomBtn").onclick = () => {
  const code = $("joinCode").value.trim().toUpperCase();
  const name = $("playerName").value.trim();
  myRole = "player";
  myTeam = selectedTeam;
  myName = name;
  socket.emit("player:join", { code, name, team: selectedTeam });
};

$("buzzBtn").onclick = () => {
  socket.emit("player:buzz");
  $("buzzBtn").disabled = true;
  $("buzzStatus").textContent = "Ты нажал. Ждем решение ведущего.";
};

$("copyLinkBtn").onclick = async () => {
  if (!room) return;
  const url = `${location.origin}?room=${room.code}`;
  try {
    await navigator.clipboard.writeText(url);
    toast("Ссылка скопирована");
  } catch {
    toast(url);
  }
};

$("prevRoundBtn").onclick = () => {
  if (!room) return;
  socket.emit("host:setRound", { round: Math.max(0, room.state.round - 1) });
};

$("nextRoundBtn").onclick = () => {
  if (!room) return;
  socket.emit("host:setRound", { round: Math.min(2, room.state.round + 1) });
};

$("resetBtn").onclick = () => {
  if (confirm("Сбросить очки и открытые вопросы?")) socket.emit("host:reset");
};

$("showAnswerBtn").onclick = () => socket.emit("host:showAnswer");
$("nobodyBtn").onclick = () => socket.emit("host:nobody");
$("finalBtn").onclick = openFinal;

$("showFinalAnswerBtn").onclick = () => $("finalAnswer").classList.remove("hidden");
$("closeFinalBtn").onclick = () => $("finalModal").classList.add("hidden");

$("final0Correct").onclick = () => applyFinal(0, true);
$("final0Wrong").onclick = () => applyFinal(0, false);
$("final1Correct").onclick = () => applyFinal(1, true);
$("final1Wrong").onclick = () => applyFinal(1, false);

function applyFinal(team, correct) {
  const wager = Number($(team === 0 ? "wager0" : "wager1").value || 0);
  socket.emit("host:finalApply", { team, wager, correct });
}

socket.on("host:created", data => {
  room = data;
  myRole = "host";
  show("hostScreen");
  render();
});

socket.on("player:joined", data => {
  room = data;
  show("playerScreen");
  render();
});

socket.on("room:update", data => {
  room = data;
  render();
});

socket.on("error:message", msg => toast(msg));

function render() {
  if (!room) return;

  $("roomBadge").classList.remove("hidden");
  $("roomBadge").textContent = "Комната: " + room.code;

  if (myRole === "host") renderHost();
  if (myRole === "player") renderPlayer();
}

function teamPlayers(team) {
  return Object.values(room.players)
    .filter(p => p.team === team)
    .map(p => `${p.connected ? "●" : "○"} ${p.name}`)
    .join("<br>") || "Пока никого";
}

function renderHost() {
  $("hostCode").textContent = room.code;
  $("hTeam0Name").textContent = room.state.teamNames[0];
  $("hTeam1Name").textContent = room.state.teamNames[1];
  $("hScore0").textContent = room.state.scores[0];
  $("hScore1").textContent = room.state.scores[1];
  $("hPlayers0").innerHTML = teamPlayers(0);
  $("hPlayers1").innerHTML = teamPlayers(1);
  $("roundLabel").textContent = room.gameData.rounds[room.state.round].name;
  $("chooserLabel").textContent = "Выбирает: " + room.state.teamNames[room.state.chooser];

  $("hostTeam0").classList.toggle("active", room.state.chooser === 0);
  $("hostTeam1").classList.toggle("active", room.state.chooser === 1);

  renderBoard();
  renderQuestionModal();
}

function renderBoard() {
  const board = $("board");
  board.innerHTML = "";

  const rIndex = room.state.round;
  const round = room.gameData.rounds[rIndex];

  round.categories.forEach((cat, catIndex) => {
    const catEl = document.createElement("div");
    catEl.className = "cat";
    catEl.textContent = cat.title;
    board.appendChild(catEl);

    for (let qIndex = 0; qIndex < 5; qIndex++) {
      const value = (qIndex + 1) * 100 * round.multiplier;
      const key = `${rIndex}-${catIndex}-${qIndex}`;
      const btn = document.createElement("button");
      btn.className = "qcell" + (room.state.used[key] ? " used" : "");
      btn.textContent = value;
      btn.disabled = !!room.state.used[key] || !!room.state.currentQuestion;
      btn.onclick = () => socket.emit("host:openQuestion", {
        round: rIndex,
        cat: catIndex,
        q: qIndex
      });
      board.appendChild(btn);
    }
  });
}

function renderQuestionModal() {
  const q = room.state.currentQuestion;
  if (!q) {
    $("questionModal").classList.add("hidden");
    return;
  }

  $("questionModal").classList.remove("hidden");
  $("modalTheme").textContent = q.theme;
  $("modalValue").textContent = q.value + " очков";
  $("modalQuestion").textContent = q.text;

  $("modalAnswer").textContent = "Ответ: " + q.answer;
  $("modalAnswer").classList.toggle("hidden", !q.answerShown);

  const list = $("buzzList");
  list.innerHTML = "";

  if (!room.state.buzzes.length) {
    list.innerHTML = `<div class="status">Пока никто не нажал.</div>`;
    return;
  }

  room.state.buzzes.forEach((b, i) => {
    const item = document.createElement("div");
    item.className = "buzz-item";
    item.innerHTML = `
      <strong>${i + 1}. ${b.name} — ${room.state.teamNames[b.team]}</strong>
      <button data-id="${b.id}" data-correct="true">Верно</button>
      <button class="danger" data-id="${b.id}" data-correct="false">Неверно</button>
    `;
    item.querySelectorAll("button").forEach(btn => {
      btn.onclick = () => {
        socket.emit("host:award", {
          playerId: btn.dataset.id,
          correct: btn.dataset.correct === "true"
        });
      };
    });
    list.appendChild(item);
  });
}

function renderPlayer() {
  const player = room.players[socket.id];

  $("myName").textContent = myName || (player ? player.name : "Игрок");
  $("myTeamAvatar").src = room.state.teamAvatars[myTeam];
  $("myTeamName").textContent = room.state.teamNames[myTeam];

  $("pTeam0Name").textContent = room.state.teamNames[0];
  $("pTeam1Name").textContent = room.state.teamNames[1];
  $("pScore0").textContent = room.state.scores[0];
  $("pScore1").textContent = room.state.scores[1];

  const q = room.state.currentQuestion;
  const box = $("playerQuestionBox");

  if (!q) {
    box.innerHTML = `<p>Жди, пока ведущий откроет вопрос.</p>`;
    $("buzzBtn").disabled = true;
    $("buzzStatus").textContent = "";
    return;
  }

  box.innerHTML = `
    <h3>${q.theme} · ${q.value}</h3>
    <p>${q.text}</p>
    ${q.answerShown ? `<div class="answer">Ответ: ${q.answer}</div>` : ""}
  `;

  const alreadyBuzzed = room.state.buzzes.some(b => b.id === socket.id);
  $("buzzBtn").disabled = alreadyBuzzed;
  $("buzzStatus").textContent = alreadyBuzzed ? "Ты уже нажал." : "Нажимай, если знаешь ответ.";
}

function openFinal() {
  if (!room) return;

  $("finalModal").classList.remove("hidden");
  $("finalTheme").textContent = room.gameData.final.theme;
  $("finalQuestion").textContent = room.gameData.final.question;
  $("finalAnswer").textContent = "Ответ: " + room.gameData.final.answer;
  $("finalAnswer").classList.add("hidden");

  $("wager0Label").textContent = `Ставка: ${room.state.teamNames[0]}`;
  $("wager1Label").textContent = `Ставка: ${room.state.teamNames[1]}`;

  $("wager0").value = Math.max(0, Math.floor(room.state.scores[0] / 2));
  $("wager1").value = Math.max(0, Math.floor(room.state.scores[1] / 2));
}

const params = new URLSearchParams(location.search);
const roomParam = params.get("room");
if (roomParam) {
  $("joinCode").value = roomParam.toUpperCase();
}