const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

const gameData = {
  rounds: [
    {
      name: "Раунд 1",
      multiplier: 1,
      categories: [
        { title: "Кино", qs: [
          ["Кто снял фильм «Интерстеллар»?", "Кристофер Нолан"],
          ["Как называется школа магии из «Гарри Поттера»?", "Хогвартс"],
          ["Фраза «Я вернусь» из какого фильма?", "Терминатор"],
          ["Кто снял «Криминальное чтиво»?", "Квентин Тарантино"],
          ["С какой франшизой связана красная и синяя таблетка?", "Матрица"]
        ]},
        { title: "Музыка", qs: [
          ["Сколько струн у обычной гитары?", "6"],
          ["Что измеряется в BPM?", "Темп"],
          ["Как называется повторяющаяся часть песни после куплета?", "Припев"],
          ["Самый низкий мужской голос?", "Бас"],
          ["Что делает компрессор в звуке?", "Сжимает динамический диапазон"]
        ]},
        { title: "Финансы", qs: [
          ["Что такое инфляция?", "Общий рост цен"],
          ["Что такое ВВП?", "Валовой внутренний продукт"],
          ["Кто проводит денежно-кредитную политику?", "Центральный банк"],
          ["Что такое облигация?", "Долговая ценная бумага"],
          ["Что такое ликвидность?", "Способность быстро превратиться в деньги без больших потерь"]
        ]},
        { title: "Россия", qs: [
          ["Северная столица России?", "Санкт-Петербург"],
          ["Какая река протекает через Москву?", "Москва-река"],
          ["Кто крестил Русь?", "Владимир"],
          ["Нижняя палата парламента РФ?", "Государственная Дума"],
          ["Один из древнейших городов России?", "Дербент"]
        ]},
        { title: "Разное", qs: [
          ["Сколько минут в двух часах?", "120"],
          ["Столица Японии?", "Токио"],
          ["Какая планета ближе всего к Солнцу?", "Меркурий"],
          ["Химический символ золота?", "Au"],
          ["Сколько граней у куба?", "6"]
        ]}
      ]
    },
    {
      name: "Раунд 2",
      multiplier: 2,
      categories: [
        { title: "История", qs: [
          ["В каком году началась Вторая мировая война?", "1939"],
          ["Кто был первым императором России?", "Петр I"],
          ["Как называлась столица Византии?", "Константинополь"],
          ["В каком году произошла Октябрьская революция?", "1917"],
          ["Торговый путь через Русь в Византию?", "Путь из варяг в греки"]
        ]},
        { title: "Технологии", qs: [
          ["Что означает AI?", "Искусственный интеллект"],
          ["Что такое frontend?", "Клиентская часть"],
          ["Система контроля версий у разработчиков?", "Git"],
          ["Что такое API?", "Интерфейс программного взаимодействия"],
          ["Главный язык браузера для логики сайта?", "JavaScript"]
        ]},
        { title: "Спорт", qs: [
          ["Сколько игроков одной команды на поле в футболе?", "11"],
          ["В каком виде спорта есть эйс?", "Теннис"],
          ["Сколько очков дает штрафной бросок в баскетболе?", "1"],
          ["Плавание, велосипед, бег — это?", "Триатлон"],
          ["Победа, когда соперник не может продолжать бой?", "Нокаут"]
        ]},
        { title: "География", qs: [
          ["Самая большая страна мира?", "Россия"],
          ["Столица Канады?", "Оттава"],
          ["Самая большая жаркая пустыня?", "Сахара"],
          ["На каком материке Бразилия?", "Южная Америка"],
          ["Самый большой океан?", "Тихий океан"]
        ]},
        { title: "Логика", qs: [
          ["Что тяжелее: 1 кг железа или 1 кг ваты?", "Одинаково"],
          ["Сколько месяцев имеют 28 дней?", "Все 12"],
          ["Что можно сломать, не трогая?", "Обещание"],
          ["Чем больше из нее берешь, тем больше она становится?", "Яма"],
          ["У отца Мэри 5 дочерей: Чача, Чече, Чичи, Чочо. Пятая?", "Мэри"]
        ]}
      ]
    },
    {
      name: "Раунд 3",
      multiplier: 3,
      categories: [
        { title: "Бизнес", qs: [
          ["Что такое MVP?", "Минимально жизнеспособный продукт"],
          ["Что такое CAC?", "Стоимость привлечения клиента"],
          ["Что показывает LTV?", "Ценность клиента за весь срок"],
          ["Что такое маржинальность?", "Доля прибыли в выручке"],
          ["Что такое юнит-экономика?", "Экономика одной единицы продукта/клиента"]
        ]},
        { title: "Искусство", qs: [
          ["Кто написал «Черный квадрат»?", "Казимир Малевич"],
          ["Кто написал «Мону Лизу»?", "Леонардо да Винчи"],
          ["Искусство красивого письма?", "Каллиграфия"],
          ["Произведение из трех частей?", "Триптих"],
          ["Стиль с сильным выражением эмоций и искажением форм?", "Экспрессионизм"]
        ]},
        { title: "Наука", qs: [
          ["Формула воды?", "H2O"],
          ["Что измеряют в ньютонах?", "Силу"],
          ["Отрицательно заряженная частица?", "Электрон"],
          ["Что изучает генетика?", "Наследственность и изменчивость"],
          ["Процесс деления клетки?", "Митоз"]
        ]},
        { title: "Игры", qs: [
          ["В какой игре есть криперы?", "Minecraft"],
          ["Жанр с последним выжившим?", "Battle Royale"],
          ["Кто создал GTA?", "Rockstar Games"],
          ["Что значит NPC?", "Неигровой персонаж"],
          ["Случайная покупка предмета в игре?", "Лутбокс"]
        ]},
        { title: "Сложное", qs: [
          ["Валюта МВФ на основе корзины валют?", "СДР / SDR"],
          ["Доходность облигации к погашению?", "YTM"],
          ["Что такое дюрация?", "Чувствительность облигации к ставкам"],
          ["Заработок на разнице цен на рынках?", "Арбитраж"],
          ["Индекс цен всех товаров и услуг ВВП?", "Дефлятор ВВП"]
        ]}
      ]
    }
  ],
  final: {
    theme: "Финал",
    question: "Цена выросла на 20%, потом снизилась на 20%. Итоговая цена стала выше, ниже или равна первоначальной?",
    answer: "Ниже первоначальной на 4%."
  }
};

const rooms = new Map();

function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function createRoom(hostId) {
  let code;
  do code = makeRoomCode(); while (rooms.has(code));

  const room = {
    code,
    hostId,
    players: {},
    state: {
      teamNames: ["Усатые карлики", "Черные короли"],
      teamAvatars: ["/assets/team1.jpeg", "/assets/team2.jpeg"],
      scores: [0, 0],
      round: 0,
      chooser: 0,
      used: {},
      currentQuestion: null,
      buzzes: [],
      finalApplied: [false, false]
    }
  };

  rooms.set(code, room);
  return room;
}

function publicRoom(room) {
  return {
    code: room.code,
    players: room.players,
    gameData,
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

io.on("connection", socket => {
  socket.on("host:create", () => {
    const room = createRoom(socket.id);
    socket.data.roomCode = room.code;
    socket.data.role = "host";
    socket.join(room.code);
    socket.emit("host:created", publicRoom(room));
    emitRoom(room.code);
  });

  socket.on("player:join", ({ code, name, team }) => {
    code = String(code || "").trim().toUpperCase();
    name = String(name || "").trim().slice(0, 30);
    team = Number(team);

    const room = rooms.get(code);
    if (!room) return socket.emit("error:message", "Комната не найдена.");
    if (!name) return socket.emit("error:message", "Введите имя.");
    if (![0,1].includes(team)) return socket.emit("error:message", "Выберите команду.");

    const teamCount = Object.values(room.players).filter(p => p.team === team).length;
    if (teamCount >= 6) return socket.emit("error:message", "В этой команде уже 6 игроков.");

    room.players[socket.id] = {
      id: socket.id,
      name,
      team,
      connected: true
    };

    socket.data.roomCode = code;
    socket.data.role = "player";
    socket.join(code);
    socket.emit("player:joined", publicRoom(room));
    emitRoom(code);
  });

  socket.on("host:openQuestion", ({ round, cat, q }) => {
    const room = getRoomBySocket(socket);
    if (!isHost(socket, room)) return;

    const r = gameData.rounds[round];
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
    emitRoom(room.code);
  });

  socket.on("player:buzz", () => {
    const room = getRoomBySocket(socket);
    if (!room || !room.state.currentQuestion) return;

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

    room.state.scores[team] += correct ? value : -value;
    room.state.chooser = correct ? team : (team === 0 ? 1 : 0);
    room.state.used[room.state.currentQuestion.key] = true;
    room.state.currentQuestion = null;
    room.state.buzzes = [];

    emitRoom(room.code);
  });

  socket.on("host:nobody", () => {
    const room = getRoomBySocket(socket);
    if (!isHost(socket, room) || !room.state.currentQuestion) return;

    room.state.used[room.state.currentQuestion.key] = true;
    room.state.chooser = room.state.chooser === 0 ? 1 : 0;
    room.state.currentQuestion = null;
    room.state.buzzes = [];

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
    room.state.scores[team] += correct ? wager : -wager;
    room.state.finalApplied[team] = true;

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

    emitRoom(room.code);
  });

  socket.on("disconnect", () => {
    const room = getRoomBySocket(socket);
    if (!room) return;

    if (socket.data.role === "player" && room.players[socket.id]) {
      room.players[socket.id].connected = false;
      emitRoom(room.code);
    }

    if (socket.data.role === "host") {
      io.to(room.code).emit("error:message", "Ведущий отключился. Комната закрыта.");
      rooms.delete(room.code);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Game server running on http://localhost:${PORT}`);
});