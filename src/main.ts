import { io, Socket } from "socket.io-client";
import {
  careIdleSpriteFile,
  carePoseFile,
  cleanPet,
  feed,
  formatVirtAgeDays,
  growthLabelForPet,
  growthSpriteScale,
  growthStage,
  idleSpriteForSpeciesStage,
  loadPet,
  memorialLine,
  moodLine,
  petDefaultName,
  randomFoeSpecies,
  renamePet,
  resetNewPet,
  restPet,
  trainPet,
  treatPet,
  type CarePose,
  type PetSpecies,
  type PetState,
} from "./pet";
import "./style.css";
import { mountThemeBar } from "./theme";

type Move = "strike" | "guard" | "charge";

const ROUND_MS = 12_000;

function petAssetUrl(file: string) {
  return `${import.meta.env.BASE_URL}pets/${file}`;
}

/** DOM uses numeric ids; with @types/node merged, `setTimeout` may be typed as `NodeJS.Timeout`. */
function domSetTimeout(fn: () => void, ms: number): number {
  return window.setTimeout(fn, ms) as unknown as number;
}

function domSetInterval(fn: () => void, ms: number): number {
  return window.setInterval(fn, ms) as unknown as number;
}

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

let nextCareFlash: string | null = null;
function flashCare(msg: string) {
  nextCareFlash = msg;
}
function consumeCareFlash(): string | null {
  const m = nextCareFlash;
  nextCareFlash = null;
  return m;
}

const UI = {
  tagline:
    "\u985e\u4f3c\u5be6\u9ad4\u6a5f\u63a5\u9ede\uff0c\u533f\u540d\u958b\u623f\u5c0d\u6230",
  createHost: "\u958b\u623f\uff08\u4e3b\u6a5f\uff09",
  join: "\u52a0\u5165\u6230\u5c0d",
  roomPlaceholder: "\u623f\u9593\u78bc",
  waitConnect: "\u7b49\u5f85\u5c0d\u65b9\u63a5\u4e0a\u9023\u7dda\u2026",
  syncing: "\u9023\u7dda\u540c\u6b65\u4e2d\u2026",
  roomCodeLabel: "\u623f\u9593\u78bc",
  copyRoomCode: "\u8907\u88fd\u623f\u9593\u78bc",
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
  again: "\u56de\u5230\u6211\u7684\u5925\u4f34",
  endModalHint:
    "\u7e7c\u7e8c\u990a\u6210\u6216\u518d\u958b\u4e00\u623f\u5c0d\u6230\u3002",
  peerLeft: "\u5c0d\u65b9\u5df2\u65b7\u7dda",
  errGeneric: "\u9023\u7dda\u5931\u6557\uff0c\u8acb\u91cd\u8a66",
  needBackend:
    "\u5c0d\u6230\u9700\u8981\u5f8c\u7aef\uff1a\u8acb\u8a2d\u5b9a VITE_SOCKET_URL \u5f8c\u91cd\u65b0\u6253\u5305\uff0c\u6216\u53c3\u8003 deploy \u8aaa\u660e\u3002",
  hubSubtitle:
    "\u533f\u540d\u958b\u623f\u3001\u8f38\u5165\u623f\u9593\u78bc\u5373\u53ef\u5c0d\u6230\uff08\u990a\u6210\u8cc7\u6599\u5728\u4e0a\u4e00\u9801\uff09",
  battleSection: "\u9023\u7dda\u5c0d\u6230",
  openBattle: "\u9023\u7dda\u5c0d\u6230",
  backToPet: "\u56de\u5230\u6211\u7684\u5925\u4f34",
  restartAdopt: "\u91cd\u65b0\u8a8d\u990a",
  confirmRestartAdopt:
    "\u78ba\u5b9a\u8981\u91cd\u65b0\u8a8d\u990a\uff1f\u73fe\u6709\u990a\u6210\u9032\u5ea6\u6703\u5168\u90e8\u6e05\u9664\u4e14\u7121\u6cd5\u9084\u539f\u3002\u65b0\u5925\u4f34\u53ef\u80fd\u662f\u8c93\u3001\u96de\uff0c\u6216\u5f9e\u86cb\u536f\u5316\u7684\u5947\u7378\u3002",
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
  trainBlockedIll:
    "\u751f\u75c5\u6642\u66f4\u7d2f\uff0c\u9ad4\u529b\u8981\u66f4\u9ad8\u624d\u80fd\u8a13\u7df4",
  treat: "\u770b\u91ab\u751f\uff08\u6cbb\u7652\uff09",
  memorialTitle: "\u5925\u4f34\u96e2\u958b\u4e86",
  memorialSub: "\u8b1d\u8b1d\u4f60\u9019\u6bb5\u6642\u9593\u7684\u966a\u4f34\u3002",
  memorialDays: (n: number) =>
    `\u5171\u5ea6\u904e\u4e86\u7d04 ${n} \u500b\u865b\u64ec\u65e5\u3002`,
  newPet: "\u8fce\u63a5\u65b0\u5925\u4f34",
  deadPetBattleBlocked:
    "\u5925\u4f34\u5df2\u96e2\u958b\uff0c\u7121\u6cd5\u9023\u7dda\u5c0d\u6230\u3002\u8acb\u5148\u5728\u7d00\u5ff5\u9801\u9762\u8fce\u63a5\u65b0\u751f\u547d\u3002",
  eggBattleBlocked:
    "\u9084\u5728\u86cb\u88e1\uff0c\u7b49\u536f\u5316\u5f8c\u518d\u9023\u7dda\u5c0d\u6230\u5427\u3002",
  eggTrainBlocked:
    "\u9084\u6c92\u536f\u5316\uff0c\u5148\u5225\u8a13\u7df4\u56c9\u3002",
  justHatched: "\u7834\u6bbc\u4e86\uff01\u4f86\u6253\u500b\u62db\u547c\u5427\uff5e",
  cancelWait: "\u53d6\u6d88",
  surrenderLeave: "\u6295\u964d\uff0f\u96e2\u958b",
  confirmForfeit:
    "\u78ba\u5b9a\u8981\u6295\u964d\u4e26\u7d50\u675f\u5c0d\u6230\u55ce\uff1f",
  youSurrendered: "\u4f60\u5df2\u6295\u964d",
  foeSurrenderYouWin: "\u5c0d\u65b9\u6295\u964d\uff0c\u4f60\u8d0f\u4e86\uff01",
};

const socketServerUrl = (import.meta.env.VITE_SOCKET_URL || "").replace(/\/$/, "");

let socket: Socket | null = null;
let tickTimer: number | null = null;
let roomCode: string | null = null;
let role: "host" | "guest" | null = null;
let phase: "lobby" | "waiting" | "battle" | "end" = "lobby";

function ensureSocket(): Socket {
  if (socket?.connected) return socket;
  const opts = {
    transports: ["websocket", "polling"] as string[],
    path: "/socket.io",
  };
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

function cancelWaitingAndReturn(root: HTMLElement) {
  const s = socket;
  if (s) {
    s.removeAllListeners("linked");
    s.removeAllListeners("peer_left");
    s.disconnect();
  }
  socket = null;
  renderCare(root);
}

function renderMemorial(
  root: HTMLElement,
  state: PetState,
  hint: string | null = null,
) {
  const days = Math.max(0, Math.floor(state.virtAge));
  const hintBlock =
    hint && hint.length > 0
      ? `<p class="memorial-hint">${escapeHtml(hint)}</p>`
      : "";
  root.replaceChildren(
    el(`
    <div class="shell care-shell memorial-shell">
      <div class="screen-bezel memorial-bezel">
        <h2 class="memorial-title">${UI.memorialTitle}</h2>
        <p class="memorial-name">\u300c${escapeHtml(state.nickname)}\u300d</p>
        <p class="memorial-cause">${escapeHtml(memorialLine(state.deathCause))}</p>
        <p class="memorial-days">${UI.memorialDays(days)}</p>
        ${hintBlock}
        <p class="memorial-sub">${UI.memorialSub}</p>
        <button type="button" class="btn btn-primary memorial-btn" id="btn-new-pet">${UI.newPet}</button>
      </div>
    </div>
  `),
  );
  $("#btn-new-pet", root).addEventListener("click", () => {
    resetNewPet();
    renderCare(root);
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderCare(root: HTMLElement) {
  const hint = consumeCareFlash();
  let state: PetState = loadPet();
  if (!state.alive) {
    renderMemorial(root, state, hint);
    return;
  }

  root.replaceChildren(
    el(`
    <div class="shell care-shell shell--care">
      <div class="row care-top-actions">
        <button type="button" class="btn btn-primary" id="btn-open-battle">${UI.openBattle}</button>
        <button type="button" class="btn btn-secondary" id="btn-restart-adopt">${UI.restartAdopt}</button>
      </div>
      <div class="screen-bezel care-bezel">
        <div class="pet-stage" id="pet-stage">
          <img class="pet-sprite" id="pet-sprite" alt="" width="96" height="96" decoding="async" />
          <input class="pet-nick field" id="pet-nick" maxlength="12" autocomplete="off" />
        </div>
        <p class="pet-age-line" id="pet-age-line"></p>
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
        <button type="button" class="move-btn care-treat hidden" id="btn-treat" data-care="treat">${UI.treat}</button>
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
  const ageLineEl = $("#pet-age-line", root);
  const stageEl = $("#pet-stage", root);
  const treatBtn = $("#btn-treat", root);
  const spriteEl = $("#pet-sprite", root) as HTMLImageElement;
  const toastEl = $("#care-toast", root);
  let reactionTimer: number | null = null;

  if (hint) {
    toastEl.textContent = hint;
    toastEl.classList.remove("hidden");
  }

  const syncSpriteSpecies = () => {
    spriteEl.classList.toggle("pet-sprite--alt", state.species === "crystal");
  };

  const showCareIdleSprite = () => {
    spriteEl.src = petAssetUrl(careIdleSpriteFile(state));
    syncSpriteSpecies();
  };

  const flashCareSprite = (pose: CarePose) => {
    if (!state.hatched) {
      showCareIdleSprite();
      return;
    }
    if (reactionTimer != null) window.clearTimeout(reactionTimer);
    spriteEl.src = petAssetUrl(carePoseFile(state.species, pose));
    syncSpriteSpecies();
    reactionTimer = domSetTimeout(() => {
      showCareIdleSprite();
      reactionTimer = null;
    }, 1700);
  };

  const paint = () => {
    nickEl.value = state.nickname;
    moodEl.textContent = moodLine(state);
    const st = growthStage(state.virtAge);
    ageLineEl.textContent = `${formatVirtAgeDays(state.virtAge)} \u00b7 ${growthLabelForPet(state)}`;
    stageEl.classList.toggle("pet-stage--senior", state.hatched && st === 4);
    const sc = state.hatched
      ? growthSpriteScale(st)
      : growthSpriteScale(0) * 0.9;
    spriteEl.style.transform = `scale(${sc})`;
    syncSpriteSpecies();
    treatBtn.classList.toggle("hidden", !state.ill);
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

  $("#btn-open-battle", root).addEventListener("click", () => {
    if (!state.hatched) {
      flashCare(UI.eggBattleBlocked);
      renderCare(root);
      return;
    }
    if (reactionTimer != null) window.clearTimeout(reactionTimer);
    renderLobby(root);
  });

  $("#btn-restart-adopt", root).addEventListener("click", () => {
    if (!window.confirm(UI.confirmRestartAdopt)) return;
    if (reactionTimer != null) {
      window.clearTimeout(reactionTimer);
      reactionTimer = null;
    }
    resetNewPet();
    renderCare(root);
  });

  root.querySelectorAll("[data-care]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const act = (btn as HTMLElement).dataset.care;
      toastEl.classList.add("hidden");
      if (act === "feed") {
        const wasEgg = !state.hatched;
        state = feed(state);
        paint();
        if (wasEgg && state.hatched) {
          toastEl.textContent = UI.justHatched;
          toastEl.classList.remove("hidden");
        }
        flashCareSprite("eat");
        return;
      }
      if (act === "clean") {
        const wasEgg = !state.hatched;
        state = cleanPet(state);
        paint();
        if (wasEgg && state.hatched) {
          toastEl.textContent = UI.justHatched;
          toastEl.classList.remove("hidden");
        }
        flashCareSprite("clean");
        return;
      }
      if (act === "train") {
        if (!state.hatched) {
          toastEl.textContent = UI.eggTrainBlocked;
          toastEl.classList.remove("hidden");
          paint();
          return;
        }
        const need = state.ill ? 24 : 18;
        if (state.energy < need) {
          toastEl.textContent = state.ill ? UI.trainBlockedIll : UI.trainBlocked;
          toastEl.classList.remove("hidden");
          paint();
          return;
        }
        state = trainPet(state);
        paint();
        flashCareSprite("train");
        return;
      }
      if (act === "treat") {
        state = treatPet(state);
        paint();
        return;
      }
      if (act === "rest") {
        const wasEgg = !state.hatched;
        state = restPet(state);
        paint();
        if (wasEgg && state.hatched) {
          toastEl.textContent = UI.justHatched;
          toastEl.classList.remove("hidden");
        }
        flashCareSprite("rest");
        return;
      }
      paint();
    });
  });

  showCareIdleSprite();
  paint();
}

function renderLobby(root: HTMLElement) {
  const pet = loadPet();
  if (!pet.alive) {
    flashCare(UI.deadPetBattleBlocked);
    renderCare(root);
    return;
  }
  if (!pet.hatched) {
    flashCare(UI.eggBattleBlocked);
    renderCare(root);
    return;
  }
  phase = "lobby";
  roomCode = null;
  role = null;
  stopTick();
  root.replaceChildren(
    el(`
 <div class="shell shell--hub">
      <div class="status-pill"><span class="dot on"></span> ONLINE</div>
      <h1>${UI.battleSection}</h1>
      <p class="tagline">${UI.hubSubtitle}</p>
      <div class="row stack-gap">
        <button type="button" class="btn btn-secondary" id="btn-back-pet">${UI.backToPet}</button>
      </div>
      <p class="toast stack-gap-sm ${import.meta.env.PROD && !socketServerUrl ? "" : "hidden"}" id="backend-hint">${UI.needBackend}</p>
      <div class="row stack-gap-md">
        <button type="button" class="btn btn-primary" id="btn-host">${UI.createHost}</button>
      </div>
      <input class="field" id="room-input" maxlength="8" autocomplete="off" placeholder="${UI.roomPlaceholder}" />
      <div class="row mt-gap">
        <button type="button" class="btn btn-secondary" id="btn-join">${UI.join}</button>
      </div>
      <p class="toast hidden" id="lobby-toast"></p>
    </div>
  `),
  );

  $("#btn-back-pet", root).addEventListener("click", () => renderCare(root));

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
  root.replaceChildren(
    el(`
    <div class="shell shell--wait">
      <h1>${isHost ? UI.waitConnect : UI.syncing}</h1>
      <p class="tagline">${UI.roomCodeLabel}</p>
      <div class="code-display">${code}</div>
      <div class="connect-visual" aria-hidden="true">
        <span class="prong"></span><span class="connect-visual-ico">\u2694\ufe0f</span><span class="prong"></span>
      </div>
      ${
        isHost
          ? `<button type="button" class="btn btn-secondary" id="btn-copy">${UI.copyRoomCode}</button>`
          : ""
      }
      <div class="row mt-gap-lg">
        <button type="button" class="btn btn-secondary" id="btn-wait-cancel">${UI.cancelWait}</button>
      </div>
      <p class="toast hidden" id="wait-toast"></p>
    </div>
  `),
  );

  if (isHost) {
    $("#btn-copy", root).addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(code);
        $("#btn-copy", root).textContent = UI.copied;
        window.setTimeout(() => {
          ($("#btn-copy", root) as HTMLButtonElement).textContent = UI.copyRoomCode;
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
    window.setTimeout(() => renderCare(root), 1200);
  };

  s.on("linked", goBattle);
  s.on("peer_left", onPeerLeft);

  $("#btn-wait-cancel", root).addEventListener("click", () => {
    cancelWaitingAndReturn(root);
  });
}

function renderBattle(root: HTMLElement) {
  phase = "battle";
  stopTick();

  const myPet = loadPet();
  if (!myPet.alive) {
    flashCare(UI.deadPetBattleBlocked);
    renderCare(root);
    return;
  }
  if (!myPet.hatched) {
    flashCare(UI.eggBattleBlocked);
    renderCare(root);
    return;
  }
  const foeSpecies = randomFoeSpecies(myPet.species);
  const battleSt = growthStage(myPet.virtAge);
  const youSprite = petAssetUrl(
    idleSpriteForSpeciesStage(myPet.species, battleSt),
  );
  const foeSprite = petAssetUrl(
    idleSpriteForSpeciesStage(foeSpecies, battleSt),
  );

  root.replaceChildren(
    el(`
    <div class="shell shell--battle">
      <div class="screen-bezel screen-bezel--battle">
        <div class="round-meta">
          <span id="round-label">${UI.round(1)}</span>
          <span class="timer" id="timer">--</span>
        </div>
        <div class="battle-arena">
          <div class="monster">
            <img class="pet-sprite battle-pet" id="battle-you-sprite" alt="" width="72" height="72" decoding="async" />
            <div class="name" id="battle-you-label"></div>
            <div class="hp-wrap"><div class="hp-fill" id="hp-you" style="width:100%"></div></div>
          </div>
          <div class="monster">
            <img class="pet-sprite battle-pet" id="battle-foe-sprite" alt="" width="72" height="72" decoding="async" />
            <div class="name" id="battle-foe-label"></div>
            <div class="hp-wrap"><div class="hp-fill foe" id="hp-foe" style="width:100%"></div></div>
          </div>
        </div>
        <p class="battle-hint">${UI.chooseMove}</p>
        <div class="move-grid">
          <button type="button" class="move-btn" data-move="strike">${UI.strike}</button>
          <button type="button" class="move-btn" data-move="guard">${UI.guard}</button>
          <button type="button" class="move-btn" data-move="charge">${UI.charge}</button>
        </div>
        <div class="row battle-forfeit-row">
          <button type="button" class="btn btn-secondary" id="btn-forfeit">${UI.surrenderLeave}</button>
        </div>
        <p class="toast hidden" id="lock-hint"></p>
        <div class="log" id="battle-log"></div>
      </div>
    </div>
  `),
  );

  const youSp = $("#battle-you-sprite", root) as HTMLImageElement;
  const foeSp = $("#battle-foe-sprite", root) as HTMLImageElement;
  youSp.src = youSprite;
  foeSp.src = foeSprite;
  youSp.classList.toggle("pet-sprite--alt", myPet.species === "crystal");
  foeSp.classList.toggle("pet-sprite--alt", foeSpecies === "crystal");
  $("#battle-you-label", root).textContent = `${myPet.nickname} \u00b7 \u6211\u65b9`;
  $("#battle-foe-label", root).textContent = `${petDefaultName(foeSpecies)} \u00b7 \u5c0d\u624b`;

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

  const onBattleEnd = (r: {
    winner: string;
    you: string;
    forfeitBy?: "host" | "guest" | null;
  }) => {
    stopTick();
    const fb = r.forfeitBy;
    if (fb === "host" || fb === "guest") {
      if (fb === r.you) showEndModal(root, UI.youSurrendered);
      else showEndModal(root, UI.foeSurrenderYouWin);
      return;
    }
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

  $("#btn-forfeit", root).addEventListener("click", () => {
    if (!window.confirm(UI.confirmForfeit)) return;
    s.emit("forfeit");
  });

  tickTimer = domSetInterval(() => {
    const left = Math.max(0, deadlineTs - Date.now());
    timerEl.textContent = `${(left / 1000).toFixed(1)}s`;
  }, 100);
}

function showEndModal(root: HTMLElement, title: string) {
  const overlay = el(`
    <div class="modal-overlay" id="end-modal">
      <div class="modal">
        <h2>${title}</h2>
        <p>${UI.endModalHint}</p>
        <button type="button" class="btn btn-primary" id="btn-home">${UI.again}</button>
      </div>
    </div>
  `);
  document.body.appendChild(overlay);
  $("#btn-home", overlay).addEventListener("click", () => {
    overlay.remove();
    socket?.disconnect();
    socket = null;
    renderCare(root);
  });
}

function boot() {
  mountThemeBar();
  const root = $("#view-root");
  const params = new URLSearchParams(location.search);
  const preJoin = params.get("join")?.toUpperCase().trim();
  if (preJoin && preJoin.length >= 4) {
    renderLobby(root);
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
  } else {
    renderCare(root);
  }
}

boot();
