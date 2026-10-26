/**
 * Ordered, uniquely-keyed store. The first write for a key wins: {@link set}
 * and {@link putEntry} never overwrite, so importing an icon set cannot clobber
 * an existing entry.
 */
export class Dictionary<T> {
    private entries: Entry<T>[];

    constructor() {
        this.entries = [];
    }

    get length(): number {
        return this.entries.length;
    }

    all(): Entry<T>[] {
        return this.entries;
    }

    isEmpty(): boolean {
        return this.entries.length <= 0;
    }

    has(key: string): boolean {
        return this.keysArray().includes(key);
    }

    set(key: string, value: T): void {
        if (!this.has(key)) {
            this.entries.push(new Entry(value, key));
        }
    }

    putEntry(entry: Entry<T>): void {
        if (!this.has(entry.key)) {
            this.entries.push(entry);
        }
    }

    keysArray(): string[] {
        return this.entries.map((entry) => entry.key);
    }

    appendDict(dict: Dictionary<T>): void {
        dict.entries.forEach((entry) => this.putEntry(entry));
    }

    clear(): void {
        this.entries = [];
    }

    delete(key: string): void {
        this.entries = this.entries.filter((entry) => entry.key !== key);
    }

    /**
     * Throws on a missing key so an absent icon surfaces here instead of
     * silently rendering nothing. Use {@link find} when absence is expected.
     */
    get(key: string): T {
        const found = this.find(key);
        if (!found) {
            throw new Error(`Key ${key} not found in dictionary`);
        }
        return found;
    }

    find(key: string): T | undefined {
        return this.entries.find((entry) => entry.key === key)?.value;
    }

    toRecord(): Record<string, T> {
        const record: Record<string, T> = {};
        this.entries.forEach((entry) => {
            record[entry.key] = entry.value;
        });
        return record;
    }

    /**
     * Skips `null`/`undefined` so a file missing an icon creates no empty key.
     */
    static fromRecord<T>(record: Record<string, T>): Dictionary<T> {
        const dictionary = new Dictionary<T>();
        Object.keys(record).forEach((key) => {
            const value = record[key];
            if (value != null) {
                dictionary.set(key, value);
            }
        });
        return dictionary;
    }
}

export class Entry<T> {
    value: T;
    key: string;
    keyWords: string[];

    constructor(value: T, key: string, keyWords: string[] = []) {
        this.value = value;
        this.key = key;
        this.keyWords = keyWords;
    }
}
