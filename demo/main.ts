import "egon-core/style.css";
import "./styles.css";

import actorIcon from "./icons/person.svg?raw";
import workObjectIcon from "./icons/document.svg?raw";
import { EgonClient, type DomainStoryDocument } from "egon-core";

function requiredElement<T extends Element>(selector: string): T {
    const element = document.querySelector<T>(selector);
    if (!element) {
        throw new Error(`The demo page is missing ${selector}.`);
    }
    return element;
}

const canvas = requiredElement<HTMLElement>("#canvas");
const jsonEditor = requiredElement<HTMLTextAreaElement>("#story-json");
const status = requiredElement<HTMLElement>("#status");
const newStoryButton = requiredElement<HTMLButtonElement>("#new-story");
const exportButton = requiredElement<HTMLButtonElement>("#export-json");
const importButton = requiredElement<HTMLButtonElement>("#import-json");

let client: EgonClient | undefined;
let storyChanged: (() => void) | undefined;
let importRepaired: (() => void) | undefined;

function setStatus(message: string, kind: "ready" | "error" = "ready") {
    status.textContent = message;
    status.dataset["state"] = kind;
}

function disposeClient() {
    if (!client) {
        return;
    }
    if (storyChanged) {
        client.off("story.changed", storyChanged);
    }
    if (importRepaired) {
        client.off("import.repaired", importRepaired);
    }
    client.destroy();
    client = undefined;
    storyChanged = undefined;
    importRepaired = undefined;
}

async function createClient() {
    disposeClient();
    canvas.replaceChildren();

    const nextClient = await EgonClient.create({ container: canvas });
    nextClient.loadIcons({
        name: "demo",
        actors: { Person: actorIcon },
        workObjects: { Document: workObjectIcon },
    });

    storyChanged = () => setStatus("Story changed.");
    importRepaired = () =>
        setStatus("Imported story was repaired while loading.", "error");
    nextClient.on("story.changed", storyChanged);
    nextClient.on("import.repaired", importRepaired);
    client = nextClient;
    setStatus("Editor ready.");
}

newStoryButton.addEventListener("click", async () => {
    try {
        await createClient();
        setStatus("New empty story ready.");
    } catch (error) {
        setStatus(`Could not create story: ${String(error)}`, "error");
    }
});

exportButton.addEventListener("click", () => {
    if (!client) {
        setStatus("The editor is not ready yet.", "error");
        return;
    }
    jsonEditor.value = JSON.stringify(client.export(), null, 2);
    setStatus("Story exported to the JSON panel.");
});

importButton.addEventListener("click", () => {
    if (!client) {
        setStatus("The editor is not ready yet.", "error");
        return;
    }
    try {
        const document = JSON.parse(jsonEditor.value) as DomainStoryDocument;
        client.import(document);
        setStatus("Story imported from the JSON panel.");
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatus(`Could not import JSON: ${message}`, "error");
    }
});

void createClient().catch((error) => {
    setStatus(`Could not start editor: ${String(error)}`, "error");
});

if (import.meta.hot) {
    import.meta.hot.dispose(disposeClient);
}
