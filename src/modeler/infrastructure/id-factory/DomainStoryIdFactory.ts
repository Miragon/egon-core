/** Collision-free ids for one diagram; the pool is per instance (ADR ARC-5). */
export class DomainStoryIdFactory {
    private readonly ids = new Set<string>();

    getId(type: string) {
        return this.generateId(type);
    }

    registerId(id: string) {
        this.ids.add(id);
    }

    private generateId(type: string) {
        let idNumber = this.fourDigitsId();

        let id = `${type}_${this.idSuffix(idNumber)}`;

        while (this.containsId(id)) {
            idNumber += 1;
            id = `${type}_${this.idSuffix(idNumber)}`;
        }

        this.ids.add(id);

        return id;
    }

    private containsId(id: string) {
        return this.ids.has(id);
    }

    private fourDigitsId() {
        return Math.floor(Math.random() * 10000);
    }

    private idSuffix(idNumber: number) {
        return String(idNumber).padStart(4, "0");
    }
}
