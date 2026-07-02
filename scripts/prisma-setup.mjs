import { execSync } from "node:child_process";
import { readdirSync } from "node:fs";

const run = (command, options = {}) => {
    execSync(command, {
        stdio: "inherit",
        env: process.env,
        ...options,
    });
};

const runCapture = command => {
    try {
        return { ok: true, output: execSync(command, { encoding: "utf8", env: process.env }) };
    } catch (error) {
        return { ok: false, output: `${error.stdout ?? ""}${error.stderr ?? ""}`, error };
    }
};

const listMigrationNames = () =>
    readdirSync("prisma/migrations", { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .sort();

/**
 * P3005 means the target database already has a schema but no migration history
 * (e.g. it was originally provisioned via `db push` rather than `migrate deploy`).
 * Baselining only records each migration as applied — it runs no SQL and never
 * touches the schema, so it's safe to do unattended. Any other failure (real
 * drift, a migration that errors mid-run, etc.) is left to fail loudly.
 */
const baselineExistingDatabase = () => {
    console.warn(
        "[prisma-setup] Existing database schema with no migration history detected (P3005). " +
        "Baselining: marking all known migrations as already applied. This only writes " +
        "tracking metadata — it does not execute any SQL or modify the schema.",
    );
    for (const name of listMigrationNames()) {
        run(`npx prisma migrate resolve --applied "${name}"`);
    }
};

const extractFailedMigrationName = output => {
    const p3009Match = output.match(/The `([^`]+)` migration started at .+ failed/);
    if (p3009Match) {
        return p3009Match[1];
    }

    const p3018Match = output.match(/Migration name: ([^\n]+)/);
    return p3018Match?.[1]?.trim();
};

const isDuplicateSchemaObjectError = output =>
    /42701|42P07|duplicate_column|duplicate_table|already exists/i.test(output);

/**
 * P3009 means a previous deploy left a migration marked as failed (e.g. the
 * process was killed mid-run, or two services raced to apply the same DDL
 * against a shared database), so Prisma refuses to apply anything further.
 * Since every migration in this project is written with IF NOT EXISTS / IF
 * EXISTS guards, it's safe to mark the failed one as rolled back and retry:
 * the retry is a no-op against whatever already landed and simply continues
 * from there. If the underlying SQL has a real bug, the retry fails again
 * and that error surfaces normally.
 *
 * P3018 with duplicate-object errors means the DDL partially or fully landed
 * before Prisma recorded success. Marking the migration as applied lets deploy
 * continue without re-running non-idempotent SQL.
 */
const recoverFromDeployFailure = output => {
    const name = extractFailedMigrationName(output);
    if (!name) {
        return false;
    }

    if (/P3018/.test(output) && isDuplicateSchemaObjectError(output)) {
        console.warn(
            `[prisma-setup] Migration "${name}" failed because the schema change already exists. ` +
            "Marking it as applied and continuing.",
        );
        run(`npx prisma migrate resolve --applied "${name}"`);
        return true;
    }

    if (/P3009/.test(output)) {
        console.warn(
            `[prisma-setup] Migration "${name}" is marked as failed (P3009). Marking it ` +
            "rolled back and retrying — migrations are written to be idempotent, so a clean " +
            "retry is expected to succeed.",
        );
        run(`npx prisma migrate resolve --rolled-back "${name}"`);
        return true;
    }

    return false;
};

const deployMigrations = () => {
    const maxRecoveryAttempts = 10;

    for (let attemptIndex = 0; attemptIndex <= maxRecoveryAttempts; attemptIndex++) {
        const attempt = runCapture("npx prisma migrate deploy");
        if (attempt.ok) {
            process.stdout.write(attempt.output);
            return;
        }

        if (/P3005/.test(attempt.output)) {
            baselineExistingDatabase();
            continue;
        }

        if (attemptIndex < maxRecoveryAttempts && recoverFromDeployFailure(attempt.output)) {
            continue;
        }

        process.stderr.write(attempt.output);
        throw attempt.error;
    }
};

const generateClient = () => {
    run("npx prisma generate");
};

deployMigrations();
generateClient();
