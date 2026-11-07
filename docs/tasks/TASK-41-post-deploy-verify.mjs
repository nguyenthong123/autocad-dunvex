#!/usr/bin/env node
// Part of the Chili3d Project, under the AGPL-3.0 License.
// Post-deploy TASK-41 acceptance against live VPS (synthetic users only).
// Usage: node docs/tasks/TASK-41-post-deploy-verify.mjs [baseUrl]

import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const baseUrl = (process.argv[2] || "http://136.66.95.155").replace(/\/+$/, "");
const outDir = path.resolve("docs/tasks/sync-evidence");
fs.mkdirSync(outDir, { recursive: true });

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

function stamp() {
    return new Date().toISOString().replace(/[:.]/g, "-");
}

async function register(username) {
    return json(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            username,
            password: "password123",
            storeName: username,
        }),
    });
}

async function main() {
    const report = {
        kind: "automated",
        at: new Date().toISOString(),
        baseUrl,
        cases: [],
        note: "Synthetic users only — does not touch production drawings or private backups.",
        macWinReal: {
            status: "separate",
            note: "Record Mac/Win browser results below after manual/device check; not filled by this script.",
            cases: [],
        },
    };

    const version = await json(`${baseUrl}/version.json`);
    report.cases.push({
        name: "version.endpoint",
        pass: version.status === 200 && version.body?.codeSha?.startsWith("3f82747d"),
        status: version.status,
        body: version.body,
    });

    const deployVersion = await json(`${baseUrl}/deploy-version.json`);
    report.cases.push({
        name: "deploy-version.endpoint",
        pass:
            deployVersion.status === 200 &&
            deployVersion.body?.tipSha?.startsWith("376c1314") &&
            deployVersion.body?.codeSha?.startsWith("3f82747d"),
        status: deployVersion.status,
        body: deployVersion.body,
    });

    const stampId = Date.now();
    const userAName = `task41_a_${stampId}`;
    const userBName = `task41_b_${stampId}`;
    const regA = await register(userAName);
    const regB = await register(userBName);
    report.cases.push({
        name: "register.A",
        pass: regA.status === 200 && Boolean(regA.body?.token),
        status: regA.status,
        userId: regA.body?.user?.id,
    });
    report.cases.push({
        name: "register.B",
        pass: regB.status === 200 && Boolean(regB.body?.token),
        status: regB.status,
        userId: regB.body?.user?.id,
    });

    const tokenA = regA.body?.token;
    const tokenB = regB.body?.token;
    const authA = { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" };
    const authB = { Authorization: `Bearer ${tokenB}`, "Content-Type": "application/json" };

    // Case: dual session same account — A saves recognizable change → B lists + opens version
    const docId = `task41_dual_${stampId}`;
    const marker = `TASK41-ACK-${stampId}`;
    const putA = await json(`${baseUrl}/api/storage/chili3d/documents/${docId}`, {
        method: "PUT",
        headers: authA,
        body: JSON.stringify({
            id: docId,
            name: marker,
            models: { nodes: [] },
            version: "0.7.1",
        }),
    });
    report.cases.push({
        name: "A.save.serverAck",
        pass: putA.status === 200 && putA.body?.ok === true && putA.body?.version === 1,
        status: putA.status,
        body: putA.body,
    });

    // Session B uses the SAME account token (second browser / Win)
    const listB = await json(`${baseUrl}/api/storage/chili3d/recents?page=0&count=20`, {
        headers: { Authorization: `Bearer ${tokenA}` },
    });
    const idsB = Array.isArray(listB.body) ? listB.body.map((r) => r.id) : [];
    report.cases.push({
        name: "B.sameAccount.listSeesDoc",
        pass: listB.status === 200 && idsB.includes(docId),
        status: listB.status,
        ids: idsB,
    });

    const getB = await json(`${baseUrl}/api/storage/chili3d/documents/${docId}`, {
        headers: { Authorization: `Bearer ${tokenA}` },
    });
    report.cases.push({
        name: "B.sameAccount.openCorrectVersion",
        pass: getB.status === 200 && getB.body?.name === marker && getB.body?.serverVersion === 1,
        status: getB.status,
        nameField: getB.body?.name,
        serverVersion: getB.body?.serverVersion,
    });

    // Expired / invalid token → 401 (must re-login), not guest data
    const badGet = await json(`${baseUrl}/api/storage/chili3d/documents/${docId}`, {
        headers: { Authorization: "Bearer expired.or.garbage" },
    });
    report.cases.push({
        name: "expiredToken.requiresRelogin.401",
        pass: badGet.status === 401 && badGet.body?.error === "UNAUTHORIZED",
        status: badGet.status,
        body: badGet.body,
    });

    const meExpired = await json(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: "Bearer expired.or.garbage" },
    });
    report.cases.push({
        name: "auth.me.expired.401",
        pass: meExpired.status === 401,
        status: meExpired.status,
    });

    // Pending ownership: A doc must not appear in B's DB after A saved under A
    const asB = await json(`${baseUrl}/api/storage/chili3d/documents/${docId}`, {
        headers: { Authorization: `Bearer ${tokenB}` },
    });
    report.cases.push({
        name: "ownerIsolation.B.cannotSeeA",
        pass: asB.status === 404,
        status: asB.status,
    });

    // Guest cannot see A's doc
    const guest = await json(`${baseUrl}/api/storage/chili3d/documents/${docId}`);
    report.cases.push({
        name: "guest.cannotSeeA",
        pass: guest.status === 404,
        status: guest.status,
    });

    // Second edit A → version bump; B (same token) sees v2
    const putA2 = await json(`${baseUrl}/api/storage/chili3d/documents/${docId}`, {
        method: "PUT",
        headers: authA,
        body: JSON.stringify({
            id: docId,
            name: `${marker}-v2`,
            models: { nodes: [] },
            version: "0.7.1",
            baseVersion: 1,
        }),
    });
    const getB2 = await json(`${baseUrl}/api/storage/chili3d/documents/${docId}`, {
        headers: { Authorization: `Bearer ${tokenA}` },
    });
    report.cases.push({
        name: "A.edit.B.seesVersion2",
        pass:
            putA2.status === 200 &&
            putA2.body?.version === 2 &&
            getB2.body?.serverVersion === 2 &&
            getB2.body?.name === `${marker}-v2`,
        putStatus: putA2.status,
        putVersion: putA2.body?.version,
        getVersion: getB2.body?.serverVersion,
        getName: getB2.body?.name,
    });

    report.passed = report.cases.filter((c) => c.pass).length;
    report.failed = report.cases.filter((c) => !c.pass).length;
    report.allPass = report.failed === 0;

    const file = path.join(outDir, `post-deploy-automated-${stamp()}.json`);
    fs.writeFileSync(file, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.log(`\nWrote ${file}`);
    process.exit(report.allPass ? 0 : 1);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
