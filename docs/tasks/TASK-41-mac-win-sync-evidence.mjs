#!/usr/bin/env node
// Part of the Chili3d Project, under the AGPL-3.0 License.
// Dual-session sync probe (A/B) against a live storage API — no deploy.
// Usage: node docs/tasks/TASK-41-mac-win-sync-evidence.mjs [baseUrl]
// Env: SYNC_EVIDENCE_TOKEN (JWT for account under test). If unset, mints via VPS SSH is N/A —
//      pass a token obtained from /api/auth/login locally.

import fs from "node:fs";
import path from "node:path";

const baseUrl = (process.argv[2] || "http://136.66.95.155").replace(/\/+$/, "");
const outDir = path.resolve("docs/tasks/sync-evidence");
fs.mkdirSync(outDir, { recursive: true });

const DOC_ID = "G5zyyoF_RQQdTN4qeFmjS"; // ct nano thành ở kiến đức (thông)
const USER_ID = "f475072d00964fa53d5b4deaecb30225";

function stamp() {
    return new Date().toISOString().replace(/[:.]/g, "-");
}

async function json(url, opts = {}) {
    const res = await fetch(url, opts);
    const text = await res.text();
    let body;
    try {
        body = text ? JSON.parse(text) : null;
    } catch {
        body = text;
    }
    return { status: res.status, body };
}

async function main() {
    const token = process.env.SYNC_EVIDENCE_TOKEN;
    if (!token) {
        console.error("Set SYNC_EVIDENCE_TOKEN to a valid JWT for user thông");
        process.exit(1);
    }

    const report = {
        at: new Date().toISOString(),
        baseUrl,
        documentId: DOC_ID,
        userId: USER_ID,
        steps: [],
    };

    const auth = { Authorization: `Bearer ${token}` };

    // Session A: me + list + get
    const me = await json(`${baseUrl}/api/auth/me`, { headers: auth });
    report.steps.push({ name: "A.auth.me", ...me });

    const listA = await json(`${baseUrl}/api/storage/chili3d/recents?page=0&count=20`, { headers: auth });
    const idsA = Array.isArray(listA.body) ? listA.body.map((r) => r.id) : [];
    report.steps.push({
        name: "A.recents",
        status: listA.status,
        count: idsA.length,
        hasDoc: idsA.includes(DOC_ID),
        ids: idsA,
    });

    const getA = await json(`${baseUrl}/api/storage/chili3d/documents/${DOC_ID}`, { headers: auth });
    report.steps.push({
        name: "A.get",
        status: getA.status,
        serverVersion: getA.body?.serverVersion,
        nameField: getA.body?.name,
        id: getA.body?.id,
    });

    // Session B (no token / expired): must NOT see the doc
    const guestList = await json(`${baseUrl}/api/storage/chili3d/recents?page=0&count=20`);
    const guestIds = Array.isArray(guestList.body) ? guestList.body.map((r) => r.id) : [];
    report.steps.push({
        name: "B.guest.recents",
        status: guestList.status,
        hasDoc: guestIds.includes(DOC_ID),
        ids: guestIds.slice(0, 5),
    });

    const guestGet = await json(`${baseUrl}/api/storage/chili3d/documents/${DOC_ID}`);
    report.steps.push({ name: "B.guest.get", status: guestGet.status });

    const badGet = await json(`${baseUrl}/api/storage/chili3d/documents/${DOC_ID}`, {
        headers: { Authorization: "Bearer expired.or.garbage" },
    });
    report.steps.push({
        name: "B.invalidBearer.get",
        status: badGet.status,
        error: badGet.body?.error,
        note: "After fix: expect 401. Before fix: 404 guest fallback.",
    });

    // Concurrent edit conflict: A puts with stale baseVersion
    if (getA.status === 200 && typeof getA.body?.serverVersion === "number") {
        const v = getA.body.serverVersion;
        const putConflict = await json(`${baseUrl}/api/storage/chili3d/documents/${DOC_ID}`, {
            method: "PUT",
            headers: { ...auth, "Content-Type": "application/json" },
            body: JSON.stringify({
                ...getA.body,
                name: getA.body.name,
                baseVersion: Math.max(0, v - 1),
            }),
        });
        report.steps.push({
            name: "A.put.staleBaseVersion",
            status: putConflict.status,
            body: putConflict.body,
            expect: "409 keeps server data",
        });
    }

    const file = path.join(outDir, `dual-session-${stamp()}.json`);
    fs.writeFileSync(file, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.log(`\nWrote ${file}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
