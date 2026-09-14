/**
 * Generates collision-free element ids for one diagram.
 *
 * The set of already-used ids lives on the instance (not at module scope) so
 * that two EgonClient instances sharing the JS module realm keep separate id
 * pools — a shared pool would let one diagram's ids suppress another's and
 * cross-contaminate generation (issue #12). Each didi injector owns one factory.
 */
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
