/**
 * Generates collision-free element ids for one diagram.
 *
 * The list of already-used ids lives on the instance (not at module scope) so
 * that two EgonClient instances sharing the JS module realm keep separate id
 * pools — a shared pool would let one diagram's ids suppress another's and
 * cross-contaminate generation (issue #12). Each didi injector owns one factory.
 */
export class DomainStoryIdFactory {
    private readonly idList: string[] = [];

    getId(type: string) {
        return this.generateId(type);
    }

    registerId(id: string) {
        this.idList.push(id);
    }

    private generateId(type: string) {
        let idNumber = this.fourDigitsId();

        let id = `${type}_${this.idSuffix(idNumber)}`;

        while (this.containsId(id)) {
            idNumber += 1;
            id = `${type}_${this.idSuffix(idNumber)}`;
        }

        this.idList.push(id);

        return id;
    }

    private containsId(id: string) {
        return this.idList.includes(id);
    }

    private fourDigitsId() {
        return Math.floor(Math.random() * 10000);
    }

    private idSuffix(idNumber: number) {
        let id;
        if (idNumber > 9999) {
            id = "0";
        } else if (idNumber < 10) {
            id = "000" + idNumber;
        } else if (idNumber < 100) {
            id = "00" + idNumber;
        } else if (idNumber < 1000) {
            id = "0" + idNumber;
        } else {
            id = "" + idNumber;
        }
        return id;
    }
}
