// @ts-check

/** @typedef {boolean[]} Bits */
/** @typedef {[Block, number]} Port */

/**
 * 
 * @param {Number[]} l 
 * @returns 
 */
function sum(l) {
    return l.reduce((partialSum, a) => partialSum + a, 0)
}

// MARK: GateType
class GateType {

    /** @type {string} */
    name;
    /** @type {Number} */
    n_in;
    /** @type {Number} */
    n_out;
    /** @type {(...inputs: boolean[]) => Bits} */
    func;

    /**
     * @param {string} name
     * @param {number} n_in
     * @param {number} n_out
     * @param {(...inputs: boolean[]) => Bits} func
     */
    constructor(name, n_in, n_out, func) {
        this.name = name;
        this.n_in = n_in;
        this.n_out = n_out;
        this.func = func;
    }
}





// MARK: Wire
class Wire {

    /** @type {boolean} */
    value;
    /** @type {Port | null} */
    source;
    /** @type {Port[]} */
    destinations;

    /**
     * @param {boolean} value 
     * @param {Port | null} source 
     * @param {Port[]} destination 
     */
    constructor(value = false, source = null, destination = []) {
        this.value = value;
        this.source = source;
        this.destinations = destination;
    }
}


// MARK: Block
class Block {

    /** @type {GateType} */
    kind;
    /** @type {string} */
    name;
    /** @type {(Wire | null)[]} */
    inputs;
    /** @type {Wire[]} */
    outputs;

    /**
     * 
     * @param {GateType} kind 
     * @param {string | null} name 
     */
    constructor(kind, name = null) {
        this.kind = kind;
        this.name = name ?? kind.name;
        this.inputs = new Array(kind.n_in).fill(null);
        this.outputs = new Array(kind.n_out)
        for (let i = 0; i < kind.n_out; i++) {
            let wire = new Wire();
            wire.source = [this, i];
            this.outputs[i] = wire;
        }
    }

    get n_in() {
        return this.kind.n_in;
    }

    get n_out() {
        return this.kind.n_out;
    }

    get func() {
        return this.kind.func;
    }

    get values() {
        return this.outputs.map((o) => o.value);
    }

    /**
     * Return true if an output has changed
     * @returns {boolean}
     */
    evaluate() {
        const vals = this.inputs.map((wire) => (wire?.value ?? false));
        const next = this.kind.func(...vals);

        let changed = false;
        const n = Math.min(this.outputs.length, next.length);
        for (let i = 0; i < n; i++) {
            const net = this.outputs[i];
            if (net.value !== next[i]) {
                net.value = next[i];
                changed = true;
            }
        }
        return changed;
    }
}


// MARK: Circuit
class Circuit {

    /** @type {Block[]} */
    blocks;
    /** @type {Block[] | null} */
    #order;

    /**
     * 
     * @param {Block[] | null} blocks 
     * @param {Block[] | null} _order 
     */
    constructor(blocks, _order = null) {
        this.blocks = blocks ?? [];
        this.#order = _order;
    }

    /**
     * 
     * @param {Block} block 
     */
    add(block) {
        this.blocks.push(block);
        this.#order = null;

        return block;
    }

    /**
     * 
     * @param {Block} src 
     * @param {Number} src_port 
     * @param {Block} dst 
     * @param {Number} dst_port 
     */
    connect(src, src_port, dst, dst_port) {
        if (dst.inputs[dst_port] != null) {
            return;
        }

        var net = src.outputs[src_port];
        net.destinations.push([dst, dst_port]);
        dst.inputs[dst_port] = net;
        this.#order = null;
    }

    toposort() {
        /** @type {Map<Block, Number>} */
        var indeg = new Map();
        this.blocks.forEach(b => {
            const count = b.inputs.filter((i) => (i != null && i.source != null && i.source[0] != b)).length;
            indeg.set(b, count);
        });
        /** @type {Block[]} */
        var ready = new Array();
        for (const [b, d] of indeg.entries()) {
            if (d == 0) ready.push(b);
        }

        var order = new Array();
        while (ready.length != 0) {
            var b = ready.pop();
            if (b === undefined) continue;
            order.push(b);
            for (const net of b.outputs) {
                for (const [sink, _] of net.destinations) {
                    const count = indeg.get(sink);
                    if (count === undefined) continue;
                    indeg.set(sink, count - 1);
                    if (count - 1 === 0) {
                        ready.push(sink);
                    }
                }
            }
        }

        if (order.length == this.blocks.length) return order;
        return null;
    }

    /**
     * 
     * @param {Number} max_iter 
     */
    step(max_iter = 100) {
        if (this.#order == null) this.#order = this.toposort();
        if (this.#order != null) {
            for (const b of this.#order) b.evaluate();
        } else {
            for (let _ = 0; _ < max_iter; _++) {
                if (this.blocks.map((b) => b.evaluate()).find((b) => b) != undefined) return;
            }

            throw new Error("Looping in the circuit");
        }
    }
}