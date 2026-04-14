import { io, Socket } from "socket.io-client";
import {
  cleanPet,
  feed,
  loadPet,
  moodLine,
  petEmoji,
  renamePet,
  restPet,
  trainPet,
  type PetState,
} from "./pet";
import "./style.css";

type Move = "strike" | "guard" | "charge";

const ROUND_MS = 12_000;

const el = (html: string) => {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
};

function $(sel: string, root: Document | HTMLElement = document) {
  const n = root.querySelector(sel);
  if (!n) throw new Error(`Missing ${sel}`);
  return n as HTMLElement;
}

const UI = {
  title: "Pocket \u9023\u7dda\u5c0d\u6230",
  tagline:
    "\u985e\u4f3c\u5be6\u9ad4\u6a5f\u63a5\u9ede\uff0c\u533f\u540d\u958b\u623f\u5c0d\u6230",
  createHost: "\u958b\u623f\uff08\u4e3b\u6a5f\uff09",
  join: "\u52a0\u5165\u6230\u5c0d",
  roomPlaceholder: "\u623f\u9593\u78bc",
  waitConnect: "\u7b49\u5f85\u5c0d\u65b9\u63a5\u4e0a\u9023\u7dda\u2026",
  syncing: "\u9023\u7dda\u540c\u6b65\u4e2d\u2026",
  roomCodeLabel: "\u623f\u9593\u78bc",
  copyLink: "\u8907\u88fd\u9023\u7d50",
  copied: "\u5df2\u8907\u88fd",
  linked: "\u9023\u7dda\u6210\u529f\uff01",
  round: (n: number) => `\u7b2c ${n} \u56de\u5408`,
  chooseMove: "\u9078\u64c7\u884c\u52d5",
  lockedYou: "\u5df2\u9396\u5b9a\uff0c\u7b49\u5f85\u5c0d\u65b9",
  strike: "\u65ac\u64ca",
  guard: "\u67b6\u76fe",
  charge: "\u84c4\u529b",
  autoPick: "\u8d85\u6642\u5df2\u81ea\u52d5\u51fa\u62db",
  win: "\u4f60\u8d0f\u4e86\uff01",
  lose: "\u4f60\u8f38\u4e86\u2026",
  draw: "\u5e73\u624b\uff01",
  again: "\u56de\u5230\u9996\u9801",
  peerLeft: "\u5c0d\u65b9\u5df2\u65b7\u7dda",
  errGeneric: "\u9023\u7dda\u5931\u6557\uff0c\u8acb\u91cd\u8a66",
  needBackend:
    "\u5c0d\u6230\u9700\u8981\u5f8c\u7aef\uff1a\u8acb\u8a2d\u5b9a VITE_SOCKET_URL \u5f8c\u91cd\u65b0\u6253\u5305\uff0c\u6216\u53c3\u8003 deploy \u8aaa\u660e\u3002",
  hubSubtitle:
    "\u990a\u6210\u8207\u9023\u7dda\u5c0d\u6230\uff08\u990a\u6210\u8cc7\u6599\u50c5\u5b58\u5728\u6b64\u88dd\u7f6e\uff09",
  myPet: "\u6211\u7684\u5925\u4f34",
  battleSection: "\u9023\u7dda\u5c0d\u6230",
  backHome: "\u56de\u9996\u9801",
  statHunger: "\u98fd\u98df",
  statHappy: "\u5fc3\u60c5",
  statClean: "\u6e05\u6f54",
  statEnergy: "\u9ad4\u529b",
  statPower: "\u8a13\u7df4",
  actionFeed: "\u9935\u98df",
  actionClean: "\u6e05\u7406",
  actionTrain: "\u8a13\u7df4",
  actionRest: "\u4f11\u606f",
  trainBlocked: "\u9ad4\u529b\u4e0d\u8db3\uff0c\u5148\u4f11\u606f\u5427",
};

const socketServerUrl = (import.meta.env.VITE_SOCKET_URL || "").replace(/\/$/, "");

let socket: Socket | null = null;
let tickTimer: number | null = null;
let roomCode: string | null = null;
let role: "host" | "guest" | null = null;
let phase: "lobby" | "waiting" | "battle" | "end" = "lobby";

function ensureSocket(): Socket {
  if (socket?.connected) return socket;
  const opts = { transports: ["websocket", "polling"] as const, path: "/socket.io" };
  socket = io(
    socketServerUrl.length > 0 ? socketServerUrl : undefined,
    opts,
  );
  return socket;
}

function stopTick() {
  if (tickTimer != null) {
    window.clearInterval(tickTimer);
    tickTimer = null;
  }
}

function renderCare(root: HTMLElement) {
  let state: PetState = loadPet();

  root.replaceChildren(
    el(`
    <div class="shell care-shell">
      <button type="button" class="btn btn-secondary care-back" id="btn-care-back">${UI.backHome}</button>
      <div class="screen-bezel care-bezel">
        <div class="pet-stage">
          <div class="emoji pet-emoji-lg" id="pet-emoji"></div>
          <input class="pet-nick field" id="pet-nick" maxlength="12" autocomplete="off" />
        </div>
        <p class="pet-mood" id="pet-mood"></p>
        <div class="care-stats">
          <div class="care-stat">
            <span class="care-stat-label">${UI.statHunger}</span>
            <div class="hp-wrap care-bar"><div class="hp-fill care-hunger" id="bar-hunger" style="width:0%"></div></div>
            <span class="care-stat-val" id="val-hunger">0</span>
          </div>
          <div class="care-stat">
            <span class="care-stat-label">${UI.statHappy}</span>
            <div class="hp-wrap care-bar"><div class="hp-fill care-happy" id="bar-happy" style="width:0%"></div></div>
            <span class="care-stat-val" id="val-happy">0</span>
          </div>
          <div class="care-stat">
            <span class="care-stat-label">${UI.statClean}</span>
            <div class="hp-wrap care-bar"><div class="hp-fill care-clean" id="bar-clean" style="width:0%"></div></div>
            <span class="care-stat-val" id="val-clean">0</span>
          </div>
          <div class="care-stat">
            <span class="care-stat-label">${UI.statEnergy}</span>
            <div class="hp-wrap care-bar"><div class="hp-fill care-energy" id="bar-energy" style="width:0%"></div></div>
            <span class="care-stat-val" id="val-energy">0</span>
          </div>
          <div class="care-stat">
            <span class="care-stat-label">${UI.statPower}</span>
            <div class="hp-wrap care-bar"><div class="hp-fill care-power" id="bar-power" style="width:0%"></div></div>
            <span class="care-stat-val" id="val-power">0</span>
          </div>
        </div>
        <div class="care-actions">
          <button type="button" class="move-btn" data-care="feed">${UI.actionFeed}</button>
          <button type="button" class="move-btn" data-care="clean">${UI.actionClean}</button>
          <button type="button" class="move-btn" data-care="train">${UI.actionTrain}</button>
          <button type="button" class="move-btn" data-care="rest">${UI.actionRest}</button>
        </div>
        <p class="toast care-hint hidden" id="care-toast"></p>
      </div>
    </div>
  `),
  );

  const nickEl = $("#pet-nick", root) as HTMLInputElement;
  const moodEl = $("#pet-mood", root);
  const emojiEl = $("#pet-emoji", root);
  const toastEl = $("#care-toast", root);

  const paint = () => {
    nickEl.value = state.nickname;
    moodEl.textContent = moodLine(state);
    emojiEl.textContent = petEmoji(state.species);
    const setBar = (key: keyof PetState, barId: string, valId: string) => {
      const v = Math.round(Number(state[key]) || 0);
      ($(`#${barId}`, root) as HTMLElement).style.width = `${clampPct(v)}%`;
      $(`#${valId}`, root).textContent = String(v);
    };
    setBar("hunger", "bar-hunger", "val-hunger");
    setBar("happy", "bar-happy", "val-happy");
    setBar("clean", "bar-clean", "val-clean");
    setBar("energy", "bar-energy", "val-energy");
    setBar("power", "bar-power", "val-power");
  };

  const clampPct = (n: number) => Math.min(100, Math.max(0, n));

  const onNickCommit = () => {
    state = renamePet(state, nickEl.value);
    paint();
  };
  nickEl.addEventListener("change", onNickCommit);
  nickEl.addEventListener("blur", onNickCommit);

  $("#btn-care-back", root).addEventListener("click", () => renderLobby(root));

  root.querySelectorAll("[data-care]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const act = (btn as HTMLElement).dataset.care;
      toastEl.classList.add("hidden");
      if (act === "feed") state = feed(state);
      else if (act === "clean") state = cleanPet(state);
      else if (act === "train") {
        if (state.energy < 18) {
          toastEl.textContent = UI.trainBlocked;
          toastEl.classList.remove("hidden");
        } else {
          state = trainPet(state);
        }
      } else if (act === "rest") state = restPet(state);
      paint();
    });
  });

  paint();
}

function renderLobby(root: HTMLElement) {
  phase = "lobby";
  roomCode = null;
  role = null;
  stopTick();
  root.replaceChildren(
    el(`
 <div class="shell">
      <div class="status-pill"><span class="dot on"></span> LOCAL + ONLINE</div>
      <h1>${UI.title}</h1>
      <p class="tagline">${UI.hubSubtitle}</p>
      <div class="row" style="margin-bottom:14px">
        <button type="button" class="btn btn-primary" id="btn-care">${UI.myPet}</button>
      </div>
      <p class="care-section-label">${UI.battleSection}</p>
      <p class="tagline" style="margin-top:4px">${UI.tagline}</p>
      <p class="toast ${import.meta.env.PROD && !socketServerUrl ? "" : "hidden"}" id="backend-hint" style="margin-bottom:10px">${UI.needBackend}</p>
      <div class="row" style="margin-bottom:12px">
        <button type="button" class="btn btn-primary" id="btn-host">${UI.createHost}</button>
      </div>
      <input class="field" id="room-input" maxlength="8" autocomplete="off" placeholder="${UI.roomPlaceholder}" />
      <div class="row" style="margin-top:12px">
        <button type="button" class="btn btn-secondary" id="btn-join">${UI.join}</button>
      </div>
      <p class="toast hidden" id="lobby-toast"></p>
    </div>
  `),
  );

  $("#btn-care", root).addEventListener("click", () => renderCare(root));

  const toast = $("#lobby-toast", root);
  $("#btn-host", root).addEventListener("click", () => {
    toast.classList.add("hidden");
    const s = ensureSocket();
    s.emit("create_room", (res: { ok: boolean; roomCode?: string }) => {
      if (!res?.ok || !res.roomCode) {
        toast.textContent = UI.errGeneric;
        toast.classList.remove("hidden");
        return;
      }
      roomCode = res.roomCode;
      role = "host";
      renderWaiting(root, res.roomCode, true);
    });
  });

  $("#btn-join", root).addEventListener("click", () => {
    toast.classList.add("hidden");
    const code = ($("#room-input", root) as HTMLInputElement).value.trim().toUpperCase();
    if (code.length < 4) {
      toast.textContent = UI.roomPlaceholder;
      toast.classList.remove("hidden");
      return;
    }
    const s = ensureSocket();
    s.emit("join_room", { roomCode: code }, (res: { ok: boolean; error?: string }) => {
      if (!res?.ok) {
        toast.textContent = res?.error || UI.errGeneric;
        toast.classList.remove("hidden");
        return;
      }
      roomCode = code;
      role = "guest";
      renderWaiting(root, code, false);
    });
  });
}

function renderWaiting(root: HTMLElement, code: string, isHost: boolean) {
  phase = "waiting";
  const shareUrl = `${location.origin}${location.pathname}?join=${encodeURIComponent(code)}`;
  root.replaceChildren(
    el(`
    <div class="shell">
      <h1>${isHost ? UI.waitConnect : UI.syncing}</h1>
      <p class="tagline">${UI.roomCodeLabel}</p>
      <div class="code-display">${code}</div>
      <div class="connect-visual" aria-hidden="true">
        <span class="prong"></span><span style="opacity:.5">\u2694\ufe0f</span><span class="prong"></span>
      </div>
      ${
        isHost
          ? `<button type="button" class="btn btn-secondary" id="btn-copy">${UI.copyLink}</button>`
          : ""
      }
      <p class="toast hidden" id="wait-toast"></p>
    </div>
  `),
  );

  if (isHost) {
    $("#btn-copy", root).addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(shareUrl);
        $("#btn-copy", root).textContent = UI.copied;
 window.setTimeout(() => {
          ($("#btn-copy", root) as HTMLButtonElement).textContent = UI.copyLink;
        }, 2000);
      } catch {
        /* ignore */
      }
    });
  }

  const s = ensureSocket();
  s.removeAllListeners("linked");
  s.removeAllListeners("peer_left");
  const goBattle = () => {
    if (phase === "waiting") renderBattle(root);
  };
  const onPeerLeft = () => {
    const t = $("#wait-toast", root);
    t.textContent = UI.peerLeft;
    t.classList.remove("hidden");
    window.setTimeout(() => renderLobby(root), 1200);
  };

  s.on("linked", goBattle);
  s.on("peer_left", onPeerLeft);
}

function renderBattle(root: HTMLElement) {
  phase = "battle";
  stopTick();

  const youLabel = role === "host" ? "\u96f7\u866b\u7378" : "\u6676\u683c\u7378";
  const foeLabel = role === "host" ? "\u6676\u683c\u7378" : "\u96f7\u866b\u7378";
  const youEmoji = role === "host" ? "\u26a1" : "\ud83d\udc8e";
  const foeEmoji = role === "host" ? "\ud83d\udc8e" : "\u26a1";

  root.replaceChildren(
    el(`
    <div class="shell">
      <div class="screen-bezel">
        <div class="round-meta">
          <span id="round-label">${UI.round(1)}</span>
          <span class="timer" id="timer">--</span>
        </div>
        <div class="battle-arena">
          <div class="monster">
            <div class="emoji">${youEmoji}</div>
            <div class="name">${youLabel} \u00b7 \u6211\u65b9</div>
            <div class="hp-wrap"><div class="hp-fill" id="hp-you" style="width:100%"></div></div>
          </div>
          <div class="monster">
            <div class="emoji">${foeEmoji}</div>
            <div class="name">${foeLabel} \u00b7 \u5c0d\u624b</div>
            <div class="hp-wrap"><div class="hp-fill foe" id="hp-foe" style="width:100%"></div></div>
          </div>
        </div>
        <p style="font-size:0.8rem;color:var(--muted);margin:0 0 6px">${UI.chooseMove}</p>
        <div class="move-grid">
          <button type="button" class="move-btn" data-move="strike">${UI.strike}</button>
          <button type="button" class="move-btn" data-move="guard">${UI.guard}</button>
          <button type="button" class="move-btn" data-move="charge">${UI.charge}</button>
        </div>
        <p class="toast hidden" id="lock-hint"></p>
        <div class="log" id="battle-log"></div>
      </div>
    </div>
  `),
  );

  const s = ensureSocket();
  s.removeAllListeners("battle_state");
  s.removeAllListeners("round_result");
  s.removeAllListeners("battle_end");
  s.removeAllListeners("linked");
  s.removeAllListeners("peer_left");
  let myLocked = false;
  let deadlineTs = Date.now() + ROUND_MS;
  const logEl = $("#battle-log", root);
  const lockHint = $("#lock-hint", root);
  const timerEl = $("#timer", root);
  const roundLabel = $("#round-label", root);

  const appendLog = (line: string) => {
    const p = document.createElement("div");
    p.textContent = line;
    logEl.appendChild(p);
    logEl.scrollTop = logEl.scrollHeight;
  };

  const setHp = (yourHp: number, foeHp: number) => {
    ($("#hp-you", root) as HTMLElement).style.width = `${yourHp}%`;
    ($("#hp-foe", root) as HTMLElement).style.width = `${foeHp}%`;
  };

  const updateTimer = (deadline: number) => {
    deadlineTs = deadline;
    const left = Math.max(0, deadline - Date.now());
    timerEl.textContent = `${(left / 1000).toFixed(1)}s`;
  };

  const onBattleState = (st: {
    round: number;
    yourHp: number;
    foeHp: number;
    deadline: number;
    locked?: { host: boolean; guest: boolean };
  }) => {
    roundLabel.textContent = UI.round(st.round);
    setHp(st.yourHp, st.foeHp);
    updateTimer(st.deadline);
    if (st.locked) {
      const iAmHost = role === "host";
      const iLocked = iAmHost ? st.locked.host : st.locked.guest;
      myLocked = iLocked;
      lockHint.classList.toggle("hidden", !iLocked);
      lockHint.textContent = UI.lockedYou;
      root.querySelectorAll(".move-btn").forEach((b) => {
        (b as HTMLButtonElement).disabled = iLocked;
      });
    }
  };

  const onRoundResult = (r: {
    yourLog: string;
    foeLog: string;
    hp: { host: number; guest: number };
    yours: Move;
    theirs: Move;
    auto: boolean;
  }) => {
    myLocked = false;
    root.querySelectorAll(".move-btn").forEach((b) => {
      (b as HTMLButtonElement).disabled = false;
      b.classList.remove("selected");
    });
    lockHint.classList.add("hidden");
    const yh = role === "host" ? r.hp.host : r.hp.guest;
    const fh = role === "host" ? r.hp.guest : r.hp.host;
    setHp(yh, fh);
    appendLog(r.yourLog);
    if (r.auto) appendLog(`\u00bb ${UI.autoPick}`);
  };

  const onBattleEnd = (r: { winner: string; you: string }) => {
    stopTick();
    const iWon =
      (r.winner === "host" && r.you === "host") ||
      (r.winner === "guest" && r.you === "guest");
    const title =
      r.winner === "draw" ? UI.draw : iWon ? UI.win : UI.lose;
    showEndModal(root, title);
  };

  const onPeerLeftBattle = () => {
    stopTick();
    showEndModal(root, UI.peerLeft);
  };

  s.off("battle_state");
  s.off("round_result");
  s.off("battle_end");
  s.off("peer_left");
  s.on("battle_state", onBattleState);
  s.on("round_result", onRoundResult);
  s.on("battle_end", onBattleEnd);
  s.on("peer_left", onPeerLeftBattle);

  root.querySelectorAll(".move-btn").forEach((b) => {
    b.addEventListener("click", () => {
      if (myLocked) return;
      const move = (b as HTMLElement).dataset.move as Move;
      s.emit("choose_move", { move });
      b.classList.add("selected");
    });
  });

  tickTimer = window.setInterval(() => {
    const left = Math.max(0, deadlineTs - Date.now());
    timerEl.textContent = `${(left / 1000).toFixed(1)}s`;
  }, 100);
}

function showEndModal(root: HTMLElement, title: string) {
  const overlay = el(`
    <div class="modal-overlay" id="end-modal">
      <div class="modal">
        <h2>${title}</h2>
        <p>\u518d\u958b\u4e00\u623f\u5373\u53ef\u7e7c\u7e8c\u5c0d\u6230</p>
        <button type="button" class="btn btn-primary" id="btn-home">${UI.again}</button>
      </div>
    </div>
  `);
  document.body.appendChild(overlay);
  $("#btn-home", overlay).addEventListener("click", () => {
    overlay.remove();
    socket?.disconnect();
    socket = null;
    renderLobby(root);
  });
}

function boot() {
  const root = $("#app");
  const params = new URLSearchParams(location.search);
  const preJoin = params.get("join")?.toUpperCase().trim();
  renderLobby(root);
  if (preJoin && preJoin.length >= 4) {
    window.setTimeout(() => {
      const input = document.getElementById("room-input") as HTMLInputElement | null;
      if (input) input.value = preJoin;
      const s = ensureSocket();
      s.emit("join_room", { roomCode: preJoin }, (res: { ok: boolean; error?: string }) => {
        if (!res?.ok) {
          const toast = document.getElementById("lobby-toast");
          if (toast) {
            toast.textContent = res?.error || UI.errGeneric;
            toast.classList.remove("hidden");
          }
          return;
        }
        roomCode = preJoin;
        role = "guest";
        renderWaiting(root, preJoin, false);
      });
    }, 200);
  }
}

boot();
