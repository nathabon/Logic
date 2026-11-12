// @ts-check

/** @typedef {boolean[]} Bits */
/** @typedef {[Block, number]} Port */

/**
 * 
 * @param {number[]} l 
 * @returns 
 */
function sum(l) {
    return l.reduce((partialSum, a) => partialSum + a, 0)
}

// MARK: GateType
class GateType {

    /** @type {string} */
    name;
    /** @type {number} */
    n_in;
    /** @type {number} */
    n_out;
    /** @type {(...inputs: boolean[]) => Bits} */
    func;
    /** @type {number} */
    delay;

    /**
     * @param {string} name
     * @param {number} n_in
     * @param {number} n_out
     * @param {(...inputs: boolean[]) => Bits} func
     * @param {number} delay
     */
    constructor(name, n_in, n_out, func, delay = 1) {
        this.name = name;
        this.n_in = n_in;
        this.n_out = n_out;
        this.func = func;
        this.delay = delay
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


    toJson() {
        return {
            'source': [this.source?.[0].id, this.source?.[1]],
            'destinations': this.destinations.map((p) => ([p[0].id, p[1]]))
        };
    }
}


// MARK: Block
class Block {

    /** @type {GateType} */
    kind;
    /** @type {string} */
    name;
    /** @type {string} */
    id;
    /** @type {(Wire | null)[]} */
    inputs;
    /** @type {Wire[]} */
    outputs;
    /** @type {Bits[]} */
    #pipe;
    /** @type {number} */
    #head = 0;

    /**
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

        const zeros = Object.freeze(new Array(kind.n_out).fill(false));
        this.#pipe = new Array(kind.delay - 1).fill(zeros);
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
     * @returns {Bits}
     */
    compute() {
        var vals = this.inputs.map((i) => i?.value ?? false);
        const next = this.func(...vals);

        const pipe = this.#pipe;
        if (pipe.length === 0) return next

        const out = pipe[this.#head];
        pipe[this.#head] = next;
        this.#head = (this.#head + 1) % pipe.length;
        return out;
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            kind: this.kind.name,
            pipe: this.#pipe,
            head: this.#head
        };
    }

    /**
     * @param {{ kind: string | number; name: string | null | undefined; id: string; pipe: Bits[]; head: number; }} data
     */
    static fromJSON(data) {
        /** @type {Block} */
        
        switch (data.kind) {
            case "source":
                return Source.fromJSON(data);
            
            case "clock":
                return Clock.fromJSON(data);
        
            default:
                const block = new Block(GATES[data.kind], data.name);
                block.id = data.id;
                block.#pipe = data.pipe;
                block.#head = data.head;

                return block;
        } 
    }
}


// MARK: Circuit
class Circuit {

    /** @type {Block[]} */
    blocks;
    /** @type {number} */
    tick;

    /**
     * @param {Block[] | null} blocks 
     */
    constructor(blocks=null) {
        this.blocks = blocks ?? [];
        this.tick = 0;
    }

    /**
     * @param {Block} block 
     */
    add(block) {
        const ids = this.blocks.filter((b) => b.kind.name == block.kind.name);
        const idsN = ids.map((b) => Number(b.id.toLowerCase().replace(b.kind.name, '')));
        var id = Math.max(...idsN);
        if (id == -Infinity) id = -1;
        
        block.id = block.kind.name + (id + 1);
        this.blocks.push(block);

        return block;
    }

    /**
     * @param {string} id 
     * @returns {Block | undefined}
     */
    getBlock(id) {
        return this.blocks.find((b) => (b.id == id));
    }

    /**
     * @param {Block} src 
     * @param {number} src_port 
     * @param {Block} dst 
     * @param {number} dst_port 
     * @return {Wire}
     */
    connect(src, src_port, dst, dst_port) {
        if (dst.inputs[dst_port] != null) {
            return dst.inputs[dst_port];
        }

        var net = src.outputs[src_port];
        net.destinations.push([dst, dst_port]);
        dst.inputs[dst_port] = net;

        return net;
    }

    /**
     * @param {Wire} wire 
     * @param {number} port 
     */
    disconnect(wire, port) {
        if (!wire.source) return

        const [dst, _port] = wire.destinations[port];
        const i = wire.destinations.indexOf([dst, _port]);
        wire.destinations.slice(i, 1);
        dst.inputs[_port] = null;
    }   

    step() {
        /** @type {[Block, Bits][]} */
        var results = this.blocks.map((b) => [b, b.compute()]);
        for (const [b, bits] of results) {
            for (let i = 0; i < bits.length; i++) {
                const wire = b.outputs[i];
                wire.value = bits[i];
            }
        }
        this.tick++;
    }

    toJSON() {
        return {
            blocks: this.blocks.map((b) => b.toJSON())
        };
    }

    /**
     * @param {{ blocks: any; }} data
     */
    static fromJSON(data) {
        const c = new Circuit();
        for (const b of data.blocks) {
            c.add(/** @type {Block} */ (Block.fromJSON(b)));
        }

        return c;
    }
}