import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  acceptFriendRequest,
  cancelOutgoingRequest,
  ensureUserProfile,
  rejectFriendRequest,
  removeFriendship,
  resolveUidFromFriendCode,
  sendFriendRequest,
  subscribeFriends,
  subscribeIncomingRequests,
  subscribeOutgoingRequests,
  updateProfileDisplayName,
} from "./firebase/friendsFirestore";
import {
  getFirebaseFriendsAuth,
  getFirebaseFriendsDb,
  isFirebaseFriendsConfigured,
} from "./firebase/config";

const S = {
  summary: "\u597d\u53cb\uff08Firebase\uff09",
  disabledHint:
    "\u672a\u8a2d\u5b9a Firebase \u5efa\u7f6e\u8b8a\u6578\u6642\u7121\u6cd5\u4f7f\u7528\u3002\u8acb\u53c3\u8003\u5009\u5eab docs/FIREBASE_FRIENDS.md \u3002",
  email: "Email",
  password: "\u5bc6\u78bc",
  login: "\u767b\u5165",
  register: "\u8a3b\u518a",
  logout: "\u767b\u51fa",
  friendCode: "\u6211\u7684\u597d\u53cb\u4ee3\u78bc",
  copyCode: "\u8907\u88fd\u4ee3\u78bc",
  copied: "\u5df2\u8907\u88fd",
  displayName: "\u5c55\u793a\u540d\u7a31",
  saveName: "\u5132\u5b58\u540d\u7a31",
  addByCode: "\u7528\u4ee3\u78bc\u52a0\u597d\u53cb",
  addSend: "\u767c\u9001\u9080\u8acb",
  incoming: "\u6536\u5230\u7684\u9080\u8acb",
  outgoing: "\u6211\u9001\u51fa\u7684\u9080\u8acb",
  friends: "\u597d\u53cb\u540d\u55ae",
  accept: "\u63a5\u53d7",
  reject: "\u62d2\u7d55",
  cancel: "\u64a4\u56de",
  remove: "\u79fb\u9664",
  emptyFriends: "\u5c1a\u7121\u597d\u53cb",
  errGeneric: "\u5931\u6557\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66",
  errEmailInUse:
    "\u6b64 Email \u5df2\u88ab\u8a3b\u518a\uff0c\u8acb\u6539\u6309\u300c\u767b\u5165\u300d",
  errAuthProviderDisabled:
    "Firebase \u672a\u555f\u7528 Email\uff0f\u5bc6\u78bc\u767b\u5165\uff1b\u8acb\u81f3\u4e3b\u63a7\u53f0 Authentication \u958b\u555f\u300c\u96fb\u5b50\u90f5\u4ef6\uff0f\u5bc6\u78bc\u300d\u3002",
  errNetwork: "\u7db2\u8def\u9023\u7dda\u7570\u5e38\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66",
  errTooManyRequests: "\u5617\u8a66\u904e\u65bc\u983b\u7e41\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66",
  errProfileFirestore:
    "\u5e33\u865f\u5df2\u5efa\u7acb\uff0c\u4f46\u7121\u6cd5\u5beb\u5165\u597d\u53cb\u8cc7\u6599\uff08Firestore\uff09\u3002\u8acb\u78ba\u8a8d\u5df2\u555f\u7528 Cloud Firestore\uff0c\u4e26\u5c07\u5009\u5eab docs/firebase-friends.rules \u8cbc\u4e0a\u4e3b\u63a7\u53f0\u5f8c\u767c\u5e03\u898f\u5247\u3002",
  errSelf: "\u7121\u6cd5\u52a0\u81ea\u5df1",
  errAlready: "\u5df2\u662f\u597d\u53cb",
  errDup: "\u5df2\u6709\u5f85\u56de\u8986\u7684\u9080\u8acb",
  errReverse:
    "\u5c0d\u65b9\u5df2\u5411\u4f60\u767c\u8d77\u9080\u8acb\uff0c\u8acb\u5230\u300c\u6536\u5230\u7684\u9080\u8acb\u300d\u56de\u8986",
  errCode: "\u67e5\u7121\u6b64\u4ee3\u78bc",
  errAuth: "\u5e33\u865f\u6216\u5bc6\u78bc\u4e0d\u6b63\u78ba",
  errWeakPassword: "\u5bc6\u78bc\u81f3\u5c11 6 \u4f4d",
  okInvite: "\u5df2\u767c\u9001\u9080\u8acb",
  okAccepted: "\u5df2\u6210\u70ba\u597d\u53cb",
  okRemoved: "\u5df2\u79fb\u9664",
  okSaved: "\u5df2\u5132\u5b58\u540d\u7a31",
};

let activeCleanup: (() => void) | null = null;

export function clearLobbyFirebaseFriendsCleanup(): void {
  activeCleanup?.();
  activeCleanup = null;
}

function setToast(el: HTMLElement, msg: string, show: boolean) {
  el.textContent = msg;
  el.classList.toggle("hidden", !show);
}

function errCode(e: unknown): string {
  return e && typeof e === "object" && "code" in e
    ? String((e as { code: string }).code)
    : "";
}

function mapAuthErr(e: unknown): string {
  const code = errCode(e);
  if (code === "auth/invalid-email") return S.errAuth;
  if (code === "auth/user-not-found" || code === "auth/wrong-password")
    return S.errAuth;
  if (code === "auth/invalid-credential") return S.errAuth;
  if (code === "auth/email-already-in-use") return S.errEmailInUse;
  if (code === "auth/weak-password") return S.errWeakPassword;
  if (code === "auth/operation-not-allowed") return S.errAuthProviderDisabled;
  if (code === "auth/network-request-failed") return S.errNetwork;
  if (code === "auth/too-many-requests") return S.errTooManyRequests;
  return S.errGeneric;
}

/** Auth \u5df2\u6210\u529f\u4f46 `ensureUserProfile` \u6216 Firestore \u5931\u6557\u6642\u986f\u793a\u3002 */
function mapProfileInitErr(e: unknown): string {
  const code = errCode(e);
  if (code === "permission-denied") return S.errProfileFirestore;
  if (code === "unavailable" || code === "deadline-exceeded") return S.errNetwork;
  const msg =
    e && typeof e === "object" && "message" in e ? String((e as Error).message) : "";
  if (msg === "friend_code_exhausted") return S.errGeneric;
  return S.errProfileFirestore;
}

function mapFriendErr(e: unknown): string {
  const m = e && typeof e === "object" && "message" in e ? String((e as Error).message) : "";
  if (m === "self") return S.errSelf;
  if (m === "already_friends") return S.errAlready;
  if (m === "dup_pending") return S.errDup;
  if (m === "reverse_pending") return S.errReverse;
  if (m === "code_unknown" || m === "code_short") return S.errCode;
  return S.errGeneric;
}

/**
 * \u5728\u990a\u6210\u4e3b\u756b\u9762\uff08`.shell--care`\uff09\u5167\u639b\u8f09\u300c\u597d\u53cb\uff08Firebase\uff09\u300d\u3002
 * \u5207\u63db\u756b\u9762\u6642\u8acb\u547c\u53eb clearLobbyFirebaseFriendsCleanup\u3002
 */
export function mountLobbyFirebaseFriends(root: HTMLElement): void {
  clearLobbyFirebaseFriendsCleanup();
  const wrap = document.createElement("details");
  wrap.className = "lobby-friends";
  wrap.open = false;
  const sum = document.createElement("summary");
  sum.className = "lobby-friends-summary";
  sum.textContent = S.summary;
  wrap.append(sum);

  const shell = root.querySelector(".shell--care");
  if (!shell) return;

  if (!isFirebaseFriendsConfigured()) {
    const p = document.createElement("p");
    p.className = "lobby-friends-hint";
    p.textContent = S.disabledHint;
    wrap.append(p);
    shell.append(wrap);
    return;
  }

  const inner = document.createElement("div");
  inner.className = "lobby-friends-inner";
  inner.innerHTML = `
    <div class="lobby-friends-auth" id="fb-auth-guest">
      <div class="lobby-friends-row">
        <label class="lobby-friends-label" for="fb-email">${S.email}</label>
        <input type="email" class="field" id="fb-email" autocomplete="username" />
      </div>
      <div class="lobby-friends-row">
        <label class="lobby-friends-label" for="fb-pass">${S.password}</label>
        <input type="password" class="field" id="fb-pass" autocomplete="current-password" />
      </div>
      <div class="lobby-friends-row lobby-friends-actions">
        <button type="button" class="btn btn-secondary" id="fb-login">${S.login}</button>
        <button type="button" class="btn btn-primary" id="fb-register">${S.register}</button>
      </div>
    </div>
    <div class="lobby-friends-auth hidden" id="fb-auth-user">
      <p class="lobby-friends-meta" id="fb-email-line"></p>
      <div class="lobby-friends-row lobby-friends-row--wrap">
        <span class="lobby-friends-label">${S.friendCode}</span>
        <code class="lobby-friends-code" id="fb-code"></code>
        <button type="button" class="btn btn-secondary btn--compact" id="fb-copy">${S.copyCode}</button>
      </div>
      <div class="lobby-friends-row lobby-friends-row--wrap">
        <label class="lobby-friends-label" for="fb-dname">${S.displayName}</label>
        <input type="text" class="field" id="fb-dname" maxlength="32" />
        <button type="button" class="btn btn-secondary btn--compact" id="fb-save-name">${S.saveName}</button>
      </div>
      <div class="lobby-friends-row lobby-friends-row--wrap">
        <label class="lobby-friends-label" for="fb-peer-code">${S.addByCode}</label>
        <input type="text" class="field" id="fb-peer-code" maxlength="12" autocomplete="off" placeholder="ABCD1234" />
        <button type="button" class="btn btn-primary btn--compact" id="fb-add">${S.addSend}</button>
      </div>
      <p class="lobby-friends-sub">${S.incoming}</p>
      <div class="lobby-friends-list" id="fb-in"></div>
      <p class="lobby-friends-sub">${S.outgoing}</p>
      <div class="lobby-friends-list" id="fb-out"></div>
      <p class="lobby-friends-sub">${S.friends}</p>
      <div class="lobby-friends-list" id="fb-friends"></div>
      <div class="lobby-friends-row mt-gap-sm">
        <button type="button" class="btn btn-secondary" id="fb-logout">${S.logout}</button>
      </div>
    </div>
    <p class="toast lobby-friends-toast hidden" id="fb-toast"></p>
  `;
  wrap.append(inner);
  shell.append(wrap);

  const qs = (sel: string) => {
    const n = inner.querySelector(sel);
    if (!n) throw new Error(`Missing ${sel}`);
    return n as HTMLElement;
  };
  const fbToast = qs("#fb-toast");
  const guestEl = qs("#fb-auth-guest");
  const userEl = qs("#fb-auth-user");
  const emailIn = qs("#fb-email") as HTMLInputElement;
  const passIn = qs("#fb-pass") as HTMLInputElement;
  const emailLine = qs("#fb-email-line");
  const codeEl = qs("#fb-code");
  const dnameIn = qs("#fb-dname") as HTMLInputElement;
  const peerCodeIn = qs("#fb-peer-code") as HTMLInputElement;
  const inList = qs("#fb-in");
  const outList = qs("#fb-out");
  const friendsList = qs("#fb-friends");

  const auth = getFirebaseFriendsAuth();
  const db = getFirebaseFriendsDb();
  type TD = () => void;
  const dataUnsubs: TD[] = [];
  let profileDisplay = "";

  const clearDataSubs = () => {
    while (dataUnsubs.length) {
      const u = dataUnsubs.pop();
      u?.();
    }
  };

  const paintGuest = () => {
    clearDataSubs();
    guestEl.classList.remove("hidden");
    userEl.classList.add("hidden");
    setToast(fbToast, "", false);
  };

  const paintUser = (email: string, code: string, dname: string) => {
    guestEl.classList.add("hidden");
    userEl.classList.remove("hidden");
    emailLine.textContent = email;
    codeEl.textContent = code;
    dnameIn.value = dname;
    profileDisplay = dname;
  };

  const wireDataListeners = (uid: string) => {
    clearDataSubs();
    dataUnsubs.push(
      subscribeIncomingRequests(db, uid, (rows) => {
        inList.replaceChildren();
        for (const r of rows) {
          const row = document.createElement("div");
          row.className = "lobby-friends-item";
          const lab = document.createElement("span");
          lab.className = "lobby-friends-item-label";
          lab.textContent = r.fromDisplayName || r.fromUid.slice(0, 8);
          const actions = document.createElement("div");
          actions.className = "lobby-friends-item-actions";
          const bOk = document.createElement("button");
          bOk.type = "button";
          bOk.className = "btn btn-primary btn--compact";
          bOk.textContent = S.accept;
          bOk.addEventListener("click", async () => {
            try {
              await acceptFriendRequest(
                db,
                r.id,
                uid,
                dnameIn.value.trim() || profileDisplay || "\u73a9\u5bb6",
              );
              setToast(fbToast, S.okAccepted, true);
            } catch {
              setToast(fbToast, S.errGeneric, true);
            }
          });
          const bNo = document.createElement("button");
          bNo.type = "button";
          bNo.className = "btn btn-secondary btn--compact";
          bNo.textContent = S.reject;
          bNo.addEventListener("click", async () => {
            try {
              await rejectFriendRequest(db, r.id, uid);
            } catch {
              setToast(fbToast, S.errGeneric, true);
            }
          });
          actions.append(bOk, bNo);
          row.append(lab, actions);
          inList.append(row);
        }
      }),
    );
    dataUnsubs.push(
      subscribeOutgoingRequests(db, uid, (rows) => {
        outList.replaceChildren();
        for (const r of rows) {
          const row = document.createElement("div");
          row.className = "lobby-friends-item";
          const lab = document.createElement("span");
          lab.className = "lobby-friends-item-label";
          lab.textContent = r.toUid.slice(0, 10) + "\u2026";
          const b = document.createElement("button");
          b.type = "button";
          b.className = "btn btn-secondary btn--compact";
          b.textContent = S.cancel;
          b.addEventListener("click", async () => {
            try {
              await cancelOutgoingRequest(db, r.id, uid);
            } catch {
              setToast(fbToast, S.errGeneric, true);
            }
          });
          row.append(lab, b);
          outList.append(row);
        }
      }),
    );
    dataUnsubs.push(
      subscribeFriends(db, uid, (rows) => {
        friendsList.replaceChildren();
        if (rows.length === 0) {
          const p = document.createElement("p");
          p.className = "lobby-friends-empty";
          p.textContent = S.emptyFriends;
          friendsList.append(p);
          return;
        }
        for (const r of rows) {
          const row = document.createElement("div");
          row.className = "lobby-friends-item";
          const lab = document.createElement("span");
          lab.className = "lobby-friends-item-label";
          lab.textContent = r.label;
          const b = document.createElement("button");
          b.type = "button";
          b.className = "btn btn-secondary btn--compact";
          b.textContent = S.remove;
          b.addEventListener("click", async () => {
            try {
              await removeFriendship(db, r.pairId, uid);
              setToast(fbToast, S.okRemoved, true);
            } catch {
              setToast(fbToast, S.errGeneric, true);
            }
          });
          row.append(lab, b);
          friendsList.append(row);
        }
      }),
    );
  };

  const unsubAuth = onAuthStateChanged(auth, (user) => {
    void (async () => {
      if (!user) {
        paintGuest();
        return;
      }
      try {
        const hint =
          user.displayName ||
          (user.email ? user.email.split("@")[0] : "") ||
          "\u73a9\u5bb6";
        const prof = await ensureUserProfile(db, user.uid, hint);
        profileDisplay = prof.displayName;
        paintUser(user.email || user.uid, prof.friendCode, prof.displayName);
        wireDataListeners(user.uid);
      } catch (e) {
        if (import.meta.env.DEV) console.error("[firebase friends] profile init", e);
        try {
          await signOut(auth);
        } catch {
          /* ignore */
        }
        paintGuest();
        setToast(fbToast, mapProfileInitErr(e), true);
      }
    })();
  });

  qs("#fb-login").addEventListener("click", async () => {
    try {
      await signInWithEmailAndPassword(auth, emailIn.value.trim(), passIn.value);
      setToast(fbToast, "", false);
    } catch (e) {
      setToast(fbToast, mapAuthErr(e), true);
    }
  });

  qs("#fb-register").addEventListener("click", async () => {
    try {
      await createUserWithEmailAndPassword(
        auth,
        emailIn.value.trim(),
        passIn.value,
      );
      setToast(fbToast, "", false);
    } catch (e) {
      setToast(fbToast, mapAuthErr(e), true);
    }
  });

  qs("#fb-logout").addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch {
      setToast(fbToast, S.errGeneric, true);
    }
  });

  qs("#fb-copy").addEventListener("click", async () => {
    const t = codeEl.textContent || "";
    try {
      await navigator.clipboard.writeText(t);
      const btn = qs("#fb-copy") as HTMLButtonElement;
      const prev = btn.textContent;
      btn.textContent = S.copied;
      window.setTimeout(() => {
        btn.textContent = prev;
      }, 1600);
    } catch {
      setToast(fbToast, S.errGeneric, true);
    }
  });

  qs("#fb-save-name").addEventListener("click", async () => {
    const u = auth.currentUser;
    if (!u) return;
    const name = dnameIn.value.trim();
    if (!name) {
      setToast(fbToast, S.errGeneric, true);
      return;
    }
    try {
      await updateProfileDisplayName(db, u.uid, name);
      profileDisplay = name.slice(0, 32);
      setToast(fbToast, S.okSaved, true);
    } catch {
      setToast(fbToast, S.errGeneric, true);
    }
  });

  qs("#fb-add").addEventListener("click", async () => {
    const u = auth.currentUser;
    if (!u) return;
    setToast(fbToast, "", false);
    try {
      const target = await resolveUidFromFriendCode(db, peerCodeIn.value);
      await sendFriendRequest(
        db,
        u.uid,
        target,
        dnameIn.value.trim() || profileDisplay || u.email || "\u73a9\u5bb6",
      );
      peerCodeIn.value = "";
      setToast(fbToast, S.okInvite, true);
    } catch (e) {
      setToast(fbToast, mapFriendErr(e), true);
    }
  });

  const cleanup = () => {
    clearDataSubs();
    unsubAuth();
    if (wrap.parentNode) wrap.remove();
  };
  activeCleanup = cleanup;
}
