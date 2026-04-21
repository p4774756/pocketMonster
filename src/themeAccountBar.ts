import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { ensureUserProfile } from "./firebase/friendsFirestore";
import {
  getFirebaseFriendsAuth,
  getFirebaseFriendsDb,
  isFirebaseFriendsConfigured,
} from "./firebase/config";
import {
  downloadCloudPetSave,
  fetchCloudPetSaveMeta,
  uploadCloudPetSave,
} from "./firebase/petCloudFirestore";
import { importPetFromCloudJson, loadPet } from "./pet";

const S = {
  login: "\u767b\u5165",
  register: "\u8a3b\u518a",
  logout: "\u767b\u51fa",
  upload: "\u4e0a\u50b3",
  download: "\u4e0b\u8f09",
  close: "\u95dc\u9589",
  email: "Email",
  password: "\u5bc6\u78bc",
  authWorking: "\u8655\u7406\u4e2d\u2026",
  okUpload: "\u5df2\u4e0a\u50b3\u5230\u96f2\u7aef",
  okDownload: "\u5df2\u5f9e\u96f2\u7aef\u9084\u539f\u672c\u6a5f\u9032\u5ea6",
  errGeneric: "\u5931\u6557\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66",
  errAuth: "\u5e33\u865f\u6216\u5bc6\u78bc\u4e0d\u6b63\u78ba",
  errEmailInUse:
    "\u6b64 Email \u5df2\u88ab\u8a3b\u518a\uff0c\u8acb\u6539\u6309\u300c\u767b\u5165\u300d",
  errWeakPassword: "\u5bc6\u78bc\u81f3\u5c11 6 \u4f4d",
  errAuthProviderDisabled:
    "Firebase \u672a\u555f\u7528 Email\uff0f\u5bc6\u78bc\u767b\u5165\u3002",
  errNetwork: "\u7db2\u8def\u9023\u7dda\u7570\u5e38\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66",
  errTooManyRequests: "\u5617\u8a66\u904e\u65bc\u983b\u7e41\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66",
  errProfileFirestore:
    "\u7121\u6cd5\u5efa\u7acb\u597d\u53cb\u8cc7\u6599\uff08Firestore\uff09\u3002\u8acb\u78ba\u8a8d\u898f\u5247\u5df2\u767c\u5e03\u3002",
  errNoCloudSave: "\u96f2\u7aef\u5c1a\u7121\u5099\u4efd\uff0c\u8acb\u5148\u5728\u5176\u4ed6\u88dd\u7f6e\u4e0a\u50b3",
  errParseCloud: "\u96f2\u7aef\u5099\u4efd\u683c\u5f0f\u7121\u6cd5\u8b80\u53d6",
  modalTitle: "\u767b\u5165\u5e33\u865f",
  modalHint:
    "\u767b\u5165\u5f8c\u53ef\u4e0a\u50b3\uff0f\u4e0b\u8f09\u990a\u6210\u9032\u5ea6\uff0c\u4e26\u53ef\u9032\u5165\u300c\u597d\u53cb\u300d\u9801\u52a0\u597d\u53cb\u3002",
  cancel: "\u53d6\u6d88",
  confirmDo: "\u78ba\u5b9a",
  confirmOk: "\u597d",
  confirmUploadTitle: "\u4e0a\u50b3\u5230\u96f2\u7aef",
  confirmUploadBody:
    "\u78ba\u5b9a\u5c07\u672c\u6a5f\u5925\u4f34\u9032\u5ea6\u4e0a\u50b3\uff1f\u6703\u8986\u84cb\u540c\u5e33\u865f\u5728\u96f2\u7aef\u7684\u820a\u5099\u4efd\u3002",
  confirmDownloadTitle: "\u5f9e\u96f2\u7aef\u4e0b\u8f09",
  confirmDownloadBody:
    "\u4e0b\u8f09\u6703\u7528\u96f2\u7aef\u5099\u4efd\u53d6\u4ee3\u672c\u6a5f\u76ee\u524d\u9032\u5ea6\uff0c\u78ba\u5b9a\u7e7c\u7e8c\uff1f",
  cloudTimeLabel: "\u96f2\u7aef\u5099\u4efd\u6642\u9593",
  cloudTimeNone: "\u76ee\u524d\u96f2\u7aef\u5c1a\u7121\u5099\u4efd",
  cloudTimeUnknown: "\uff08\u7121\u6cd5\u8b80\u53d6\u6642\u9593\uff09",
  infoNoBackupTitle: "\u96f2\u7aef\u5099\u4efd",
};

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

function mapProfileInitErr(e: unknown): string {
  const code = errCode(e);
  if (code === "permission-denied") return S.errProfileFirestore;
  if (code === "unavailable" || code === "deadline-exceeded") return S.errNetwork;
  return S.errProfileFirestore;
}

let toastTimer = 0;
function flashToast(el: HTMLElement, msg: string, ok: boolean) {
  window.clearTimeout(toastTimer);
  el.textContent = msg;
  el.classList.remove("hidden");
  el.dataset.state = ok ? "ok" : "err";
  toastTimer = window.setTimeout(() => {
    el.classList.add("hidden");
    el.textContent = "";
  }, 3200);
}

function dispatchPetChanged() {
  document.dispatchEvent(new CustomEvent("pocketpet:pet-storage-changed"));
}

function formatCloudBackupTime(d: Date | null): string {
  if (!d) return S.cloudTimeUnknown;
  try {
    return new Intl.DateTimeFormat("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return S.cloudTimeUnknown;
  }
}

/**
 * \u540c\u6b65\u78ba\u8a8d\uff1a\u986f\u793a\u591a\u6bb5\u8aaa\u660e\u8207\u96f2\u7aef\u5099\u4efd\u6642\u9593\u3002
 * @param showCancel \u70ba false \u6642\u50c5\u986f\u793a\u78ba\u5b9a\uff08\u8cc7\u8a0a\uff09\u3002
 */
function openSyncConfirmDialog(options: {
  title: string;
  paragraphs: string[];
  showCancel: boolean;
  confirmText: string;
  cancelText?: string;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "account-auth-overlay sync-confirm-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");

    const panel = document.createElement("div");
    panel.className = "account-auth-panel sync-confirm-panel";

    const h = document.createElement("h2");
    h.className = "account-auth-heading";
    const titleId = `sync-confirm-title-${Date.now()}`;
    h.id = titleId;
    overlay.setAttribute("aria-labelledby", titleId);
    h.textContent = options.title;
    panel.append(h);

    for (const text of options.paragraphs) {
      const p = document.createElement("p");
      p.className = "sync-confirm-body";
      p.textContent = text;
      panel.append(p);
    }

    const foot = document.createElement("div");
    foot.className = "account-auth-buttons";

    const cleanup = () => {
      document.removeEventListener("keydown", onKey);
      overlay.remove();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cleanup();
        resolve(false);
      }
    };

    if (options.showCancel) {
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "btn btn-secondary";
      cancel.textContent = options.cancelText ?? S.cancel;
      cancel.addEventListener("click", () => {
        cleanup();
        resolve(false);
      });
      foot.append(cancel);
    }

    const ok = document.createElement("button");
    ok.type = "button";
    ok.className = "btn btn-primary";
    ok.textContent = options.confirmText;
    ok.addEventListener("click", () => {
      cleanup();
      resolve(true);
    });
    foot.append(ok);

    panel.append(foot);
    overlay.append(panel);

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        cleanup();
        resolve(false);
      }
    });

    document.addEventListener("keydown", onKey);
    document.body.append(overlay);
    ok.focus();
  });
}

/**
 * \u9802\u6b04 Firebase \u767b\u5165\uff0f\u767b\u51fa\u8207\u990a\u6210\u96f2\u7aef\u5099\u4efd\uff08\u9808\u516d\u9805 `VITE_FIREBASE_*` \u9f4a\u5099\uff09\u3002
 */
export function mountThemeAccountBar(): void {
  const slot = document.getElementById("theme-bar-account");
  if (!slot || !isFirebaseFriendsConfigured()) {
    if (slot) slot.replaceChildren();
    return;
  }

  const auth = getFirebaseFriendsAuth();
  const db = getFirebaseFriendsDb();

  const wrap = document.createElement("div");
  wrap.className = "theme-account";

  const toast = document.createElement("span");
  toast.className = "theme-account-toast hidden";
  toast.setAttribute("role", "status");
  wrap.append(toast);

  const btnRow = document.createElement("div");
  btnRow.className = "theme-account-actions";
  wrap.append(btnRow);

  slot.replaceChildren(wrap);

  let modal: HTMLElement | null = null;
  let busy = false;

  const closeModal = () => {
    modal?.remove();
    modal = null;
    document.removeEventListener("keydown", onDocKey);
  };

  const onDocKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") closeModal();
  };

  const openLoginModal = () => {
    if (modal) return;
    const overlay = document.createElement("div");
    overlay.className = "account-auth-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "account-auth-title");
    overlay.innerHTML = `
      <div class="account-auth-panel">
        <h2 id="account-auth-title" class="account-auth-heading">${S.modalTitle}</h2>
        <p class="account-auth-intro">${S.modalHint}</p>
        <label class="account-auth-row" for="account-auth-email"><span>${S.email}</span>
          <input type="email" class="field" id="account-auth-email" autocomplete="username" />
        </label>
        <label class="account-auth-row" for="account-auth-pass"><span>${S.password}</span>
          <input type="password" class="field" id="account-auth-pass" autocomplete="current-password" />
        </label>
        <div class="account-auth-buttons">
          <button type="button" class="btn btn-secondary" id="account-auth-close">${S.close}</button>
          <button type="button" class="btn btn-secondary" id="account-auth-login">${S.login}</button>
          <button type="button" class="btn btn-primary" id="account-auth-register">${S.register}</button>
        </div>
      </div>
    `;
    modal = overlay;
    document.body.append(overlay);

    const emailIn = overlay.querySelector("#account-auth-email") as HTMLInputElement;
    const passIn = overlay.querySelector("#account-auth-pass") as HTMLInputElement;
    const btnLogin = overlay.querySelector("#account-auth-login") as HTMLButtonElement;
    const btnReg = overlay.querySelector("#account-auth-register") as HTMLButtonElement;
    const btnClose = overlay.querySelector("#account-auth-close") as HTMLButtonElement;

    const setBusy = (v: boolean) => {
      busy = v;
      btnLogin.disabled = v;
      btnReg.disabled = v;
      emailIn.disabled = v;
      passIn.disabled = v;
    };

    btnClose.addEventListener("click", closeModal);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal();
    });
    document.addEventListener("keydown", onDocKey);

    btnLogin.addEventListener("click", async () => {
      if (busy) return;
      setBusy(true);
      try {
        await signInWithEmailAndPassword(auth, emailIn.value.trim(), passIn.value);
        closeModal();
      } catch (e) {
        flashToast(toast, mapAuthErr(e), false);
      } finally {
        setBusy(false);
      }
    });

    btnReg.addEventListener("click", async () => {
      if (busy) return;
      setBusy(true);
      try {
        await createUserWithEmailAndPassword(
          auth,
          emailIn.value.trim(),
          passIn.value,
        );
        closeModal();
      } catch (e) {
        flashToast(toast, mapAuthErr(e), false);
      } finally {
        setBusy(false);
      }
    });
  };

  const paintGuest = () => {
    btnRow.replaceChildren();
    const b = document.createElement("button");
    b.type = "button";
    b.className = "theme-rules-btn theme-account-login-btn";
    b.textContent = S.login;
    b.addEventListener("click", openLoginModal);
    btnRow.append(b);
  };

  const paintUser = (_user: User) => {
    btnRow.replaceChildren();

    const up = document.createElement("button");
    up.type = "button";
    up.className = "theme-rules-btn theme-account-sync-btn";
    up.textContent = S.upload;
    up.addEventListener("click", async () => {
      const u = auth.currentUser;
      if (!u) return;
      up.disabled = true;
      try {
        const peek = await fetchCloudPetSaveMeta(db, u.uid);
        const timeLine = `${S.cloudTimeLabel}\uff1a${
          peek
            ? formatCloudBackupTime(peek.updatedAt)
            : S.cloudTimeNone
        }`;
        const ok = await openSyncConfirmDialog({
          title: S.confirmUploadTitle,
          paragraphs: [S.confirmUploadBody, timeLine],
          showCancel: true,
          confirmText: S.confirmDo,
          cancelText: S.cancel,
        });
        if (!ok) return;
        const json = JSON.stringify(loadPet());
        await uploadCloudPetSave(db, u.uid, json);
        flashToast(toast, S.okUpload, true);
      } catch {
        flashToast(toast, S.errGeneric, false);
      } finally {
        up.disabled = false;
      }
    });

    const down = document.createElement("button");
    down.type = "button";
    down.className = "theme-rules-btn theme-account-sync-btn";
    down.textContent = S.download;
    down.addEventListener("click", async () => {
      const u = auth.currentUser;
      if (!u) return;
      down.disabled = true;
      try {
        const peek = await fetchCloudPetSaveMeta(db, u.uid);
        if (!peek) {
          await openSyncConfirmDialog({
            title: S.infoNoBackupTitle,
            paragraphs: [S.errNoCloudSave, `${S.cloudTimeLabel}\uff1a${S.cloudTimeNone}`],
            showCancel: false,
            confirmText: S.confirmOk,
          });
          return;
        }
        const timeLine = `${S.cloudTimeLabel}\uff1a${formatCloudBackupTime(peek.updatedAt)}`;
        const ok = await openSyncConfirmDialog({
          title: S.confirmDownloadTitle,
          paragraphs: [S.confirmDownloadBody, timeLine],
          showCancel: true,
          confirmText: S.confirmDo,
          cancelText: S.cancel,
        });
        if (!ok) return;
        const meta = await downloadCloudPetSave(db, u.uid);
        if (!meta) {
          flashToast(toast, S.errNoCloudSave, false);
          return;
        }
        importPetFromCloudJson(meta.payload);
        flashToast(toast, S.okDownload, true);
        dispatchPetChanged();
      } catch (e) {
        if (e instanceof SyntaxError) {
          flashToast(toast, S.errParseCloud, false);
        } else {
          flashToast(toast, S.errGeneric, false);
        }
      } finally {
        down.disabled = false;
      }
    });

    const out = document.createElement("button");
    out.type = "button";
    out.className = "theme-rules-btn theme-account-logout-btn";
    out.textContent = S.logout;
    out.addEventListener("click", async () => {
      out.disabled = true;
      try {
        await signOut(auth);
      } catch {
        flashToast(toast, S.errGeneric, false);
      } finally {
        out.disabled = false;
      }
    });

    btnRow.append(up, down, out);
  };

  onAuthStateChanged(auth, (user) => {
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
        await ensureUserProfile(db, user.uid, hint);
        paintUser(user);
      } catch (e) {
        if (import.meta.env.DEV) console.error("[theme account] profile init", e);
        try {
          await signOut(auth);
        } catch {
          /* ignore */
        }
        paintGuest();
        flashToast(toast, mapProfileInitErr(e), false);
      }
    })();
  });
}
