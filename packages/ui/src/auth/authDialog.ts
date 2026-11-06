// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { PubSub } from "@chili3d/core";
import { Toast } from "../toast/toast";
import style from "./authDialog.module.css";

export interface AuthUser {
    id: string;
    username: string;
    storeName: string;
}

export function getAuthToken(): string | null {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return localStorage.getItem("dunvex_auth_token");
}

export function getAuthUser(): AuthUser | null {
    if (typeof window === "undefined" || !window.localStorage) return null;
    try {
        const raw = localStorage.getItem("dunvex_auth_user");
        if (raw) return JSON.parse(raw);
    } catch {}
    return null;
}

export function logout(options?: { silent?: boolean; reason?: "manual" | "expired" }): void {
    if (typeof window !== "undefined" && window.localStorage) {
        localStorage.removeItem("dunvex_auth_token");
        localStorage.removeItem("dunvex_auth_user");
    }
    PubSub.default.pub("authChanged", null);
    if (options?.silent) return;
    if (options?.reason === "expired") {
        Toast.info("toast.auth.sessionExpired");
        return;
    }
    Toast.info("error.default:{0}", "Đã đăng xuất tài khoản");
}

/**
 * Verify the stored JWT still maps to a real user on the server.
 * Stale username in localStorage without a valid token is the Mac↔Win
 * "same account, empty list" failure mode — clear it before home loads recents.
 */
export async function ensureAuthSession(): Promise<AuthUser | null> {
    const token = getAuthToken();
    const cached = getAuthUser();
    if (!token) {
        if (cached) logout({ silent: true, reason: "expired" });
        return null;
    }
    try {
        const response = await fetch("/api/auth/me", {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
            logout({ reason: "expired" });
            return null;
        }
        const data = await response.json();
        const user = data?.user as AuthUser | undefined;
        if (!user?.id) {
            logout({ reason: "expired" });
            return null;
        }
        if (typeof window !== "undefined" && window.localStorage) {
            localStorage.setItem("dunvex_auth_user", JSON.stringify(user));
        }
        return user;
    } catch {
        // Network down: keep cached identity so offline local scoped saves still work.
        return cached;
    }
}

let authInvalidWired = false;

/** Subscribe once: storage 401 → clear fake "logged in" state. */
export function wireAuthSessionInvalidHandler(): void {
    if (authInvalidWired) return;
    authInvalidWired = true;
    PubSub.default.sub("authSessionInvalid", () => {
        logout({ reason: "expired" });
    });
}

export function showAuthDialog(onSuccess?: (user: AuthUser) => void): void {
    const existing = document.getElementById("dunvex-auth-dialog");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "dunvex-auth-dialog";
    overlay.className = style.overlay;

    const modal = document.createElement("div");
    modal.className = style.modal;

    // Header
    const header = document.createElement("div");
    header.className = style.header;
    const title = document.createElement("span");
    title.className = style.title;
    title.textContent = "Tài khoản Dunvex CAD";
    const closeBtn = document.createElement("button");
    closeBtn.className = style.closeButton;
    closeBtn.innerHTML = "&times;";
    closeBtn.onclick = () => overlay.remove();
    header.append(title, closeBtn);

    // Tabs
    const tabsContainer = document.createElement("div");
    tabsContainer.className = style.tabs;

    const loginTab = document.createElement("button");
    loginTab.className = `${style.tab} ${style.activeTab}`;
    loginTab.textContent = "Đăng nhập";

    const registerTab = document.createElement("button");
    registerTab.className = style.tab;
    registerTab.textContent = "Đăng ký";

    tabsContainer.append(loginTab, registerTab);

    // Form
    const form = document.createElement("div");
    form.className = style.form;

    // Username field
    const usernameField = document.createElement("div");
    usernameField.className = style.field;
    const usernameLabel = document.createElement("label");
    usernameLabel.className = style.label;
    usernameLabel.textContent = "Tên người dùng / Số điện thoại";
    const usernameInput = document.createElement("input");
    usernameInput.className = style.input;
    usernameInput.type = "text";
    usernameInput.placeholder = "Nhập tên đăng nhập hoặc SĐT";
    usernameField.append(usernameLabel, usernameInput);

    // Store name field (register only)
    const storeField = document.createElement("div");
    storeField.className = style.field;
    storeField.style.display = "none";
    const storeLabel = document.createElement("label");
    storeLabel.className = style.label;
    storeLabel.textContent = "Tên đơn vị / Cửa hàng";
    const storeInput = document.createElement("input");
    storeInput.className = style.input;
    storeInput.type = "text";
    storeInput.placeholder = "Nhập tên đơn vị hoặc xưởng sản xuất";
    storeField.append(storeLabel, storeInput);

    // Password field
    const passwordField = document.createElement("div");
    passwordField.className = style.field;
    const passwordLabel = document.createElement("label");
    passwordLabel.className = style.label;
    passwordLabel.textContent = "Mật khẩu";
    const passwordInput = document.createElement("input");
    passwordInput.className = style.input;
    passwordInput.type = "password";
    passwordInput.placeholder = "Tối thiểu 6 ký tự";
    passwordField.append(passwordLabel, passwordInput);

    // Error message
    const errorMsg = document.createElement("div");
    errorMsg.className = style.error;

    // Actions
    const actions = document.createElement("div");
    actions.className = style.actions;

    const cancelBtn = document.createElement("button");
    cancelBtn.className = style.cancelBtn;
    cancelBtn.textContent = "Hủy";
    cancelBtn.onclick = () => overlay.remove();

    const submitBtn = document.createElement("button");
    submitBtn.className = style.submitBtn;
    submitBtn.textContent = "Đăng nhập";

    actions.append(cancelBtn, submitBtn);

    form.append(usernameField, storeField, passwordField, errorMsg, actions);
    modal.append(header, tabsContainer, form);
    overlay.append(modal);

    let isLoginMode = true;

    loginTab.onclick = () => {
        isLoginMode = true;
        loginTab.className = `${style.tab} ${style.activeTab}`;
        registerTab.className = style.tab;
        storeField.style.display = "none";
        submitBtn.textContent = "Đăng nhập";
        errorMsg.textContent = "";
    };

    registerTab.onclick = () => {
        isLoginMode = false;
        registerTab.className = `${style.tab} ${style.activeTab}`;
        loginTab.className = style.tab;
        storeField.style.display = "flex";
        submitBtn.textContent = "Đăng ký";
        errorMsg.textContent = "";
    };

    const stopKey = (e: KeyboardEvent) => {
        e.stopPropagation();
        if (e.key === "Enter") {
            submitBtn.click();
        } else if (e.key === "Escape") {
            overlay.remove();
        }
    };
    usernameInput.addEventListener("keydown", stopKey);
    storeInput.addEventListener("keydown", stopKey);
    passwordInput.addEventListener("keydown", stopKey);

    submitBtn.onclick = async () => {
        const username = usernameInput.value.trim();
        const password = passwordInput.value;
        const storeName = storeInput.value.trim();

        if (username.length < 2) {
            errorMsg.textContent = "Tên người dùng phải có ít nhất 2 ký tự";
            return;
        }
        if (password.length < 6) {
            errorMsg.textContent = "Mật khẩu phải có ít nhất 6 ký tự";
            return;
        }

        submitBtn.disabled = true;
        errorMsg.textContent = "";

        try {
            const endpoint = isLoginMode ? "/api/auth/login" : "/api/auth/register";
            const payload = isLoginMode
                ? { username, password }
                : { username, password, storeName: storeName || username };

            const response = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const resData = await response.json();
            if (!response.ok) {
                errorMsg.textContent = resData.error || "Thao tác thất bại, vui lòng thử lại";
                submitBtn.disabled = false;
                return;
            }

            // Save to localStorage
            localStorage.setItem("dunvex_auth_token", resData.token);
            localStorage.setItem("dunvex_auth_user", JSON.stringify(resData.user));

            PubSub.default.pub("authChanged", resData.user);
            Toast.info(
                "error.default:{0}",
                isLoginMode
                    ? `Đăng nhập thành công: ${resData.user.storeName || resData.user.username}`
                    : `Đăng ký thành công: ${resData.user.storeName || resData.user.username}`,
            );

            overlay.remove();
            onSuccess?.(resData.user);
        } catch (err) {
            errorMsg.textContent = `Lỗi kết nối máy chủ: ${String(err)}`;
            submitBtn.disabled = false;
        }
    };

    document.body.appendChild(overlay);
    usernameInput.focus();
}
