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

/** @typedef {'strike' | 'guard' | 'charge'} Move */

const app = express();
const httpServer = createServer(app);

const serveStatic =
  process.env.SERVE_STATIC !== "0" && isProd && existsSync(dist);

const io = new Server(httpServer, {
  cors: { origin: true, credentials: true },
});

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
  for (let i = 0; i < 6; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

/** @type {Map<string, { created: number, hostId: string, guestId?: string, battle?: Battle }>} */
const rooms = new Map();

/** @type {Map<string, { roomCode: string, role: 'host' | 'guest' }>} */
const socketRoom = new Map();

/**
 * @typedef {Object} Battle
 * @property {number} round
 * @property {Record<string, number>} hp
 * @property {Record<string, number>} chargeBonus
 * @property {Record<string, Move | null>} pending
 * @property {number | null} deadline
 * @property {ReturnType<typeof setTimeout> | null} timer
 */

function cleanupRoom(code) {
  const r = rooms.get(code);
  if (!r) return;
  if (r.battle?.timer) clearTimeout(r.battle.timer);
  rooms.delete(code);
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

function resolveRound(moveHost, moveGuest, bonusHost, bonusGuest) {
  /** @type {{ hostLog: string, guestLog: string, dmgToHost: number, dmgToGuest: number }} */
  const out = {
    hostLog: "",
    guestLog: "",
    dmgToHost: 0,
    dmgToGuest: 0,
  };

  const strikeBaseHost = 14 + bonusHost;
  const strikeBaseGuest = 14 + bonusGuest;

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
    deadline: battle.deadline,
    ...extra,
  };
  io.to(r.hostId).emit("battle_state", {
    ...payloadBase,
    you: "host",
    yourHp: battle.hp.host,
    foeHp: battle.hp.guest,
  });
  if (r.guestId) {
    io.to(r.guestId).emit("battle_state", {
      ...payloadBase,
      you: "guest",
      yourHp: battle.hp.guest,
      foeHp: battle.hp.host,
    });
  }
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
  if (!mh) mh = ["strike", "guard", "charge"][Math.floor(Math.random() * 3)];
  if (!mg) mg = ["strike", "guard", "charge"][Math.floor(Math.random() * 3)];

  const bonusH = b.chargeBonus.host;
  const bonusG = b.chargeBonus.guest;
  const res = resolveRound(mh, mg, bonusH, bonusG);

  b.hp.host = Math.max(0, b.hp.host - res.dmgToHost);
  b.hp.guest = Math.max(0, b.hp.guest - res.dmgToGuest);

  b.chargeBonus.host = mh === "charge" ? 10 : 0;
  b.chargeBonus.guest = mg === "charge" ? 10 : 0;

  const auto = fromTimeout && (!b.pending.host || !b.pending.guest);

  io.to(r.hostId).emit("round_result", {
    yours: mh,
    theirs: mg,
    yourLog: res.hostLog,
    foeLog: res.guestLog,
    hp: { ...b.hp },
    auto,
  });
  io.to(r.guestId).emit("round_result", {
    yours: mg,
    theirs: mh,
    yourLog: res.guestLog,
    foeLog: res.hostLog,
    hp: { ...b.hp },
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
  /** @type {Battle} */
  const battle = {
    round: 1,
    hp: { host: START_HP, guest: START_HP },
    chargeBonus: { host: 0, guest: 0 },
    pending: { host: null, guest: null },
    deadline: Date.now() + ROUND_MS,
    timer: null,
  };
  r.battle = battle;
  io.to(r.hostId).emit("linked", { roomCode: code, role: "host" });
  io.to(r.guestId).emit("linked", { roomCode: code, role: "guest" });
  broadcastBattleState(code, battle, { phase: "choose" });
  scheduleRoundTimeout(code);
}

io.on("connection", (socket) => {
  socket.on("create_room", (ack) => {
    pruneStaleRooms();
    let code = makeRoomCode();
    while (rooms.has(code)) code = makeRoomCode();
    rooms.set(code, { created: Date.now(), hostId: socket.id });
    socket.join(code);
    socketRoom.set(socket.id, { roomCode: code, role: "host" });
    if (typeof ack === "function") ack({ ok: true, roomCode: code });
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
    socket.join(code);
    socketRoom.set(socket.id, { roomCode: code, role: "guest" });
    if (typeof ack === "function") ack({ ok: true, roomCode: code });
    io.to(r.hostId).emit("peer_joined");
    startBattle(code);
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
      if (r.battle?.timer) clearTimeout(r.battle.timer);
      r.battle = undefined;
      io.to(r.hostId).emit("peer_left");
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
