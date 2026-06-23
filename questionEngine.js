const fs = require("fs");
const path = require("path");

const DB = JSON.parse(fs.readFileSync(path.join(__dirname, "questionsDB.json"), "utf8"));

function makeRng(seed) {
  let h = 2166136261;
  for (let i = 0; i < String(seed).length; i++) {
    h ^= String(seed).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return function rng() {
    h += h << 13; h ^= h >>> 7;
    h += h << 3; h ^= h >>> 17;
    h += h << 5;
    return ((h >>> 0) / 4294967296);
  };
}

function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function num(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function level(roundIndex, qIndex) {
  if (roundIndex === 0 && qIndex <= 1) return "easy";
  if (roundIndex === 0 && qIndex <= 3) return "medium";
  if (roundIndex === 1 && qIndex <= 1) return "medium";
  return "hard";
}

function mathQuestion(rng, difficulty) {
  const mult = difficulty === "easy" ? 1 : difficulty === "medium" ? 3 : 7;
  const type = pick(rng, ["add", "sub", "mul", "percentUp", "percentDown"]);

  if (type === "add") {
    const a = num(rng, 10 * mult, 50 * mult);
    const b = num(rng, 5 * mult, 40 * mult);
    return [`Сколько будет ${a} + ${b}?`, String(a + b)];
  }

  if (type === "sub") {
    const a = num(rng, 30 * mult, 100 * mult);
    const b = num(rng, 5 * mult, 40 * mult);
    return [`Сколько будет ${a} - ${b}?`, String(a - b)];
  }

  if (type === "mul") {
    const a = num(rng, 3 * mult, 12 * mult);
    const b = num(rng, 2, 12);
    return [`Сколько будет ${a} × ${b}?`, String(a * b)];
  }

  const price = num(rng, 100 * mult, 600 * mult);
  const rate = pick(rng, [5, 10, 15, 20, 25, 30]);

  if (type === "percentUp") {
    return [`Цена ${price} ₽ выросла на ${rate}%. Какой стала цена?`, `${Math.round(price * (1 + rate / 100) * 100) / 100} ₽`];
  }

  return [`Цена ${price} ₽ снизилась на ${rate}%. Какой стала цена?`, `${Math.round(price * (1 - rate / 100) * 100) / 100} ₽`];
}

function chooseCategories(rng, topic) {
  const all = Object.keys(DB);
  const t = String(topic || "").toLowerCase();

  const preferred = [];
  for (const name of all) {
    if (t && (t.includes(name.toLowerCase()) || name.toLowerCase().includes(t))) preferred.push(name);
  }

  if (t.includes("росс") || t.includes("2000")) preferred.push("Россия и 2000-е");
  if (t.includes("фин") || t.includes("день")) preferred.push("Финансы");
  if (t.includes("кино")) preferred.push("Кино");
  if (t.includes("муз")) preferred.push("Музыка");
  if (t.includes("спорт")) preferred.push("Спорт");
  if (t.includes("истор")) preferred.push("История");
  if (t.includes("гео")) preferred.push("География");
  if (t.includes("лог")) preferred.push("Логика");
  if (t.includes("тех") || t.includes("it") || t.includes("айти")) preferred.push("Технологии");

  const unique = [...new Set(preferred)].filter(x => all.includes(x));
  const pool = [...shuffle(rng, unique), ...shuffle(rng, all.filter(x => !unique.includes(x)))];

  const selected = [];
  while (selected.length < 15) {
    for (const c of pool) {
      selected.push(c);
      if (selected.length >= 15) break;
    }
  }
  return selected;
}

function generateGameData({ seed, topic } = {}) {
  const rng = makeRng(seed || Date.now());
  const selected = chooseCategories(rng, topic);
  const used = new Set();
  const rounds = [];

  for (let r = 0; r < 3; r++) {
    const categories = [];
    for (let c = 0; c < 5; c++) {
      const title = selected[r * 5 + c];
      const qs = [];
      for (let q = 0; q < 5; q++) {
        const diff = level(r, q);
        const variants = shuffle(rng, DB[title]?.[diff] || []);
        let chosen = variants.find(x => !used.has(x[0]));
        if (!chosen) chosen = mathQuestion(rng, diff);

        used.add(chosen[0]);
        qs.push(chosen);
      }
      categories.push({ title, qs });
    }
    rounds.push({ name: `Раунд ${r + 1}`, multiplier: r + 1, categories });
  }

  const finalCategory = pick(rng, selected);
  const finalVariants = shuffle(rng, DB[finalCategory]?.hard || []);
  const final = finalVariants.find(x => !used.has(x[0])) || mathQuestion(rng, "hard");

  return {
    rounds,
    final: {
      theme: `Финал: ${finalCategory}`,
      question: final[0],
      answer: final[1]
    },
    meta: { seed, topic: topic || "", generatedAt: new Date().toISOString() }
  };
}

module.exports = { generateGameData };