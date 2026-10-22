const SOURCE_FALSE = new GateType("source false", 0, 1, () => [false]);
const SOURCE_TRUE = new GateType("source true", 0, 1, () => [true]);
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
}