const SOURCE_FALSE = new GateType("source", 0, 1, () => [false]);
const SOURCE_TRUE = new GateType("source", 0, 1, () => [true]);
const CLOCK = new GateType('clock', 0, 1, () => [false]);
const NOT = new GateType("not", 1, 1, (a) => [!a]);
const AND = new GateType("and", 2, 1, (a, b) => [a && b]);
const OR = new GateType("or", 2, 1, (a, b) => [a || b]);

/** @type {Record<string, GateType>} */
const GATES = {
    'source': SOURCE_FALSE,
    'clock': CLOCK,
    'not': NOT,
    'and': AND,
    'or': OR
};


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

    compute() {
        return [this.value];
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            kind: 'source',
            value: this.value
        };
    }

    static fromJSON(data) {
        const block = new Source(data.name, data.value);
        block.id = data.id;

        return block;
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
        super(new GateType("clock", 0, 1, null));
        this.name = name;
        this.f = f;
        this.count = initial_count;
        this.outputs[0].value = false;
    }

    compute() {
        if (this.count == 0) {
            this.count++; 
            this.outputs[0].value = true;
            return [true];
        }
        if (this.count == this.f) {
            this.count = 0;
            this.outputs[0].value = false;
            return [false];
        }
        this.count++;
        this.outputs[0].value = false;
        return [false];
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

    static fromJSON(data) {
        const block = new Clock(data.name, data.f, data.count);
        block.id = data.id;

        return block;
    }
}