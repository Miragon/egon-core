import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REQUIRED_NODE_MAJOR = 24;
const activeNodeMajor = Number.parseInt(process.versions.node, 10);

if (activeNodeMajor < REQUIRED_NODE_MAJOR) {
    console.error(
        [
            `The egon-core demo requires Node ${REQUIRED_NODE_MAJOR} or newer (active: ${process.versions.node}).`,
            "Run:",
            "  nvm install",
            "  nvm use",
            "Then reinstall dependencies with yarn install.",
        ].join("\n"),
    );
    process.exit(1);
}

const [command = "serve", variant = "manual", ...forwardedArgs] =
    process.argv.slice(2);
const proxyPort = process.env.PORTLESS_PORT ?? "1355";
const stateDir =
    process.env.PORTLESS_STATE_DIR ??
    join(tmpdir(), `egon-core-portless-${process.getuid?.() ?? "user"}`);
const childEnvironment = {
    ...process.env,
    PORTLESS_PORT: proxyPort,
    PORTLESS_STATE_DIR: stateDir,
    PORTLESS_HTTPS: "0",
    PORTLESS_LAN: "0",
    PORTLESS_SYNC_HOSTS: "0",
    PORTLESS_TLD: "localhost",
};

const commands = {
    serve: () => {
        const routeName =
            variant === "e2e" ? "egon-core-e2e" : "egon-core-demo";
        return [
            "portless",
            [
                "run",
                "--name",
                routeName,
                "vite",
                "--config",
                "demo/vite.config.mts",
            ],
        ];
    },
    test: () => ["playwright", ["test", ...forwardedArgs]],
};

const resolveCommand = commands[command];
if (!resolveCommand) {
    console.error(`Unknown demo command: ${command}`);
    process.exit(1);
}

const [executable, args] = resolveCommand();

const child = spawn(executable, args, {
    env: childEnvironment,
    stdio: "inherit",
});

let forwardingSignal = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
        if (forwardingSignal) {
            return;
        }
        forwardingSignal = true;
        child.kill(signal);
    });
}

child.on("error", (error) => {
    console.error(`Could not start ${executable}: ${error.message}`);
    process.exitCode = 1;
});

child.on("exit", (code, signal) => {
    if (signal) {
        process.kill(process.pid, signal);
        return;
    }
    process.exitCode = code ?? 1;
});
