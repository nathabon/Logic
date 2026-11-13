/** @typedef {[BlockGUI, number]} PortGUI */
/** @typedef {[number, number]} {Point} */
/** @typedef {{tip: Point, attach: Point|null}} {Pin} */
/** @typedef {BlockGUI | WireGUI} {UIElement} */

function inInterval(n, a, b) {
    if (a > b) return inInterval(n, b, a);
    return a <= n && n <= b;
}

//MARK: HitMaskCache
class HitMaskCache {
    /** @type {Map<HTMLImageElement, Map<number, Uint8Array>>} image -> (size key -> mask) */
    static #masks = new Map();
    /** @type {WeakSet<HTMLImageElement>} images whose canvas is tainted */
    static #failed = new WeakSet();

    /**
     * @param {HTMLImageElement} img
     * @param {number} w drawn width, in pixels
     * @param {number} h drawn height, in pixels
     * @param {number} [alphaThreshold]
     * @returns {Uint8Array | null} w*h bytes, 1 = inside the silhouette
     */
    static get(img, w, h, alphaThreshold = 16) {
        const key = w * 65536 + h; // numeric key: no string allocation on hot paths
        const bySize = this.#masks.get(img);
        const cached = bySize?.get(key);
        if (cached) return cached;
        if (this.#failed.has(img)) return null;
        if (!img.complete || img.naturalWidth === 0) return null;

        const off = new OffscreenCanvas(w, h);
        const octx = /** @type {OffscreenCanvasRenderingContext2D} */ (off.getContext("2d"));
        octx.drawImage(img, 0, 0, w, h);

        let rgba;
        try {
            rgba = octx.getImageData(0, 0, w, h).data;
        } catch {
            this.#failed.add(img); // tainted canvas (file://)
            return null;
        }

        const n = w * h;
        const ink = new Uint8Array(n);
        for (let i = 0; i < n; i++) ink[i] = rgba[i * 4 + 3] > alphaThreshold ? 1 : 0;

        const outside = new Uint8Array(n);
        const stack = new Int32Array(n);
        let sp = 0;
        const push = (/** @type {number} */ i) => {
            if (ink[i] === 0 && outside[i] === 0) { outside[i] = 1; stack[sp++] = i; }
        };
        for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
        for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
        while (sp > 0) {
            const i = stack[--sp];
            const x = i % w;
            if (x > 0) push(i - 1);
            if (x < w - 1) push(i + 1);
            if (i >= w) push(i - w);
            if (i < n - w) push(i + w);
        }

        const mask = new Uint8Array(n);
        for (let i = 0; i < n; i++) mask[i] = outside[i] === 1 ? 0 : 1;

        let m = bySize;
        if (!m) { m = new Map(); this.#masks.set(img, m); }
        m.set(key, mask);
        return mask;
    }
}

//MARK: SpriteCache
class SpriteCache {
    /** @type {Map<string, HTMLImageElement>} */
    static #images = new Map();
    /** @type {Map<string, [HTMLImageElement, number, number]>} */
    static #requests = new Map();

    /**
     * @param {string} src
     * @param {number} w drawn width
     * @param {number} h drawn height
     */
    static get(src, w, h) {
        let img = this.#images.get(src);
        if (!img) {
            img = new Image();
            img.src = src;
            this.#images.set(src, img);
        }
        this.#requests.set(`${src}|${w}x${h}`, [img, w, h]);
        return img;
    }

    /** Resolves once images are decoded; builds each requested mask up front. */
    static async ready() {
        await Promise.all(
            [...this.#images.values()].map((img) => img.decode().catch(() => { }))
        );
        for (const [img, w, h] of this.#requests.values()) HitMaskCache.get(img, w, h);
    }
}

// MARK: RenderingDrawContext
class RenderingDrawContext {
    /** @type {HTMLCanvasElement} */
    canvas;
    /** @type {CanvasRenderingContext2D} */
    ctx;
    /** @type {Vec2} */
    posDelta = new Vec2(0, 0);
    /** @type {number} */
    posScale = 1;
    /** @type {UIElement[]} */
    selecteds;
    /** @type {UIElement | null} */
    captured;
    /** @type {UIElement | null} */
    hovered = null;

    /**
     * @param {HTMLCanvasElement} canvas 
     * @param {CanvasRenderingContext2D} ctx 
     * @param {Vec2} posDelta 
     * @param {number} posScale 
     * @param {UIElement[]} selecteds 
     * @param {UIElement | null} captured
     * @param {UIElement | null} hovered 
     */
    constructor(canvas, ctx, posDelta, posScale, selecteds, captured, hovered) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.posDelta = posDelta;
        this.posScale = posScale;
        this.selecteds = selecteds;
        this.captured = captured;
        this.hovered = hovered;
    }
}

//MARK: BlockGUI
class BlockGUI {
    /** @type {[number, number]} */
    static DEFAULT_SIZE = [100, 100];
    /** @type {Record<string, [Pin[], Pin[]]>} */
    static PINS_POSITION = {
        "source": [
            [],
            [{ tip: [0.95, 0.5], attach: [0.75, 0.5] }]
        ],
        "not": [
            [{ tip: [0.05, 0.5], attach: [0.3175, 0.5] }], // In
            [{ tip: [0.95, 0.5], attach: [0.835, 0.5] }] // Out
        ],
        "and": [
            [{ tip: [0.05, 0.3575], attach: [0.3099, 0.3575] }, { tip: [0.05, 0.6425], attach: [0.3099, 0.6425] }], // In
            [{ tip: [0.95, 0.5], attach: [0.76999, 0.5] }] // Out
        ],
        "or": [
            [{ tip: [0.05, 0.3575], attach: [0.31999, 0.3575] }, { tip: [0.05, 0.6425], attach: [0.31999, 0.6425] }], // In
            [{ tip: [0.95, 0.5], attach: [0.72001, 0.5] }] // Out
        ],
        "xor": [
            [{ tip: [0.05, 0.3475], attach: [0.28999, 0.3475] }, { tip: [0.05, 0.6325], attach: [0.28999, 0.6325] }], // In
            [{ tip: [0.95, 0.5], attach: [0.78125, 0.5] }] // Out
        ],
    }

    /** @type {Partial<Record<string, (ctx: CanvasRenderingContext2D, gui: BlockGUI) => void>>} */
    static CUSTOM_DRAW = {
        'source': (rc, block) => {
            rc.ctx.font = "48px serif";
            rc.ctx.fillText("Test", block.x, block.y);
        }
    }

    /** @type {Block} */
    block;
    /** @type {Vec2} */
    pos;
    /** @type {[Pin[], Pin[]]} */
    pinsPos;
    /** @type {Vec2} */
    size;
    /** @type {number} */
    rotation;
    /** @type {HTMLImageElement} */
    img;
    /** @type {((ctx: CanvasRenderingContext2D, gui: BlockGUI) => void) | null} */
    customDraw;

    /**
     * @param {Block} block
     * @param {[number, number]} [pos]
     * @param {[number, number]} [size]
     * @param {number} rotation
     */
    constructor(block, pos = [0, 0], size = BlockGUI.DEFAULT_SIZE, rotation=0.0) {
        this.block = block;
        this.pos = new Vec2(...pos);
        this.size = new Vec2(...size);
        this.rotation = rotation;
        this.img = SpriteCache.get(`static/images/gates/${block.kind.name}_body.svg`, this.size[0], this.size[1]); // TODO: add EU / US gates
        
        if (this.hasImg) this.pinsPos = BlockGUI.PINS_POSITION[this.kind];
        else {
            const dStart = 1 / (this.block.n_in + 1);
            const dEnd = 1 / (this.block.n_out + 1);
            const start = new Array(this.block.n_in);
            for (let i = 1; i < this.block.n_in + 1; i++) start[i - 1] = {tip: [-0.1, i * dStart], attach: [0, i * dStart]};
            const end = new Array(this.block.n_out);
            for (let i = 1; i < this.block.n_out + 1; i++) end[i - 1] = {tip: [1.1, i * dEnd], attach: [1, i * dEnd]};
            this.pinsPos = [start, end];
        }

        this.customDraw = BlockGUI.CUSTOM_DRAW[this.kind];
    }

    get x() { return this.pos[0]; }
    set x(v) { this.pos[0] = v; }
    get y() { return this.pos[1]; }
    set y(v) { this.pos[1] = v; }
    get center() { return this.pos.add(this.size.scale(0.5)); }

    get kind() { return this.block.kind.name; }
    get hasImg() { return this.img.complete && this.img.naturalWidth > 0; }

    
    /**
     * @param {number} i 
     * @param {number} j 
     * @returns {{tip: Vec2, attach: Vec2 | null}}
     */
    pinAt(i, j) {
        const pin = this.pinsPos[i][j];
        const x = pin.tip[0] * this.size.x + this.x;
        const y = pin.tip[1] * this.size.y + this.y;

        if (pin.attach) {
            const _x = pin.attach[0] * this.size.x + this.x;
            const _y = pin.attach[1] * this.size.y + this.y;

            return {tip: new Vec2(x, y), attach: new Vec2(_x, _y)};
        }

        return {tip: new Vec2(x, y), attach: null};
    }

    pinContains(x, y) {
        const p = new Vec2(x, y);
        for (let i = 0; i < this.block.n_in; i++) if (this.pinAt(0, i).tip.distanceTo(p) <= 3) return [0, i];
        for (let i = 0; i < this.block.n_out; i++) if (this.pinAt(1, i).tip.distanceTo(p) <= 3) return [1, i];
        return null;
    }

    /** @param {RenderingDrawContext} rc */
    draw(rc) {
        const ctx = rc.ctx;
        ctx.save();

        /**
         * @param {Pin} pin 
         * @param {Wire | null} wire 
         */
        function drawPin(pin, wire) {
            ctx.beginPath();
            ctx.strokeStyle = (wire?.value) ? "green" : "gray";
            ctx.moveTo(...pin.attach);
            ctx.lineTo(...pin.tip);
            if (!wire || wire.destinations.length == 0) ctx.arc(pin.tip.x, pin.tip.y, 4, 0, Math.PI * 2);
            ctx.stroke();
        }
        
        // Pins
        ctx.lineWidth = 3 * this.size.x / 100;
        ctx.lineCap = "round";
        for (let i = 0; i < this.block.n_in; i++) {
            const pin = this.pinAt(0, i);
            drawPin(pin, this.block.inputs[i]);
        }
        for (let i = 0; i < this.block.n_out; i++) {
            const pin = this.pinAt(1, i);
            drawPin(pin, this.block.outputs[i]);
        }
        ctx.strokeStyle = "black";

        // Main body
        if (rc.hovered == this) { // Hovered // TODO: better shadow optimisation
            ctx.shadowColor = "gray";
            ctx.shadowBlur = 10 / rc.posScale;
        }
        if (rc.captured == this || rc.selecteds.includes(this)) { // Selected
            ctx.shadowColor = "black";
            ctx.shadowBlur = 5 / rc.posScale;
        }

        ctx.beginPath();
        if (!this.hasImg) {
            ctx.strokeRect(this.x, this.y, this.size.x, this.size.y);
        } else {
            ctx.drawImage(this.img, this.x, this.y, ...this.size);
        }
        ctx.shadowBlur = 0;
        
        // Custom
        if (this.customDraw) this.customDraw(rc, this);
        ctx.restore();
    }

    /**
     * @param {number} px canvas coordinates
     * @param {number} py canvas coordinates
     * @returns {boolean}
     */
    contains(px, py) {
        const [w, h] = this.size;
        const lx = Math.floor(px - this.x);
        const ly = Math.floor(py - this.y);
        if (lx < 0 || ly < 0 || lx >= w || ly >= h) return false;

        const mask = HitMaskCache.get(this.img, w, h);
        return mask === null ? true : mask[ly * w + lx] === 1;
    }


    /**
     * @param {MouseEvent} e 
     * @param {Vec2} pos 
     * @param {CircuitGUI} circuit
     * @returns {boolean}
     */
    handleMouseEvent(e, pos, circuit) {
        const hovered = circuit.hovered == this;
        const captured = circuit.captured == this;
        const selected = circuit.selecteds.includes(this);
        switch (e.type) {
            case "mousedown":
                if (!hovered) return false;
                // circuit.deltaPos = [pos[0] - this.x, pos[1] - this.y];
                // circuit.deltaPos = 
                circuit.isDragging = true;
                if (!selected) circuit.selecteds = [this];
                return true;

            case "mousemove":
                if (!circuit.isDragging) return false;
                // this.x = pos[0] - circuit.deltaPos[0];
                // this.y = pos[1] - circuit.deltaPos[1];
                // this.pos.iadd(circuit.deltaPos);
                return true;

            case "mouseup":
                if (!circuit.isDragging) return false;
                circuit.isDragging = false;
                return true;
        }
        return false;
    }

    toJSON() {
        return {
            block_id: this.block.id,
            pos: this.pos
        };
    }
}

// MARK: WireGUI
class WireGUI {

    /** @type {Path2D} */
    #path;

    /** @type {Wire} */
    wire;
    /** @type {PortGUI} */
    source;
    /** @type {PortGUI} */
    destination;

    /**
     * 
     * @param {Wire} wire 
     * @param {PortGUI} source 
     * @param {PortGUI} destination
     */
    constructor(wire, source, destination) {
        this.#path = new Path2D();
        this.wire = wire;
        this.source = source;
        this.destination = destination
    }

    get value() { return this.wire.value; }

    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} px canvas coordinates
     * @param {number} py canvas coordinates
     * @returns {boolean}
     */
    contains(ctx, px, py) {
        return ctx.isPointInPath(this.#path, px, py);
    }

    /** 
     * @param {RenderingDrawContext} rc
     */
    draw(rc) {
        if (!this.source) return

        const ctx = rc.ctx;
        ctx.save();

        this.#path = new Path2D();
        const startPos = this.source[0].pinAt(1, this.source[1]);
        const destPos = this.destination[0].pinAt(0, this.destination[1]);
        const dx = Math.max((destPos.tip.x - startPos.tip.x) / 2, 10);
        this.#path.moveTo(...startPos.tip);
        this.#path.bezierCurveTo(startPos.tip.x + dx, startPos.tip.y, destPos.tip.x - dx, destPos.tip.y, destPos.tip.x, destPos.tip.y);

        // Main body
        if (rc.hovered == this) { // Hovered // TODO: better shadow optimisation
            ctx.shadowColor = "gray";
            ctx.shadowBlur = 5 / rc.posScale;
        }
        if (rc.captured == this || rc.selecteds.includes(this)) { // Selected
            ctx.shadowColor = "black";
            ctx.shadowBlur = 3 / rc.posScale;
        }
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.strokeStyle = this.value ? "green" : "gray";
        ctx.stroke(this.#path);
        ctx.restore();
    }

    /**
     * @param {MouseEvent} e 
     * @param {Vec2} pos 
     * @param {CircuitGUI} circuit
     * @returns {boolean}
     */
    handleMouseEvent(e, pos, circuit) {
        switch (e.type) {
            case "mousedown":
                
                break;
        
            case "mousemove":

                break;

            case "mouseup":

                break;
            default:
                break;
        }
        return false;
    }

    toJSON() {
        return {
            src: [this.source[0].block.id, this.source[1]],
            dst: [this.destination[0].block.id, this.destination[1]]
        };
    }
}

// MARK: CircuitGUI
class CircuitGUI {

    /** @type {string} */
    name;
    /** @type {RenderingDrawContext} */
    context;
    /** @type {HTMLCanvasElement} */
    canvas;
    /** @type {CanvasRenderingContext2D} */
    ctx;
    /** @type {Vec2} */
    posDelta;
    /** @type {number} */
    posScale;

    /** @type {UIElement[]} */
    selecteds;
    /** @type {UIElement | null} */
    captured;
    /** @type {UIElement | null} */
    hovered;
    /** @type {boolean} */
    isDragging;
    /** @type {boolean} */
    isSelecting;
    /** @type {Vec2} */
    firstMousePos;
    /** @type {Vec2} */
    lastMousePos;

    /** @type {number} */
    tickRate;
    /** @type {number} */
    maxTicksPerFrame;
    /** @type {boolean} */
    running;
    /** @type {boolean} */
    pause;

    /** @type {number} */
    last;
    /** @type {number} */
    acc;
    /** @type {number} */
    rafId;

    
    /** @type {BlockGUI[]} */
    blocks;
    /** @type {WireGUI[]} */
    wires;
    /** @type {Circuit} */
    circuit;


    /**
     * @param {Circuit} circuit 
     * @param {CanvasRenderingContext2D} ctx
     * @param {Circuit} circuit
     * @param {BlockGUI[] | null} blocks
     */
    constructor(canvas, ctx, circuit, blocks=null) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.posDelta = new Vec2(0, 0);
        this.posScale = 1.0;

        this.hovered = null;
        this.captured = null;
        this.selecteds = [];
        this.isDragging = false;
        this.isSelecting = false;

        this.lastMousePos = new Vec2(0, 0);
        this.firstMousePos = new Vec2(0, 0);

        this.context = new RenderingDrawContext(this.canvas, this.ctx, this.posDelta, this.posScale, this.selecteds, this.captured, this.hovered);

        this.tickRate = 2;
        this.maxTicksPerFrame = 60;
        this.running = false;
        this.pause = true;

        this.last = 0;
        this.acc = 0;
        this.rafId = 0;

        this.wires = [];
        this.blocks = blocks ?? [];
        this.circuit = circuit;

        this.bindEvents();
    }

    get center() { return this.posDelta.add(new Vec2(this.canvas.width, this.canvas.height)); }

    /**
     * @param {MouseEvent} e 
     * @returns {[number, number]}
     */
    getRelativePos(e) {
        var x, y;
        x = e.clientX - this.canvas.getBoundingClientRect().left;
        y = e.clientY - this.canvas.getBoundingClientRect().top;

        return [x, y];
    }

    /**
     * @param {number} x 
     * @param {number} y 
     * @returns {[number, number]}
     */
    computeAbsolutePos(x, y) {
        return [x + this.posDelta[0], y + this.posDelta[1]];
    }

    /**
     * @param {MouseEvent} e 
     * @returns {[number, number]}
     */
    getAbsolutePos(e) {
        return this.computeAbsolutePos(...this.getRelativePos(e));
    }

    /**
     * @param {Block} src 
     * @param {number} src_port 
     * @param {Block} dst 
     * @param {number} dst_port 
     * @returns {Wire}
     */
    connect(src, src_port, dst, dst_port) {
        return this.circuit.connect(src, src_port, dst, dst_port);
    }

    /**
     * @param {BlockGUI} src 
     * @param {number} src_port 
     * @param {BlockGUI} dst 
     * @param {number} dst_port 
     * @return {WireGUI}
     */
    connectGUI(src, src_port, dst, dst_port) {
        const wire = this.connect(src.block, src_port, dst.block, dst_port);
        const wireGUI = new WireGUI(wire, [src, src_port], [dst, dst_port]);
        this.wires.push(wireGUI);

        return wireGUI;
    }

    /**
     * @param {string} name 
     * @param {[number, number]} pos 
     * @returns {BlockGUI}
     */
    addGate(name, pos = [0, 0]) {
        const block = new Block(GATES[name]);
        this.circuit.add(block);
        return this.addBlock(block, pos);
    }

    /**
     * @param {Block} block 
     * @param {[number, number]} pos 
     * @returns {BlockGUI}
     */
    addBlock(block, pos=[0, 0]) {
        const blockGui = new BlockGUI(block, pos);
        return this.addBlockGUI(blockGui);
    }

    /**
     * @param {BlockGUI} blockGUI
     * @returns {BlockGUI}
     */
    addBlockGUI(blockGUI) {
        this.blocks.push(blockGUI);
        return blockGUI;
    }

    /**
     * @param {string} id 
     * @return {BlockGUI}
     */
    getBlockGUI(id) {
        return this.blocks.find((b) => (b.block.id == id));
    }

    bindEvents() {
        this.canvas.addEventListener("mousedown", (e) => this.handleMouseEvent(e));
        window.addEventListener("mousemove", (e) => this.handleMouseEvent(e));
        window.addEventListener("mouseup", (e) => this.handleMouseEvent(e));
        // this.canvas.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
    }

    /**
     * @param {MouseEvent} e 
     * @param {[number, number]} pos 
     */
    handleBackground(e, pos) {
        // this.lastMousePos = new Vec2(...pos);
        switch (e.type) {
            case "mousedown":
                // this.firstMousePos = new Vec2(...pos);
                this.isSelecting = true;
                break;
        
            case "mousemove":
                if (!this.isSelecting) break;

                this.selecteds = [];
                for (const block of this.blocks) if (inInterval(block.center.x, this.firstMousePos.x, this.lastMousePos.x) && inInterval(block.center.y, this.firstMousePos.y, this.lastMousePos.y)) this.selecteds.push(block);
                break;

            case "mouseup":
                this.isSelecting = false;
                if (this.firstMousePos.equals(this.lastMousePos)) this.selecteds = [];
                break;

            default:
                break;
        }
        
    }

    /** @param {MouseEvent} e */
    handleMouseEvent(e) {
        const pos = new Vec2(...this.getAbsolutePos(e));

        if (e.type == "mousedown") this.firstMousePos = pos.clone();
        if (e.type == "mousemove") this.deltaPos = pos.sub(this.lastMousePos);
        // if (e.type == "mouseup") this.firstMousePos = pos.clone();
        this.lastMousePos = pos.clone();

        if (this.captured) {
            const events = this.selecteds.map((b) => (b.handleMouseEvent(e, pos, this)));
            if (events.some((e) => (e))) { // if any block is dragged
                if (this.isDragging) {
                    for (const block of this.selecteds) {
                        block.pos.iadd(this.deltaPos);
                    }
                }
                
            } else { // the block is not part of selecteds
                this.selecteds = [this.captured];
                this.captured.handleMouseEvent(e, pos, this);
            }
            
            if (e.type === "mouseup") this.captured = null;
            this.context.hovered = this.hovered;
            this.context.captured = this.captured;
            this.context.selecteds = this.selecteds;
            return;
        }

        // top first
        this.hovered = null;
        this.context.hovered = null;
        // Blocks
        for (let i = this.blocks.length - 1; i >= 0; i--) {
            const block = this.blocks[i];
            if (block.contains(...pos)) this.hovered = block;
            this.context.hovered = this.hovered;

            if (!block.handleMouseEvent(e, pos, this) && this.hovered != block) continue;

            if (e.type === "mousedown") {
                this.captured = block;
                this.blocks.push(...this.blocks.splice(i, 1)); // to front
            }
            this.context.captured = this.captured;
            this.context.selecteds = this.selecteds;
            return;
        }

        // Wires
        for (let i = this.wires.length - 1; i >= 0; i--) {
            const wire = this.wires[i];
            if (wire.contains(this.ctx, ...pos)) this.hovered = wire;
            this.context.hovered = this.hovered;

            if (!wire.handleMouseEvent(e, pos, this) && this.hovered != wire) continue;

            if (e.type === "mousedown") {
                this.captured = wire;
                this.wires.push(...this.wires.splice(i, 1)); // to front
            }
            this.context.captured = this.captured;
            this.context.selecteds = this.selecteds;
            return;
        }

        this.handleBackground(e, pos);
        this.context.selecteds = this.selecteds;
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.pause = false;
        this.last = performance.now();
        this.rafId = requestAnimationFrame(this.step);
    }

    stop() {
        this.running = false;
        this.pause = true;
        cancelAnimationFrame(this.rafId);
    }


    step = (now) => {
        if (!this.running) return;
        if (!this.pause) this.update(now);   // simulation
        this.draw();                        //  drawing
        requestAnimationFrame(this.step);
    };

    update(now) {
        const tickMs = 1000 / this.tickRate;
        this.acc += Math.min(now - this.last, 250);
        this.last = now;

        let ticks = 0;
        while (this.acc >= tickMs && ticks < this.maxTicksPerFrame) {
            this.circuit.step();
            this.acc -= tickMs;
            ticks++;
        }
        if (ticks === this.maxTicksPerFrame) this.acc = 0;
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // draw selection
        if (this.isSelecting) {
            ctx.fillStyle = "rgba(195, 228, 247)";
            ctx.strokeStyle = "blue";
            const d = this.lastMousePos.sub(this.firstMousePos);
            this.ctx.fillRect(this.firstMousePos.x, this.firstMousePos.y, d.x, d.y);
            this.ctx.strokeRect(this.firstMousePos.x, this.firstMousePos.y, d.x, d.y);
        }
        for (const wire of this.wires) wire.draw(this.context);
        for (const block of this.blocks) block.draw(this.context);
    }

    toJSON() {
        return {
            version: 1,
            name: this.name,
            circuit: this.circuit.toJSON(),
            wires: this.wires.map((w) => w.toJSON()),
            blocks: this.blocks.map((b) => b.toJSON())
        };
    }

    static fromJSON(canvas, ctx, data) {
        // TODO: make block with dict for faster search
        const circuit = Circuit.fromJSON(data.circuit);
        const gui = new CircuitGUI(canvas, ctx, circuit);
        for (const b of data.blocks) gui.addBlock(circuit.getBlock(b.block_id), [b.pos.x, b.pos.y]);
        for (const w of data.wires) gui.connectGUI(gui.getBlockGUI(w.src[0]), w.src[1], gui.getBlockGUI(w.dst[0]), w.dst[1]);

        return gui;
    }
}