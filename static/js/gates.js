const SOURCE_FALSE = new GateType("source", 0, 1, () => [false]);
const SOURCE_TRUE = new GateType("source", 0, 1, () => [true]);
const NOT = new GateType("not", 1, 1, (a) => [!a]);
const AND = new GateType("and", 2, 1, (a, b) => [a && b]);
const OR = new GateType("or", 2, 1, (a, b) => [a || b]);


// MARK: Source
class Source extends Block {

    /** @type {boolean} */
    value;

    /**
     * 
     * @param {string | null} name 
     * @param {boolean} value 
     */
    constructor(name = null, value = false) {
        super(SOURCE_FALSE, name ?? "source");
        this.value = value;
        this.outputs[0].value = value;
    }

    /**
     * 
     * @param {boolean} value 
     */
    set(value) {
        this.value = value;
        this.outputs[0].value = value;
    }

    evaluate() {
        return false;
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            kind: 'source',
            value: this.value
        };
    }
}


// MARK: Clock
class Clock extends Block {

    /** @type {number} */
    f;
    /** @type {number} */
    count;

    /**
     * 
     * @param {string} name 
     * @param {number} f 
     * @param {number} initial_count 
     */
    constructor(name = null, f = 1, initial_count = 0) {
        super(new GateType("source", 0, 1, null));
        this.name = name;
        this.f = f;
        this.count = initial_count;
    }

    evaluate() {
        if (this.count == 0) return true;
        if (this.count == f) {
            this.count = 0;
            this.outputs[0].value = true;
            return true;
        }
        this.outputs[0].value = false;
        return false;
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            kind: 'clock',
            f: this.f,
            count: this.count
        };
    }
}