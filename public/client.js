// Web on Render uses the same origin automatically.
// Native iOS Capacitor build uses this hosted backend URL.
const SVoyaNativeBackendUrl = "https://svoya-online-game.onrender.com";

function isNativeCapacitorRuntime() {
  return location.protocol === "capacitor:" || location.protocol === "ionic:";
}

const socket = isNativeCapacitorRuntime() ? io(SVoyaNativeBackendUrl) : io();

let myRole = null;
let myTeam = null;
let myName = null;
let room = null;
let selectedTeam = 0;
let myReady = false;
let lastQuestionKeyForSignal = null;
let selectedPreset = "classic";

setInterval(updateHostTimer, 250);

const $ = id => document.getElementById(id);

function clearOldServiceWorkersAndCaches() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations()
      .then(regs => regs.forEach(reg => reg.unregister()))
      .catch(() => null);
  }

  if ("caches" in window) {
    caches.keys()
      .then(keys => Promise.all(keys.map(key => caches.delete(key))))
      .catch(() => null);
  }
}

clearOldServiceWorkersAndCaches();

if (!localStorage.getItem("onboardingSeen")) {
  setTimeout(() => $("onboardingModal")?.classList.remove("hidden"), 300);
}

setTimeout(() => {
  if ($("closeOnboardingBtn")) {
    $("closeOnboardingBtn").onclick = () => {
      localStorage.setItem("onboardingSeen", "1");
      $("onboardingModal").classList.add("hidden");
    };
  }
}, 0);

function getPublicBaseUrl() {
  if (isNativeCapacitorRuntime()) return SVoyaNativeBackendUrl;
  return location.origin;
}

function show(id) {
  ["home", "hostScreen", "playerScreen", "displayScreen"].forEach(x => $(x).classList.add("hidden"));
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

document.querySelectorAll(".preset-btn").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".preset-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedPreset = btn.dataset.preset || "classic";
    if ($("gameTopic")) $("gameTopic").value = btn.dataset.topic || "";
  };
});

$("createRoomBtn").onclick = () => {
  myRole = "host";
  const topic = $("gameTopic") ? $("gameTopic").value.trim() : "";
  const settings = {
    defaultTimer: Number($("defaultTimer")?.value || 30),
    allowNegativeScores: $("allowNegativeScores") ? $("allowNegativeScores").checked : true,
    autoLockAfterFirstBuzz: $("autoLockAfterFirstBuzz") ? $("autoLockAfterFirstBuzz").checked : false
  };
  $("createRoomBtn").disabled = true;
  if ($("createStatus")) $("createStatus").textContent = "Собираю новый пакет вопросов...";
  socket.emit("host:create", { topic, settings, preset: selectedPreset });
};

$("reclaimBtn").onclick = () => {
  const code = $("reclaimCode").value.trim().toUpperCase();
  if (!code) return toast("Введите код комнаты.");
  myRole = "host";
  socket.emit("host:reclaim", { code });
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
  const url = `${getPublicBaseUrl()}?room=${room.code}`;
  try {
    await navigator.clipboard.writeText(url);
    toast("Ссылка скопирована");
  } catch {
    toast(url);
  }
};

$("displayLinkBtn").onclick = () => {
  if (!room) return;
  window.open(`${getPublicBaseUrl()}?display=${room.code}`, "_blank");
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

$("undoBtn").onclick = () => {
  socket.emit("host:undoLastAction");
};

$("exportBtn").onclick = () => {
  if (!room) return;
  const payload = {
    code: room.code,
    createdAt: new Date().toISOString(),
    gameData: room.gameData
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `svoya-game-${room.code}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

document.querySelectorAll(".timer-pick").forEach(btn => {
  btn.onclick = () => {
    socket.emit("host:setTimer", { duration: Number(btn.dataset.seconds) });
  };
});

$("stopTimerBtn").onclick = () => {
  socket.emit("host:stopTimer");
};

$("resetUsedBtn").onclick = () => {
  if (confirm("Сбросить историю использованных вопросов между комнатами?")) socket.emit("host:resetUsedQuestions");
};

$("lockBuzzBtn").onclick = () => {
  if (!room) return;
  socket.emit("host:setBuzzLocked", { locked: !room.state.buzzLocked });
};

$("finishGameBtn").onclick = () => {
  socket.emit("host:finishGame");
};

$("importBtn").onclick = () => $("importFile").click();

$("importFile").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const gameData = parsed.gameData || parsed;
    socket.emit("host:replaceGameData", { gameData });
  } catch {
    toast("Не удалось прочитать JSON.");
  } finally {
    e.target.value = "";
  }
};

document.querySelectorAll(".score-adjust").forEach(btn => {
  btn.onclick = () => {
    socket.emit("host:adjustScore", {
      team: Number(btn.dataset.team),
      delta: Number(btn.dataset.delta)
    });
  };
});

$("readyBtn").onclick = () => {
  myReady = !myReady;
  socket.emit("player:setReady", { ready: myReady });
};

$("clearWinnerBtn").onclick = () => {
  if (myRole === "host") socket.emit("host:clearWinner");
  $("winnerModal").classList.add("hidden");
};

$("roomSettingsBtn").onclick = () => {
  const s = room?.state?.settings || {};
  $("settingsTimer").value = String(s.defaultTimer || 30);
  $("settingsNegative").checked = s.allowNegativeScores !== false;
  $("settingsAutoLock").checked = !!s.autoLockAfterFirstBuzz;
  $("settingsModal").classList.remove("hidden");
};

$("closeSettingsBtn").onclick = () => $("settingsModal").classList.add("hidden");

$("saveSettingsBtn").onclick = () => {
  socket.emit("host:updateSettings", {
    settings: {
      defaultTimer: Number($("settingsTimer").value),
      allowNegativeScores: $("settingsNegative").checked,
      autoLockAfterFirstBuzz: $("settingsAutoLock").checked
    }
  });
  $("settingsModal").classList.add("hidden");
};

$("clearLogBtn").onclick = () => socket.emit("host:clearEventLog");

$("reportBtn").onclick = () => {
  const targetPlayerId = $("reportPlayerSelect").value;
  const reason = $("reportReason").value.trim() || "Нарушение правил";
  if (!targetPlayerId) return toast("Выбери игрока.");
  socket.emit("player:report", { targetPlayerId, reason });
  $("reportReason").value = "";
  toast("Жалоба отправлена ведущему.");
};

$("appealBtn").onclick = () => {
  const text = $("appealText").value.trim();
  if (!text) return toast("Напиши текст апелляции.");
  socket.emit("player:appeal", { text });
  $("appealText").value = "";
  toast("Апелляция отправлена.");
};

$("submitWagerBtn").onclick = () => {
  socket.emit("player:submitWager", { wager: Number($("wagerInput").value || 0) });
  toast("Ставка отправлена.");
};

$("teamNote").oninput = () => {
  socket.emit("player:updateTeamNote", { text: $("teamNote").value });
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

socket.on("connect", () => {
  console.log("Socket connected", socket.id);
});

socket.on("connect_error", err => {
  console.error("Socket connection error", err);
  toast("Ошибка подключения к серверу. Обнови страницу.");
});

socket.on("host:status", msg => {
  if ($("createStatus")) $("createStatus").textContent = msg;
});

socket.on("host:created", data => {
  room = data;
  myRole = "host";
  if ($("createRoomBtn")) $("createRoomBtn").disabled = false;
  if ($("createStatus")) $("createStatus").textContent = "";
  show("hostScreen");
  render();
});

socket.on("player:joined", data => {
  room = data;
  show("playerScreen");
  render();
});

socket.on("spectator:joined", data => {
  room = data;
  myRole = "spectator";
  show("displayScreen");
  render();
});

socket.on("room:update", data => {
  room = data;
  render();
});

socket.on("error:message", msg => {
  if ($("createRoomBtn")) $("createRoomBtn").disabled = false;
  toast(msg);
});

function render() {
  if (!room) return;

  $("roomBadge").classList.remove("hidden");
  $("roomBadge").textContent = "Комната: " + room.code;

  if (myRole === "host") renderHost();
  if (myRole === "player") renderPlayer();
  if (myRole === "spectator") renderDisplay();
  renderWinner();
}

function teamPlayers(team) {
  const players = Object.values(room.players).filter(p => p.team === team);
  if (!players.length) return "Пока никого";

  if (myRole !== "host") {
    return players
      .map(p => `${p.connected ? "●" : "○"} ${p.name}${p.captain ? " 👑" : ""}`)
      .join("<br>");
  }

  return players.map(p => `
    <div class="player-row">
      <span>${p.connected ? "●" : "○"} ${p.name}${p.ready ? " ✓" : ""}${p.captain ? '<span class="captain-badge">Капитан</span>' : ""}</span>
      <button class="ghost captain-btn" data-player="${p.id}">Капитан</button>
    </div>
  `).join("");
}

function renderHost() {
  $("hostCode").textContent = room.code;
  const joinUrl = `${getPublicBaseUrl()}?room=${room.code}`;
  $("qrCode").src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(joinUrl)}`;
  $("lockBuzzBtn").textContent = room.state.buzzLocked ? "Открыть кнопки" : "Закрыть кнопки";

  const playersArr = Object.values(room.players);
  const ready = playersArr.filter(p => p.ready).length;
  $("readyCount").textContent = `Готовы: ${ready}/${playersArr.length}`;

  $("hTeam0Name").textContent = room.state.teamNames[0];
  $("hTeam1Name").textContent = room.state.teamNames[1];
  $("hScore0").textContent = room.state.scores[0];
  $("hScore1").textContent = room.state.scores[1];
  $("hPlayers0").innerHTML = teamPlayers(0);
  $("hPlayers1").innerHTML = teamPlayers(1);
  document.querySelectorAll(".captain-btn").forEach(btn => {
    btn.onclick = () => socket.emit("host:setCaptain", { playerId: btn.dataset.player });
  });
  $("roundLabel").textContent = room.gameData.rounds[room.state.round].name;
  $("chooserLabel").textContent = "Выбирает: " + room.state.teamNames[room.state.chooser];

  renderProgress();
  renderProPanels();

  $("hostTeam0").classList.toggle("active", room.state.chooser === 0);
  $("hostTeam1").classList.toggle("active", room.state.chooser === 1);

  renderBoard();
  renderQuestionModal();
}



function formatTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "";
  }
}

function renderProPanels() {
  if (!room || !$("eventLog")) return;

  const events = (room.state.eventLog || []).slice().reverse();
  $("eventLog").innerHTML = events.length
    ? events.map(e => `
      <div class="event-item ${e.type || "info"}">
        <strong>${formatTime(e.at)}</strong>
        <span>${e.text}</span>
      </div>
    `).join("")
    : `<div class="event-item">Событий пока нет.</div>`;

  const appeals = (room.state.appeals || []).slice().reverse();
  $("appealsList").innerHTML = appeals.length
    ? appeals.map(a => `
      <div class="appeal-item">
        <strong>${a.playerName} · ${room.state.teamNames[a.team]} · ${a.status}</strong>
        <span>${a.text}</span>
        <div class="appeal-actions">
          <button data-id="${a.id}" data-accept="true">Принять</button>
          <button class="danger" data-id="${a.id}" data-accept="false">Отклонить</button>
        </div>
      </div>
    `).join("")
    : `<div class="appeal-item">Апелляций нет.</div>`;

  document.querySelectorAll(".appeal-actions button").forEach(btn => {
    btn.onclick = () => socket.emit("host:resolveAppeal", {
      appealId: btn.dataset.id,
      accepted: btn.dataset.accept === "true"
    });
  });

  if ($("reportsList")) {
    const reports = (room.state.reports || []).slice().reverse();
    $("reportsList").innerHTML = reports.length
      ? reports.map(r => `
        <div class="appeal-item">
          <strong>${r.reporterName} → ${r.targetName} · ${r.status}</strong>
          <span>${r.reason}</span>
          <div class="appeal-actions">
            <button data-report="${r.id}" data-accept-report="true">Принять</button>
            <button class="danger" data-report="${r.id}" data-accept-report="false">Отклонить</button>
            <button class="danger" data-kick="${r.targetPlayerId}">Удалить игрока</button>
          </div>
        </div>
      `).join("")
      : `<div class="appeal-item">Жалоб нет.</div>`;

    document.querySelectorAll("[data-report]").forEach(btn => {
      btn.onclick = () => socket.emit("host:resolveReport", {
        reportId: btn.dataset.report,
        accepted: btn.dataset.acceptReport === "true"
      });
    });

    document.querySelectorAll("[data-kick]").forEach(btn => {
      btn.onclick = () => {
        if (confirm("Удалить игрока из комнаты?")) socket.emit("host:kickPlayer", { playerId: btn.dataset.kick });
      };
    });
  }

  const wagers = room.state.teamWagers || [null, null];
  $("wagersBox").innerHTML = [0, 1].map(team => {
    const w = wagers[team];
    return `
      <div class="wager-item">
        <strong>${room.state.teamNames[team]}</strong>
        <span>${w ? `Ставка отправлена: ${w.wager} · ${w.by}` : "Ставка еще не отправлена"}</span>
      </div>
    `;
  }).join("");
}

function renderProgress() {
  if (!room || !$("roundProgress")) return;

  const round = room.state.round;
  const usedKeys = Object.keys(room.state.used || {});
  const roundUsed = usedKeys.filter(k => k.startsWith(`${round}-`)).length;
  const totalUsed = usedKeys.length;

  $("roundProgress").textContent = `Открыто в раунде: ${roundUsed}/25`;
  $("totalProgress").textContent = `Всего открыто: ${totalUsed}/75`;
}

function updateHostTimer() {
  if (!room || myRole !== "host" || !$("hostTimer")) return;

  const timer = room.state.timer;
  if (!timer || !timer.active || !timer.startedAt) {
    $("hostTimer").classList.add("hidden");
    return;
  }

  const elapsed = Math.floor((Date.now() - timer.startedAt) / 1000);
  const left = Math.max(0, Number(timer.duration || 30) - elapsed);

  $("hostTimer").classList.remove("hidden");
  $("hostTimer").textContent = left;
  $("hostTimer").classList.toggle("low", left <= 5);

  if (left === 0) {
    $("hostTimer").textContent = "0";
  }
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
  $("hostOnlyAnswer").textContent = q.answer;

  $("modalAnswer").textContent = "Ответ игрокам: " + q.answer;
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

  if (player) {
    myReady = !!player.ready;
    $("readyBtn").classList.toggle("active", myReady);
    $("readyBtn").textContent = myReady ? "Готов ✓" : "Я готов";
  }

  renderReportSelect();

  if ($("teamNote") && document.activeElement !== $("teamNote")) {
    $("teamNote").value = room.state.teamNotes?.[myTeam] || "";
  }
  if ($("wagerInput")) {
    $("wagerInput").max = Math.max(0, room.state.scores[myTeam]);
  }

  const q = room.state.currentQuestion;
  const box = $("playerQuestionBox");

  if (!q) {
    box.innerHTML = `<p>Жди, пока ведущий откроет вопрос.</p>`;
    $("buzzBtn").disabled = true;
    $("buzzBtn").classList.remove("locked");
    $("buzzStatus").textContent = "";
    lastQuestionKeyForSignal = null;
    return;
  }

  box.innerHTML = `
    <h3>${q.theme} · ${q.value}</h3>
    <p>${q.text}</p>
    ${q.answerShown ? `<div class="answer">Ответ: ${q.answer}</div>` : ""}
  `;

  if (lastQuestionKeyForSignal !== q.key) {
    lastQuestionKeyForSignal = q.key;
    signalNewQuestion();
  }

  const alreadyBuzzed = room.state.buzzes.some(b => b.id === socket.id);
  const locked = !!room.state.buzzLocked;
  $("buzzBtn").disabled = alreadyBuzzed || locked;
  $("buzzBtn").classList.toggle("locked", locked);
  $("buzzStatus").textContent = locked
    ? "Кнопки закрыты ведущим."
    : alreadyBuzzed
      ? "Ты уже нажал."
      : "Нажимай, если знаешь ответ.";
}


function renderReportSelect() {
  if (!room || !$("reportPlayerSelect")) return;

  const currentId = $("reportPlayerSelect").value;
  const players = Object.values(room.players).filter(p => p.id !== socket.id);
  $("reportPlayerSelect").innerHTML = players.length
    ? players.map(p => `<option value="${p.id}">${p.name} · ${room.state.teamNames[p.team]}</option>`).join("")
    : `<option value="">Нет игроков</option>`;

  if (players.some(p => p.id === currentId)) $("reportPlayerSelect").value = currentId;
}

function renderDisplay() {
  if (!room) return;

  $("dRoomCode").textContent = `Комната: ${room.code}`;
  $("dTeam0Name").textContent = room.state.teamNames[0];
  $("dTeam1Name").textContent = room.state.teamNames[1];
  $("dScore0").textContent = room.state.scores[0];
  $("dScore1").textContent = room.state.scores[1];
  $("dRound").textContent = room.gameData.rounds[room.state.round].name;

  const q = room.state.currentQuestion;
  const box = $("dQuestionBox");

  if (room.state.winner) {
    $("dWinner").classList.remove("hidden");
    $("dWinner").innerHTML = `<h2>${room.state.winner.title}</h2><p>${room.state.winner.subtitle}</p>`;
  } else {
    $("dWinner").classList.add("hidden");
    $("dWinner").innerHTML = "";
  }

  if (!q) {
    $("dQuestionStatus").textContent = "Ждем вопрос";
    box.innerHTML = `<h2>Выберите вопрос на поле</h2>`;
    return;
  }

  $("dQuestionStatus").textContent = `${q.theme} · ${q.value} очков`;
  box.innerHTML = `
    <div>
      <h2>${q.text}</h2>
      ${q.answerShown ? `<div class="answer">Ответ: ${q.answer}</div>` : ""}
    </div>
  `;
}

function renderWinner() {
  if (!room || !$("winnerModal")) return;

  if (!room.state.winner) {
    $("winnerModal").classList.add("hidden");
    return;
  }

  $("winnerTitle").textContent = room.state.winner.title;
  $("winnerSubtitle").textContent = room.state.winner.subtitle;
  $("winnerModal").classList.remove("hidden");
}

function signalNewQuestion() {
  try {
    if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
  } catch {}

  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.06;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, 120);
  } catch {}
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
const displayParam = params.get("display");

if (displayParam) {
  myRole = "spectator";
  socket.emit("spectator:join", { code: displayParam.toUpperCase() });
} else if (roomParam) {
  $("joinCode").value = roomParam.toUpperCase();
}

// Service worker disabled for live multiplayer stability on Render.
