// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { PubSub } from "@chili3d/core";
import { rs } from "@rstest/core";
import {
    ensureAuthSession,
    getAuthUser,
    logout,
    wireAuthSessionInvalidHandler,
} from "../src/auth/authDialog";

describe("ensureAuthSession", () => {
    beforeEach(() => {
        localStorage.clear();
        rs.unstubAllGlobals();
    });

    afterEach(() => {
        rs.unstubAllGlobals();
        localStorage.clear();
    });

    const user = { id: "user-a", username: "alice", storeName: "Alice Shop" };

    test("keeps cached identity when /api/auth/me returns 5xx", async () => {
        localStorage.setItem("dunvex_auth_token", "tok");
        localStorage.setItem("dunvex_auth_user", JSON.stringify(user));

        rs.stubGlobal(
            "fetch",
            rs.fn(async () => new Response(JSON.stringify({ error: "boom" }), { status: 503 })),
        );

        const result = await ensureAuthSession();
        expect(result).toEqual(user);
        expect(getAuthUser()).toEqual(user);
        expect(localStorage.getItem("dunvex_auth_token")).toBe("tok");
    });

    test("keeps cached identity on network failure", async () => {
        localStorage.setItem("dunvex_auth_token", "tok");
        localStorage.setItem("dunvex_auth_user", JSON.stringify(user));

        rs.stubGlobal(
            "fetch",
            rs.fn(async () => {
                throw new Error("offline");
            }),
        );

        const result = await ensureAuthSession();
        expect(result).toEqual(user);
        expect(getAuthUser()?.id).toBe("user-a");
    });

    test("clears session only on confirmed 401", async () => {
        localStorage.setItem("dunvex_auth_token", "tok");
        localStorage.setItem("dunvex_auth_user", JSON.stringify(user));

        let authChanged: unknown = "unset";
        const onAuth = (u: unknown) => {
            authChanged = u;
        };
        PubSub.default.sub("authChanged", onAuth);

        rs.stubGlobal(
            "fetch",
            rs.fn(async () => new Response(JSON.stringify({ error: "expired" }), { status: 401 })),
        );

        const result = await ensureAuthSession();
        expect(result).toBeNull();
        expect(getAuthUser()).toBeNull();
        expect(localStorage.getItem("dunvex_auth_token")).toBeNull();
        expect(authChanged).toBeNull();

        PubSub.default.remove("authChanged", onAuth);
    });

    test("keeps identity when token is missing (offline scoping)", async () => {
        localStorage.setItem("dunvex_auth_user", JSON.stringify(user));
        localStorage.removeItem("dunvex_auth_token");

        const result = await ensureAuthSession();
        expect(result).toEqual(user);
        expect(getAuthUser()?.id).toBe("user-a");
    });

    test("logout clears token and user", () => {
        localStorage.setItem("dunvex_auth_token", "tok");
        localStorage.setItem("dunvex_auth_user", JSON.stringify(user));
        logout({ silent: true });
        expect(getAuthUser()).toBeNull();
        expect(localStorage.getItem("dunvex_auth_token")).toBeNull();
    });

    test("stale /auth/me 401 for A does not log out B", async () => {
        localStorage.setItem("dunvex_auth_token", "token-a");
        localStorage.setItem("dunvex_auth_user", JSON.stringify(user));

        let release!: (value: Response) => void;
        const pending = new Promise<Response>((resolve) => {
            release = resolve;
        });
        rs.stubGlobal(
            "fetch",
            rs.fn(async () => pending),
        );

        const ensurePromise = ensureAuthSession();
        const userB = { id: "user-b", username: "bob", storeName: "Bob Shop" };
        localStorage.setItem("dunvex_auth_token", "token-b");
        localStorage.setItem("dunvex_auth_user", JSON.stringify(userB));

        release(new Response(JSON.stringify({ error: "expired" }), { status: 401 }));
        const result = await ensurePromise;
        expect(result).toEqual(userB);
        expect(getAuthUser()).toEqual(userB);
        expect(localStorage.getItem("dunvex_auth_token")).toBe("token-b");
    });

    test("authSessionInvalid for A is ignored when B is live", () => {
        wireAuthSessionInvalidHandler();
        const userB = { id: "user-b", username: "bob", storeName: "Bob Shop" };
        localStorage.setItem("dunvex_auth_token", "token-b");
        localStorage.setItem("dunvex_auth_user", JSON.stringify(userB));

        PubSub.default.pub("authSessionInvalid", "expired", {
            userId: "user-a",
            token: "token-a",
        });

        expect(getAuthUser()).toEqual(userB);
        expect(localStorage.getItem("dunvex_auth_token")).toBe("token-b");
    });
});
