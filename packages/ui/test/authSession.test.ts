// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { PubSub } from "@chili3d/core";
import { rs } from "@rstest/core";
import { ensureAuthSession, getAuthUser, logout } from "../src/auth/authDialog";

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
});
