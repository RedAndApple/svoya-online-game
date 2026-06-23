const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DB_PATH = path.join(__dirname, "questionsDB.json");
const USED_PATH = path.join(__dirname, "usedQuestions.json");

const questionsDB = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));

function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(a) {
  return function() {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createRng(seed) {
  const seedFn = xmur3(String(seed));
  return mulberry32(seedFn());
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function num(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function normalizeQuestion(q) {
  return String(q || "")
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hashQuestion(q) {
  return crypto.createHash("sha256").update(normalizeQuestion(q)).digest("hex");
}

function loadUsed() {
  try {
    const raw = JSON.parse(fs.readFileSync(USED_PATH, "utf8"));
    return new Set(Array.isArray(raw.used) ? raw.used : []);
  } catch (e) {
    return new Set();
  }
}

function saveUsed(usedSet) {
  const data = {
    used: Array.from(usedSet).slice(-50000),
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(USED_PATH, JSON.stringify(data, null, 2), "utf8");
}

function resetUsedQuestions() {
  fs.writeFileSync(USED_PATH, JSON.stringify({ used: [], updatedAt: new Date().toISOString() }, null, 2), "utf8");
}

function levelFor(roundIndex, qIndex) {
  if (roundIndex === 0 && qIndex <= 1) return "easy";
  if (roundIndex === 0 && qIndex <= 3) return "medium";
  if (roundIndex === 1 && qIndex <= 1) return "medium";
  return "hard";
}

const topicAliases = {
  "финансы": ["Финансы", "Экономика"],
  "экономика": ["Экономика", "Финансы"],
  "деньги": ["Финансы", "Экономика", "Бизнес"],
  "бизнес": ["Бизнес", "Финансы", "Экономика"],
  "кино": ["Кино"],
  "фильмы": ["Кино"],
  "музыка": ["Музыка"],
  "звук": ["Музыка"],
  "спорт": ["Спорт"],
  "футбол": ["Спорт"],
  "технологии": ["Технологии"],
  "айти": ["Технологии"],
  "it": ["Технологии"],
  "география": ["География"],
  "страны": ["География"],
  "история": ["История"],
  "логика": ["Логика"],
  "сложная": ["Финансы", "Экономика", "История", "Технологии", "Логика"],
};

function selectCategories(rng, topic) {
  const all = Object.keys(questionsDB);
  const normalized = String(topic || "").toLowerCase();
  let preferred = [];

  for (const [key, cats] of Object.entries(topicAliases)) {
    if (normalized.includes(key)) preferred.push(...cats);
  }

  for (const title of all) {
    if (normalized.includes(title.toLowerCase())) preferred.push(title);
  }

  preferred = [...new Set(preferred)].filter(x => all.includes(x));
  const rest = all.filter(x => !preferred.includes(x));
  const mixed = [...shuffle(rng, preferred), ...shuffle(rng, rest)];

  const selected = [];
  let pool = mixed.slice();

  while (selected.length < 15) {
    if (!pool.length) pool = shuffle(rng, all);
    const candidate = pool.shift();
    if (selected.filter(x => x === candidate).length < 2) selected.push(candidate);
  }

  return selected;
}

function percentTask(rng, difficulty) {
  const base = difficulty === "easy" ? [100, 500] : difficulty === "medium" ? [500, 3000] : [1000, 10000];
  const price = num(rng, base[0], base[1]);
  const rate = pick(rng, difficulty === "easy" ? [5, 10, 20] : [7, 12, 15, 18, 25, 30]);
  const direction = pick(rng, ["выросла", "снизилась"]);
  const result = direction === "выросла" ? price * (1 + rate / 100) : price * (1 - rate / 100);
  return [`Цена ${price} ₽ ${direction} на ${rate}%. Какой стала цена?`, `${Math.round(result * 100) / 100} ₽`];
}

function mathTask(rng, difficulty) {
  const mult = difficulty === "easy" ? 1 : difficulty === "medium" ? 3 : 7;
  const type = pick(rng, ["add", "sub", "mul", "div", "square"]);
  if (type === "add") {
    const a = num(rng, 10 * mult, 40 * mult), b = num(rng, 5 * mult, 35 * mult);
    return [`Сколько будет ${a} + ${b}?`, String(a + b)];
  }
  if (type === "sub") {
    const a = num(rng, 30 * mult, 90 * mult), b = num(rng, 5 * mult, 25 * mult);
    return [`Сколько будет ${a} - ${b}?`, String(a - b)];
  }
  if (type === "mul") {
    const a = num(rng, 3 * mult, 12 * mult), b = num(rng, 2, 12);
    return [`Сколько будет ${a} × ${b}?`, String(a * b)];
  }
  if (type === "div") {
    const b = num(rng, 2, 12), ans = num(rng, 3 * mult, 15 * mult);
    return [`Сколько будет ${ans * b} ÷ ${b}?`, String(ans)];
  }
  const a = num(rng, 5 * mult, 14 * mult);
  return [`Чему равен квадрат числа ${a}?`, String(a * a)];
}

function geometryTask(rng, difficulty) {
  const mult = difficulty === "easy" ? 1 : difficulty === "medium" ? 2 : 4;
  const type = pick(rng, ["rectArea", "rectPerim", "squareArea", "squarePerim"]);
  if (type === "rectArea") {
    const a = num(rng, 2 * mult, 10 * mult), b = num(rng, 2 * mult, 10 * mult);
    return [`Площадь прямоугольника со сторонами ${a} и ${b}?`, String(a * b)];
  }
  if (type === "rectPerim") {
    const a = num(rng, 2 * mult, 10 * mult), b = num(rng, 2 * mult, 10 * mult);
    return [`Периметр прямоугольника со сторонами ${a} и ${b}?`, String(2 * (a + b))];
  }
  if (type === "squareArea") {
    const a = num(rng, 2 * mult, 15 * mult);
    return [`Площадь квадрата со стороной ${a}?`, String(a * a)];
  }
  const a = num(rng, 2 * mult, 15 * mult);
  return [`Периметр квадрата со стороной ${a}?`, String(4 * a)];
}

function businessTask(rng, difficulty) {
  const revenue = num(rng, 100, difficulty === "easy" ? 900 : difficulty === "medium" ? 5000 : 20000) * 1000;
  const margin = pick(rng, difficulty === "easy" ? [10, 20, 25] : [12, 15, 18, 22, 30, 35]);
  const profit = Math.round(revenue * margin / 100);
  return [`Выручка ${revenue} ₽, маржинальность ${margin}%. Чему равна прибыль?`, `${profit} ₽`];
}

function generatedFallbackQuestion(rng, category, difficulty, gameUsed, globalUsed) {
  const generators = [mathTask, percentTask, geometryTask, businessTask];

  for (let i = 0; i < 80; i++) {
    const gen = pick(rng, generators);
    const qa = gen(rng, difficulty);
    const h = hashQuestion(qa[0]);
    if (!gameUsed.has(h) && !globalUsed.has(h)) {
      gameUsed.add(h);
      globalUsed.add(h);
      return qa;
    }
  }

  const unique = `${Date.now()}-${Math.floor(rng() * 1e9)}`;
  const qa = [`Резервный вопрос ${unique}: назови тему текущей категории.`, category];
  const h = hashQuestion(qa[0]);
  gameUsed.add(h);
  globalUsed.add(h);
  return qa;
}

function pickQuestionFromDB(rng, category, difficulty, gameUsed, globalUsed) {
  const cat = questionsDB[category];
  if (!cat) return generatedFallbackQuestion(rng, category, difficulty, gameUsed, globalUsed);

  const levels = difficulty === "easy"
    ? ["easy", "medium", "hard"]
    : difficulty === "medium"
      ? ["medium", "hard", "easy"]
      : ["hard", "medium", "easy"];

  for (const level of levels) {
    const arr = shuffle(rng, cat[level] || []);
    for (const qa of arr) {
      const h = hashQuestion(qa[0]);
      if (!gameUsed.has(h) && !globalUsed.has(h)) {
        gameUsed.add(h);
        globalUsed.add(h);
        return qa;
      }
    }
  }

  return generatedFallbackQuestion(rng, category, difficulty, gameUsed, globalUsed);
}

function generateGameData(options = {}) {
  const seed = options.seed || `${Date.now()}-${Math.random()}`;
  const topic = options.topic || "";
  const rng = createRng(seed);
  const globalUsed = loadUsed();
  const gameUsed = new Set();
  const selected = selectCategories(rng, topic);

  const rounds = [];

  for (let r = 0; r < 3; r++) {
    const cats = selected.slice(r * 5, r * 5 + 5).map(category => {
      const qs = [];
      for (let q = 0; q < 5; q++) {
        const difficulty = levelFor(r, q);
        qs.push(pickQuestionFromDB(rng, category, difficulty, gameUsed, globalUsed));
      }
      return { title: category, qs };
    });

    rounds.push({
      name: `Раунд ${r + 1}`,
      multiplier: r + 1,
      categories: cats
    });
  }

  const finalCategory = pick(rng, selected);
  const finalQA = pickQuestionFromDB(rng, finalCategory, "hard", gameUsed, globalUsed);
  saveUsed(globalUsed);

  return {
    rounds,
    final: {
      theme: `Финал: ${finalCategory}`,
      question: finalQA[0],
      answer: finalQA[1]
    },
    meta: {
      seed,
      topic,
      mode: "local_db_with_global_no_repeat",
      usedInThisGame: gameUsed.size
    }
  };
}

module.exports = {
  generateGameData,
  resetUsedQuestions
};