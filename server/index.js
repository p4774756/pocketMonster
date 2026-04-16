import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync, readFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const dist = join(root, "dist");
const appVersion = JSON.parse(
  readFileSync(join(root, "package.json"), "utf-8"),
).version;
const isProd = process.env.NODE_ENV === "production";
const PORT = Number(process.env.PORT) || 3000;

const ROOM_TTL_MS = 30 * 60 * 1000;
const ROUND_MS = 12_000;
const MAX_ROUNDS = 12;
const START_HP = 100;
/** 蓄力本回合消耗的靈力（MP）。 */
const MP_COST_CHARGE = 8;
/** 架盾成功後回復的 MP（不超過上限）。 */
const MP_GUARD_RECOVER = 6;
/** 每回合結束後雙方自動回復的 MP。 */
const MP_REGEN_PER_ROUND = 5;

/** @typedef {'strike' | 'guard' | 'charge'} Move */

/**
 * `playerTag` 若存在則為恰好四位數字（0000–9999）。
 *
 * @typedef {{
 *   species: 'volt'|'crystal'|'chicken'|'cat'|'dog',
 *   nickname: string,
 *   virtAge: number,
 *   power: number,
 *   morphKey?: 'striker'|'guardian'|'survivor'|'harmony'|'cat_volt'|'cat_aqua'|'cat_flora'|'dog_volt'|'dog_aqua'|'dog_pyro'|'dog_tox'|'doodoo'|null,
 *   playerTag?: string|null,
 * }} PetSnap
 */

function defaultPetSnap() {
  return {
    species: /** @type {const} */ ("volt"),
    nickname: "\u73a9\u5bb6",
    virtAge: 18,
    power: 12,
    morphKey: null,
  };
}

/** @param {unknown} raw */
function parseRoomTitle(raw) {
  if (raw == null || typeof raw !== "string") return "";
  let s = raw.normalize("NFC").trim().slice(0, 24);
  s = s.replace(/[\u0000-\u001f\u007f]/g, "");
  return s;
}

/** @param {unknown} raw */
function parsePetSnap(raw) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const sp = o.species;
  const species =
    sp === "volt" ||
    sp === "crystal" ||
    sp === "chicken" ||
    sp === "cat" ||
    sp === "dog"
      ? sp
      : "volt";
  const nick = String(o.nickname ?? "")
    .trim()
    .slice(0, 12);
  const virtAge = Math.min(
    999,
    Math.max(0, Number(o.virtAge) || 0),
  );
  const powerNum = Number(o.power);
  const power = Number.isFinite(powerNum)
    ? Math.min(100, Math.max(0, Math.floor(powerNum)))
    : 12;
  const mk = o.morphKey;
  /** @type {'striker'|'guardian'|'survivor'|'harmony'|'cat_volt'|'cat_aqua'|'cat_flora'|'dog_volt'|'dog_aqua'|'dog_pyro'|'dog_tox'|'doodoo'|null} */
  let morphKey =
    mk === "striker" ||
    mk === "guardian" ||
    mk === "survivor" ||
    mk === "harmony" ||
    mk === "cat_volt" ||
    mk === "cat_aqua" ||
    mk === "cat_flora" ||
    mk === "dog_volt" ||
    mk === "dog_aqua" ||
    mk === "dog_pyro" ||
    mk === "dog_tox" ||
    mk === "doodoo"
      ? mk
      : null;
  if (mk === "dog_flora") morphKey = "dog_pyro";
  let playerTag = null;
  const ptRaw = o.playerTag;
  if (typeof ptRaw === "string") {
    const t = String(ptRaw).replace(/\D/g, "").slice(0, 4);
    if (t.length === 4) playerTag = t;
  }
  return {
    species,
    nickname: nick || "\u73a9\u5bb6",
    virtAge,
    power,
    morphKey,
    playerTag,
  };
}

/** 養成 power（0～100）換算戰鬥 MP 上限：約 26～44。 */
function mpMaxForPet(p) {
  const pwr =
    p && typeof p.power === "number" && !Number.isNaN(p.power) ? p.power : 12;
  return Math.min(44, 26 + Math.min(18, Math.floor(pwr / 4)));
}

/** 攻擊方物種：加在斬擊／蓄力的基礎段數上（蓄力仍再乘 1.35）。 */
function speciesAtkBonus(species) {
  if (species === "volt") return 2;
  if (species === "crystal") return 0;
  if (species === "chicken") return 1;
  if (species === "cat") return 1;
  if (species === "dog") return 1;
  return 0;
}

/** 受傷方物種：乘在「已結算防禦係數後」的傷害上（仍至少 2）。 */
function speciesDefMul(species) {
  if (species === "crystal") return 0.92;
  if (species === "cat") return 0.96;
  if (species === "dog") return 0.97;
  if (species === "chicken") return 0.98;
  return 1;
}

const app = express();
const httpServer = createServer(app);

const serveStatic =
  process.env.SERVE_STATIC !== "0" && isProd && existsSync(dist);

const io = new Server(httpServer, {
  cors: { origin: true, credentials: true },
});

/** 公開房清單變動時廣播；短防抖合併連續事件。 */
let openRoomsNotifyTimer = null;
function notifyOpenRoomsChanged() {
  if (openRoomsNotifyTimer != null) return;
  openRoomsNotifyTimer = setTimeout(() => {
    openRoomsNotifyTimer = null;
    io.emit("open_rooms_changed");
  }, 200);
}

/** `list_open_rooms`：每連線 1 秒內最多 10 次，防刷。 */
const listOpenRoomsHits = new Map();

/** 對戰快捷語 key 白名單（與 `src/main.ts` `BATTLE_EMOTE_IDS` 同步）。 */
const BATTLE_EMOTE_KEYS = new Set([
  "hi",
  "good_luck",
  "nice",
  "ouch",
  "hmm",
  "hurry",
  "gg",
  "thanks",
]);
/** 每連線 `battle_emote` 節流時間戳。 */
const battleEmoteLastTs = new Map();
const BATTLE_EMOTE_COOLDOWN_MS = 2200;

/** @param {string} socketId @param {number} now */
function allowListOpenRoomsHit(socketId, now) {
  let arr = listOpenRoomsHits.get(socketId);
  if (!arr) {
    arr = [];
    listOpenRoomsHits.set(socketId, arr);
  }
  const cutoff = now - 1000;
  while (arr.length > 0 && arr[0] < cutoff) arr.shift();
  if (arr.length >= 10) return false;
  arr.push(now);
  return true;
}

app.get("/health", (_req, res) => {
  res.type("text/plain").send("ok");
});

app.get("/version", (_req, res) => {
  res.type("text/plain").send(String(appVersion));
});

if (serveStatic) {
  app.use(express.static(dist));
}

function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 4; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

/** @type {Map<string, { created: number, hostId: string, guestId?: string, battle?: Battle, roomTitle?: string }>} */
const rooms = new Map();

/** @type {Map<string, { roomCode: string, role: 'host' | 'guest' }>} */
const socketRoom = new Map();

/**
 * @typedef {Object} Battle
 * @property {number} round
 * @property {Record<string, number>} hp
 * @property {Record<string, number>} chargeBonus
 * @property {Record<string, Move | null>} pending
 * @property {Record<string, number>} mp
 * @property {Record<string, number>} mpMax
 * @property {number | null} deadline
 * @property {ReturnType<typeof setTimeout> | null} timer
 */

function cleanupRoom(code) {
  const r = rooms.get(code);
  if (!r) return;
  if (r.battle?.timer) clearTimeout(r.battle.timer);
  rooms.delete(code);
  notifyOpenRoomsChanged();
}

function pruneStaleRooms() {
  const now = Date.now();
  for (const [code, r] of rooms) {
    if (now - r.created > ROOM_TTL_MS) {
      cleanupRoom(code);
    }
  }
}

setInterval(pruneStaleRooms, 60_000);

function resolveRound(
  moveHost,
  moveGuest,
  bonusHost,
  bonusGuest,
  speciesHost,
  speciesGuest,
) {
  /** @type {{ hostLog: string, guestLog: string, dmgToHost: number, dmgToGuest: number }} */
  const out = {
    hostLog: "",
    guestLog: "",
    dmgToHost: 0,
    dmgToGuest: 0,
  };

  const strikeBaseHost =
    14 + bonusHost + speciesAtkBonus(/** @type {string} */ (speciesHost));
  const strikeBaseGuest =
    14 + bonusGuest + speciesAtkBonus(/** @type {string} */ (speciesGuest));

  const hostAttacks = moveHost === "strike" || moveHost === "charge";
  const guestAttacks = moveGuest === "strike" || moveGuest === "charge";

  const hostCharge = moveHost === "charge";
  const guestCharge = moveGuest === "charge";

  const hostGuard = moveHost === "guard";
  const guestGuard = moveGuest === "guard";

  if (guestAttacks) {
    let raw = guestCharge ? Math.round(strikeBaseGuest * 1.35) : strikeBaseGuest;
    if (hostGuard) {
      raw = Math.max(2, Math.round(raw * 0.25));
    }
    raw = Math.max(
      2,
      Math.round(raw * speciesDefMul(/** @type {string} */ (speciesHost))),
    );
    if (hostGuard) {
      out.hostLog += `\u5c0d\u65b9\u653b\u64ca\u88ab\u9632\u4f4f\uff0c\u4ecd\u53d7\u5230 ${raw} \u9ede\u50b7\u5bb3\u3002`;
    } else {
      out.hostLog += `\u5c0d\u65b9\u653b\u64ca\u9020\u6210 ${raw} \u9ede\u50b7\u5bb3\u3002`;
    }
    out.dmgToHost = raw;
  } else if (moveGuest === "guard") {
    out.hostLog += "\u5c0d\u65b9\u8209\u76fe\u9632\u79a6\u3002";
  }

  if (hostAttacks) {
    let raw = hostCharge ? Math.round(strikeBaseHost * 1.35) : strikeBaseHost;
    if (guestGuard) {
      raw = Math.max(2, Math.round(raw * 0.25));
    }
    raw = Math.max(
      2,
      Math.round(raw * speciesDefMul(/** @type {string} */ (speciesGuest))),
    );
    if (guestGuard) {
      out.guestLog += `\u5c0d\u65b9\u653b\u64ca\u88ab\u9632\u4f4f\uff0c\u4ecd\u53d7\u5230 ${raw} \u9ede\u50b7\u5bb3\u3002`;
    } else {
      out.guestLog += `\u5c0d\u65b9\u653b\u64ca\u9020\u6210 ${raw} \u9ede\u50b7\u5bb3\u3002`;
    }
    out.dmgToGuest = raw;
  } else if (moveHost === "guard") {
    out.guestLog += "\u5c0d\u65b9\u8209\u76fe\u9632\u79a6\u3002";
  }

  if (!out.hostLog) out.hostLog = "\u9019\u56de\u5408\u4f60\u6c92\u6709\u53d7\u50b7\u3002";
  if (!out.guestLog) out.guestLog = "\u9019\u56de\u5408\u4f60\u6c92\u6709\u53d7\u50b7\u3002";

  return out;
}

function broadcastBattleState(code, battle, extra = {}) {
  const r = rooms.get(code);
  if (!r?.hostId) return;
  const payloadBase = {
    round: battle.round,
    hp: { ...battle.hp },
    mp: { ...battle.mp },
    mpMax: { ...battle.mpMax },
    deadline: battle.deadline,
    ...extra,
  };
  io.to(r.hostId).emit("battle_state", {
    ...payloadBase,
    you: "host",
    yourHp: battle.hp.host,
    foeHp: battle.hp.guest,
    yourMp: battle.mp.host,
    yourMpMax: battle.mpMax.host,
    foeMp: battle.mp.guest,
    foeMpMax: battle.mpMax.guest,
  });
  if (r.guestId) {
    io.to(r.guestId).emit("battle_state", {
      ...payloadBase,
      you: "guest",
      yourHp: battle.hp.guest,
      foeHp: battle.hp.host,
      yourMp: battle.mp.guest,
      yourMpMax: battle.mpMax.guest,
      foeMp: battle.mp.host,
      foeMpMax: battle.mpMax.host,
    });
  }
}

/** 超時隨機選招：MP 不足時不會選蓄力。 */
function randomMove(mp) {
  const opts = ["strike", "guard"];
  if (mp >= MP_COST_CHARGE) opts.push("charge");
  return opts[Math.floor(Math.random() * opts.length)];
}

function scheduleRoundTimeout(code) {
  const r = rooms.get(code);
  if (!r?.battle) return;
  const b = r.battle;
  if (b.timer) clearTimeout(b.timer);
  b.timer = setTimeout(() => applyMoves(code, true), ROUND_MS + 50);
}

function applyMoves(code, fromTimeout = false) {
  const r = rooms.get(code);
  if (!r?.battle || !r.guestId) return;
  const b = r.battle;

  if (b.timer) {
    clearTimeout(b.timer);
    b.timer = null;
  }

  let mh = b.pending.host;
  let mg = b.pending.guest;
  if (!mh) mh = randomMove(b.mp.host);
  if (!mg) mg = randomMove(b.mp.guest);
  if (mh === "charge" && b.mp.host < MP_COST_CHARGE) mh = "strike";
  if (mg === "charge" && b.mp.guest < MP_COST_CHARGE) mg = "strike";

  if (mh === "charge") b.mp.host -= MP_COST_CHARGE;
  if (mg === "charge") b.mp.guest -= MP_COST_CHARGE;

  const hostPet = r.hostPet || defaultPetSnap();
  const guestPet = r.guestPet || defaultPetSnap();
  const bonusH = b.chargeBonus.host;
  const bonusG = b.chargeBonus.guest;
  const res = resolveRound(
    mh,
    mg,
    bonusH,
    bonusG,
    hostPet.species,
    guestPet.species,
  );

  b.hp.host = Math.max(0, b.hp.host - res.dmgToHost);
  b.hp.guest = Math.max(0, b.hp.guest - res.dmgToGuest);

  b.chargeBonus.host = mh === "charge" ? 10 : 0;
  b.chargeBonus.guest = mg === "charge" ? 10 : 0;

  if (mh === "guard") {
    b.mp.host = Math.min(
      b.mpMax.host,
      b.mp.host + MP_GUARD_RECOVER,
    );
  }
  if (mg === "guard") {
    b.mp.guest = Math.min(
      b.mpMax.guest,
      b.mp.guest + MP_GUARD_RECOVER,
    );
  }
  b.mp.host = Math.min(
    b.mpMax.host,
    b.mp.host + MP_REGEN_PER_ROUND,
  );
  b.mp.guest = Math.min(
    b.mpMax.guest,
    b.mp.guest + MP_REGEN_PER_ROUND,
  );
  b.mp.host = Math.max(0, b.mp.host);
  b.mp.guest = Math.max(0, b.mp.guest);

  const auto = fromTimeout && (!b.pending.host || !b.pending.guest);

  io.to(r.hostId).emit("round_result", {
    yours: mh,
    theirs: mg,
    yourLog: res.hostLog,
    foeLog: res.guestLog,
    hp: { ...b.hp },
    mp: { ...b.mp },
    mpMax: { ...b.mpMax },
    auto,
  });
  io.to(r.guestId).emit("round_result", {
    yours: mg,
    theirs: mh,
    yourLog: res.guestLog,
    foeLog: res.hostLog,
    hp: { ...b.hp },
    mp: { ...b.mp },
    mpMax: { ...b.mpMax },
    auto,
  });

  b.pending = { host: null, guest: null };

  const winner =
    b.hp.host <= 0 || b.hp.guest <= 0
      ? b.hp.host <= 0 && b.hp.guest <= 0
        ? "draw"
        : b.hp.host <= 0
          ? "guest"
          : "host"
      : b.round >= MAX_ROUNDS
        ? b.hp.host === b.hp.guest
          ? "draw"
          : b.hp.host > b.hp.guest
            ? "host"
            : "guest"
        : null;

  if (winner) {
    io.to(r.hostId).emit("battle_end", {
      winner,
      you: "host",
      hp: { ...b.hp },
      forfeitBy: null,
    });
    io.to(r.guestId).emit("battle_end", {
      winner,
      you: "guest",
      hp: { ...b.hp },
      forfeitBy: null,
    });
    cleanupRoom(code);
    return;
  }

  b.round += 1;
  b.deadline = Date.now() + ROUND_MS;
  broadcastBattleState(code, b, { phase: "choose" });
  scheduleRoundTimeout(code);
}

function startBattle(code) {
  const r = rooms.get(code);
  if (!r?.guestId) return;
  const hostPet = r.hostPet || defaultPetSnap();
  const guestPet = r.guestPet || defaultPetSnap();
  const mpMaxH = mpMaxForPet(hostPet);
  const mpMaxG = mpMaxForPet(guestPet);
  /** @type {Battle} */
  const battle = {
    round: 1,
    hp: { host: START_HP, guest: START_HP },
    chargeBonus: { host: 0, guest: 0 },
    pending: { host: null, guest: null },
    mp: { host: mpMaxH, guest: mpMaxG },
    mpMax: { host: mpMaxH, guest: mpMaxG },
    deadline: Date.now() + ROUND_MS,
    timer: null,
  };
  r.battle = battle;
  io.to(r.hostId).emit("linked", {
    roomCode: code,
    role: "host",
    foe: guestPet,
  });
  io.to(r.guestId).emit("linked", {
    roomCode: code,
    role: "guest",
    foe: hostPet,
  });
  broadcastBattleState(code, battle, { phase: "choose" });
  scheduleRoundTimeout(code);
}

io.on("connection", (socket) => {
  socket.on("create_room", (payload, ack) => {
    let petPayload = payload;
    let cb = ack;
    if (typeof payload === "function") {
      cb = payload;
      petPayload = null;
    }
    pruneStaleRooms();
    let code = makeRoomCode();
    while (rooms.has(code)) code = makeRoomCode();
    const hostPet =
      parsePetSnap(
        petPayload && typeof petPayload === "object"
          ? /** @type {{ pet?: unknown }} */ (petPayload).pet
          : null,
      ) || defaultPetSnap();
    const roomTitle =
      petPayload && typeof petPayload === "object"
        ? parseRoomTitle(
            /** @type {{ roomTitle?: unknown }} */ (petPayload).roomTitle,
          )
        : "";
    rooms.set(code, {
      created: Date.now(),
      hostId: socket.id,
      hostPet,
      roomTitle,
    });
    socket.join(code);
    socketRoom.set(socket.id, { roomCode: code, role: "host" });
    if (typeof cb === "function")
      cb({ ok: true, roomCode: code, roomTitle });
    notifyOpenRoomsChanged();
  });

  socket.on("join_room", (payload, ack) => {
    pruneStaleRooms();
    const code = String(payload?.roomCode || "")
      .toUpperCase()
      .trim();
    const r = rooms.get(code);
    if (!r) {
      if (typeof ack === "function")
        ack({ ok: false, error: "\u627e\u4e0d\u5230\u623f\u9593" });
      return;
    }
    if (r.guestId) {
      if (typeof ack === "function")
        ack({ ok: false, error: "\u623f\u9593\u5df2\u6eff" });
      return;
    }
    if (r.hostId === socket.id) {
      if (typeof ack === "function")
        ack({ ok: false, error: "\u4f60\u662f\u623f\u4e3b" });
      return;
    }
    r.guestId = socket.id;
    r.guestPet = parsePetSnap(payload?.pet) || defaultPetSnap();
    socket.join(code);
    socketRoom.set(socket.id, { roomCode: code, role: "guest" });
    if (typeof ack === "function") ack({ ok: true, roomCode: code });
    io.to(r.hostId).emit("peer_joined");
    startBattle(code);
    notifyOpenRoomsChanged();
  });

  /** 列出尚無訪客、可加入的房間（不含自己開的房）。 */
  socket.on("list_open_rooms", (payload, ack) => {
    let cb = ack;
    if (typeof payload === "function") cb = payload;
    const now = Date.now();
    if (!allowListOpenRoomsHit(socket.id, now)) {
      if (typeof cb === "function") cb({ ok: false, error: "too_fast" });
      return;
    }
    pruneStaleRooms();
    /** @type {{ roomCode: string, roomTitle: string, hostNickname: string, hostSpecies: string, created: number }[]} */
    const out = [];
    for (const [code, r] of rooms) {
      if (!r.hostId || r.guestId) continue;
      if (r.hostId === socket.id) continue;
      const pet = r.hostPet || defaultPetSnap();
      const row = {
        roomCode: code,
        roomTitle: typeof r.roomTitle === "string" ? r.roomTitle : "",
        hostNickname: pet.nickname || "\u73a9\u5bb6",
        hostSpecies: pet.species,
        created: r.created,
      };
      if (pet.playerTag) row.hostPlayerTag = pet.playerTag;
      out.push(row);
    }
    out.sort((a, b) => b.created - a.created);
    const roomsOut = out.slice(0, 40);
    if (typeof cb === "function") cb({ ok: true, rooms: roomsOut });
  });

  socket.on("choose_move", (payload) => {
    const link = socketRoom.get(socket.id);
    if (!link) return;
    const r = rooms.get(link.roomCode);
    if (!r?.battle) return;
    const b = r.battle;
    const m = payload?.move;
    if (m !== "strike" && m !== "guard" && m !== "charge") return;
    if (link.role === "host") {
      if (b.pending.host) return;
      b.pending.host = m;
    } else {
      if (b.pending.guest) return;
      b.pending.guest = m;
    }
    broadcastBattleState(link.roomCode, b, {
      phase: "choose",
      locked: {
        host: Boolean(b.pending.host),
        guest: Boolean(b.pending.guest),
      },
    });
    if (b.pending.host && b.pending.guest) {
      applyMoves(link.roomCode, false);
    }
  });

  socket.on("battle_emote", (payload) => {
    const link = socketRoom.get(socket.id);
    if (!link) return;
    const r = rooms.get(link.roomCode);
    if (!r?.battle || !r.guestId) return;
    const raw =
      payload && typeof payload === "object"
        ? /** @type {{ key?: unknown }} */ (payload).key
        : null;
    const key = typeof raw === "string" ? raw.trim() : "";
    if (!BATTLE_EMOTE_KEYS.has(key)) return;
    const now = Date.now();
    const prev = battleEmoteLastTs.get(socket.id) || 0;
    if (now - prev < BATTLE_EMOTE_COOLDOWN_MS) return;
    battleEmoteLastTs.set(socket.id, now);
    const peerId = socket.id === r.hostId ? r.guestId : r.hostId;
    if (!peerId) return;
    io.to(peerId).emit("battle_emote", { key });
  });

  socket.on("forfeit", () => {
    const link = socketRoom.get(socket.id);
    if (!link) return;
    const r = rooms.get(link.roomCode);
    if (!r?.battle || !r.guestId) return;
    const winner = link.role === "host" ? "guest" : "host";
    const forfeiter = link.role;
    if (r.battle.timer) {
      clearTimeout(r.battle.timer);
      r.battle.timer = null;
    }
    io.to(r.hostId).emit("battle_end", {
      winner,
      you: "host",
      hp: { ...r.battle.hp },
      forfeitBy: forfeiter,
    });
    io.to(r.guestId).emit("battle_end", {
      winner,
      you: "guest",
      hp: { ...r.battle.hp },
      forfeitBy: forfeiter,
    });
    cleanupRoom(link.roomCode);
  });

  socket.on("disconnect", () => {
    listOpenRoomsHits.delete(socket.id);
    battleEmoteLastTs.delete(socket.id);
    const link = socketRoom.get(socket.id);
    socketRoom.delete(socket.id);
    if (!link) return;
    const r = rooms.get(link.roomCode);
    if (!r) return;
    if (link.role === "host") {
      if (r.guestId) io.to(r.guestId).emit("peer_left");
      cleanupRoom(link.roomCode);
    } else {
      r.guestId = undefined;
      r.guestPet = undefined;
      if (r.battle?.timer) clearTimeout(r.battle.timer);
      r.battle = undefined;
      io.to(r.hostId).emit("peer_left");
      notifyOpenRoomsChanged();
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`[pocket-pet] v${appVersion} http://localhost:${PORT}`);
});

if (serveStatic) {
  app.get("*", (req, res) => {
    const index = join(dist, "index.html");
    if (existsSync(index)) {
      res.sendFile(index);
    } else {
      res.status(404).send("Build missing. Run npm run build.");
    }
  });
}
