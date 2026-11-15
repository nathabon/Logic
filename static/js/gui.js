/** @typedef {[BlockGUI, number]} PortGUI */
/** @typedef {{tip: [number, number], attach: [number, number]}} _Pin */
/** @typedef {{tip: Vec2, attach: Vec2}} Pin */
/** @typedef {BlockGUI | WireGUI} UIElement */

/**
 * 
 * @param {number} n 
 * @param {number} a
 * @param {number} b
 * @returns 
 */
function inInterval(n, a, b) {
    if (a > b) return inInterval(n, b, a);
    return a <= n && n <= b;
}

class NotImplementedError extends Error {
    /** @param {string} message */
    constructor(message) {
        super(message);
        this.name = "NotImplementedError";
    }
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

    /**
     * @param {HTMLCanvasElement} canvas 
     * @param {CanvasRenderingContext2D} ctx 
     * @param {Vec2} posDelta 
     * @param {number} posScale 
     */
    constructor(canvas, ctx, posDelta, posScale) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.posDelta = posDelta;
        this.posScale = posScale;
    }
}


// MARK: GUIElement
class GUIElement {

    /** @type {Vec2} */
    static DEFAULT_SIZE = new Vec2(100, 100);

    /** @type {string} */
    idPrefix = '';
    /** @type {string} */
    id;
    /** @type {Vec2} */
    pos;
    /** @type {Vec2} */
    size;
    /** @type {number} */
    rotation;

    /** @type {boolean} */
    isHovered;
    /** @type {boolean} */
    isCaptured;
    /** @type {boolean} */
    isSelected;

    /**
     * @param {Vec2} [pos]
     * @param {Vec2} [size]
     * @param {number} rotation
     */
    constructor(pos = new Vec2(0, 0), size = GUIElement.DEFAULT_SIZE, rotation = 0.0) {
        this.id = this.idPrefix + '0';
        this.pos = pos;
        this.size = size;
        this.rotation = rotation;

        this.isHovered = false;
        this.isCaptured = false;
        this.isSelected = false;
    }

    get x() { return this.pos[0]; }
    set x(v) { this.pos[0] = v; }
    get y() { return this.pos[1]; }
    set y(v) { this.pos[1] = v; }
    get center() { return this.pos.add(this.size.scale(0.5)); }


    /** 
     * @protected
     * @param {RenderingDrawContext} rc */
    drawContent(rc) { throw new NotImplementedError('This is the Parent class Please use the Child class.'); }

    /** @param {RenderingDrawContext} rc */
    draw(rc) { 
        const ctx = rc.ctx;
        ctx.save();

        ctx.shadowBlur = 0;
        // Main body
        if (this.isHovered) { // Hovered // TODO: better shadow optimisation
            ctx.shadowColor = "gray";
            ctx.shadowBlur = 5 / rc.posScale;
        }
        if (this.isSelected) { // Selected
            ctx.shadowColor = "black";
            ctx.shadowBlur = 3 / rc.posScale;
        }

        this.drawContent(rc);

        ctx.restore();
    }

    /**
     * @param {Vec2} pos
     * @param {number} tolerance
     * @returns {boolean}
     */
    contains(pos, tolerance = 8) { 
        const [w, h] = this.size;
        const lx = Math.floor(pos.x - this.x);
        const ly = Math.floor(pos.y - this.y);
        
        if (lx < -tolerance || ly < -tolerance || lx >= w + tolerance || ly >= h + tolerance) return false;
        return true;
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
                if (!this.isHovered) return false;
                circuit.isDragging = true;
                if (!this.isSelected) circuit.setSelectedElements([this]);

                return true;

            case "mousemove":
                if (!circuit.isDragging) return false;
                
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
            id: this.id,
            pos: this.pos, 
            size: this.size,
            rotation: this.rotation
        }
     }
    
    /**
     * @param {CircuitGUI} circuitGui 
     * @param {Circuit} circuit 
     * @param {any} data 
     * @returns {GUIElement}
     */
    static fromJSON(circuitGui, circuit, data) { 
        /** @type {GUIElement} */
        var block;
        switch (data.type) {
            case "BlockGUI":
                block = BlockGUI.fromJSON(circuitGui, circuit, data);
                break;

            case "WireGUI":
                block = WireGUI.fromJSON(circuitGui, circuit, data);
                break;

            default:
                throw new Error('GUIElement type (' + data.type + ') not accepted');
        }

        block.id = data.id;
        block.pos = Vec2.from(data.pos);
        block.size = Vec2.from(data.size);
        block.rotation = data.rotation;

        return block;
    }
}

//MARK: BlockGUI
class BlockGUI extends GUIElement {
    
    /** @type {Record<string, [_Pin[], _Pin[]]>} */
    static PINS_POSITION = { // TODO: better pin management
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

    /** @type {Partial<Record<string, (ctx: RenderingDrawContext, gui: BlockGUI) => void>>} */
    static CUSTOM_DRAW = {
        // 'source': (rc, block) => {
        //     rc.ctx.font = "48px serif";
        //     rc.ctx.fillText("Test", block.x, block.y);
        // }
    }

    /** @type {Block} */
    block;
    /** @type {[Pin[], Pin[]]} */
    pinsPos;
    /** @type {HTMLImageElement} */
    img;
    /** @type {((ctx: RenderingDrawContext, gui: BlockGUI) => void) | null} */
    customDraw;

    /**
     * @param {Block} block
     * @param {Vec2} [pos]
     * @param {Vec2} [size]
     * @param {number} rotation
     */
    constructor(block, pos = new Vec2(0, 0), size = GUIElement.DEFAULT_SIZE, rotation=0.0) {
        super(pos, size, rotation);

        this.idPrefix = block.kind.name;
        this.id = block.id;
        this.block = block;
        this.img = SpriteCache.get(`static/images/gates/${block.kind.name}_body.svg`, this.size[0], this.size[1]); // TODO: add EU / US gates
        
        this.pinsPos = BlockGUI.PINS_POSITION[this.kind] ?? BlockGUI.genericPins(block.n_in, block.n_out);

        this.customDraw = BlockGUI.CUSTOM_DRAW[this.kind];
    }

    get kind() { return this.block.kind.name; }
    get hasImg() { return this.img.complete && this.img.naturalWidth > 0; }

    /**
     * @param {number} nIn
     * @param {number} nOut
     * @returns {[Pin[], Pin[]]}
     */
    static genericPins(nIn, nOut) {
        const side = (/** @type {number} */ n, /** @type {number} */ tipX, /** @type {number} */ attachX) =>
            Array.from({ length: n }, (_, i) => {
                const y = (i + 1) / (n + 1);
                return { tip: ([tipX, y]), attach: ([attachX, y]) };
            });

        return [side(nIn, -0.1, 0), side(nOut, 1.1, 1)];
    }
    
    /**
     * @param {number} i 
     * @param {number} j 
     * @returns {{tip: Vec2, attach: Vec2}}
     */
    pinAt(i, j) {
        const pin = this.pinsPos[i][j];

        const x = pin.tip[0] * this.size.x + this.x;
        const y = pin.tip[1] * this.size.y + this.y;

        const _x = pin.attach[0] * this.size.x + this.x;
        const _y = pin.attach[1] * this.size.y + this.y;

        return {tip: new Vec2(x, y), attach: new Vec2(_x, _y)};
    }

    /**
     * @param {Vec2} pos
     * @returns {[number, number] | null}
     */
    pinContains(pos) {
        for (let i = 0; i < this.block.n_in; i++) if (this.pinAt(0, i).tip.distanceTo(pos) <= 10 && !this.block.inputs[i]) return [0, i];
        for (let i = 0; i < this.block.n_out; i++) if (this.pinAt(1, i).tip.distanceTo(pos) <= 10) return [1, i];
        return null;
    }

    /** 
     * @protected
     * @param {RenderingDrawContext} rc 
     */
    drawContent(rc) {
        const ctx = rc.ctx;

        /**
         * @param {Pin} pin 
         * @param {Wire | null} wire 
         * @param {number} i
         */
        function drawPin(pin, wire, i) {
            ctx.beginPath();
            ctx.strokeStyle = (wire?.value) ? "green" : "gray";
            ctx.fillStyle = (wire?.value) ? "green" : "gray";
            ctx.moveTo(pin.attach.x, pin.attach.y);
            ctx.lineTo(pin.tip.x, pin.tip.y);
            ctx.stroke();
            if (i || !wire) {
                ctx.arc(pin.tip.x, pin.tip.y, 4, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Pins
        ctx.lineWidth = 3 * this.size.x / 100;
        ctx.lineCap = "round";
        for (let i = 0; i < this.block.n_in; i++) {
            const pin = this.pinAt(0, i);
            drawPin(pin, this.block.inputs[i], 0);
        }
        for (let i = 0; i < this.block.n_out; i++) {
            const pin = this.pinAt(1, i);
            drawPin(pin, this.block.outputs[i], 1);
        }
        ctx.strokeStyle = "black";

        ctx.beginPath();
        if (!this.hasImg) {
            ctx.strokeRect(this.x, this.y, this.size.x, this.size.y);
        } else {
            ctx.drawImage(this.img, this.x, this.y, this.size.x, this.size.y);
        }

        // Custom
        if (this.customDraw) this.customDraw(rc, this);
    }

    /**
     * @param {Vec2} pos
     * @param {number} tolerance
     * @returns {boolean}
     */
    contains(pos, tolerance = 8) {
        const [w, h] = this.size;
        const lx = Math.floor(pos.x - this.x);
        const ly = Math.floor(pos.y - this.y);
        if (lx < -tolerance || ly < -tolerance || lx >= w + tolerance || ly >= h + tolerance) return false;

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
        switch (e.type) {
            case "mousedown":
                const pin = this.pinContains(pos);
                if (pin) {
                    const [p, i] = pin;
                    circuit.isWiring = true;
                    const b = new BlockGUI(new Block(DELAY), pos, Vec2.ZERO) // doesn't matter, only placehover // TODO: change to invisible block
                    b.type = "Invisible";
                    const wire = p ? this.block.outputs[i] : new Wire(false, null, [[this.block, i]]);
                    const wireGui = p ? new WireGUI(wire, [this, i], [b, 0]) : new WireGUI(wire, [b, 0], [this, i]);
                    circuit.draggingWire = wireGui;
                    circuit.wirePort = [this, p, i];

                    return true;
                }
                break;

            case "mousemove":
                if (!circuit.isDragging) break;
                return true;

            case "mouseup":
                if (circuit.isWiring && circuit.wirePort) {
                    const pin = this.pinContains(pos);
                    if (pin) {
                        const [p, i] = pin;
                        const [_b, _p, _i] = circuit.wirePort;

                        if (p != _p) { // connect both
                            var src;
                            var src_port;
                            var dst;
                            var dst_port;
                            if (!_p) { // the wire is from output
                                src = this;
                                src_port = i;
                                dst = _b;
                                dst_port = _i;
                            } else {
                                src = _b;
                                src_port = _i;
                                dst = this;
                                dst_port = i;
                            }
                            circuit.connectGUI(src, src_port, dst, dst_port);
                            circuit.isWiring = false;
                            circuit.wirePort = null;
                            circuit.draggingWire = null;

                            return true;
                        }
                    }
                }
                break;
        }
        
        return super.handleMouseEvent(e, pos, circuit);
    }

    toJSON() {
        return Object.assign(super.toJSON(), {
            type: 'BlockGUI',
            block_id: this.block.id
        });
    }

    /**
     * @param {CircuitGUI} circuitGui 
     * @param {Circuit} circuit 
     * @param {any} data 
     * @returns {BlockGUI}
     */
    static fromJSON(circuitGui, circuit, data) {
        const block = circuit.getBlock(data.block_id)
        return new BlockGUI(block, Vec2.from(data.pos), Vec2.from(data.size), data.rotation);
    }
}

// MARK: WireGUI
class WireGUI extends GUIElement{

    static #scratch = /** @type {OffscreenCanvasRenderingContext2D} */ (
        new OffscreenCanvas(1, 1).getContext("2d")
    );

    /** @type {Path2D} */
    #path;

    /** @type {string} */
    idPrefix = 'wire';
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
        super(Vec2.ZERO, Vec2.ZERO, 0);

        this.#path = new Path2D();
        this.wire = wire;
        this.source = source;
        this.destination = destination;
    }

    get src() { return this.source[0]; }
    get src_port() { return this.source[1]; }
    get dst() { return this.destination[0]; }
    get dst_port() { return this.destination[1]; }
    get value() { return this.wire.value; }

    /**
   * @param {Vec2} pos
   * @param {number} [tolerance]
   * @returns {boolean}
   */
    contains(pos, tolerance = 8) {
        const ctx = WireGUI.#scratch;
        ctx.lineWidth = tolerance;
        ctx.lineCap = "round";
        return ctx.isPointInStroke(this.#path, pos.x, pos.y);
    }

    /** 
     * @param {RenderingDrawContext} rc
     */
    drawContent(rc) {
        if (!this.source) return

        const ctx = rc.ctx;

        this.#path = new Path2D();
        const startPos = this.source[0].pinAt(1, this.source[1]);
        const destPos = this.destination[0].pinAt(0, this.destination[1]);
        const dx = Math.max((destPos.tip.x - startPos.tip.x) / 2, 10);
        this.#path.moveTo(startPos.tip.x, startPos.tip.y);
        this.#path.bezierCurveTo(startPos.tip.x + dx, startPos.tip.y, destPos.tip.x - dx, destPos.tip.y, destPos.tip.x, destPos.tip.y);

        // Main body
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.strokeStyle = this.value ? "green" : "gray";
        ctx.stroke(this.#path);
    }

    // /**
    //  * @param {MouseEvent} e 
    //  * @param {Vec2} pos 
    //  * @param {CircuitGUI} circuit
    //  * @returns {boolean}
    //  */
    // handleMouseEvent(e, pos, circuit) {
    //     return false;
    // }

    toJSON() {
        return Object.assign(super.toJSON(), {
            type: 'WireGUI',
            src: [this.source[0].block.id, this.source[1]],
            dst: [this.destination[0].block.id, this.destination[1]]
        });
    }

    /**
     * @param {CircuitGUI} circuitGui 
     * @param {Circuit} circuit 
     * @param {any} data 
     * @returns {WireGUI}
     */
    static fromJSON(circuitGui, circuit, data) {
        const src = circuitGui.getBlockGUI(data.src[0]);
        const dst = circuitGui.getBlockGUI(data.dst[0]);
        // @ts-ignore
        const wire = circuitGui.connect(src.block, data.src[1], dst.block, data.dst[1]);
        // @ts-ignore
        return new WireGUI(wire, [src, data.src[1]], [dst, data.dst[1]]);
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

    /** @type {GUIElement[]} */
    selecteds;
    /** @type {GUIElement | null} */
    captured;
    /** @type {GUIElement | null} */
    hovered;
    /** @type {boolean} */
    isDragging;
    /** @type {boolean} */
    isSelecting;
    /** @type {boolean} */
    isWiring;
    /** @type {WireGUI | null} */
    draggingWire;
    /** @type {[BlockGUI, number, number] | null} */
    wirePort;
    /** @type {Vec2} */
    firstMousePos;
    /** @type {Vec2} */
    lastMousePos;
    /** @type {Vec2} */
    deltaMouse;

    /** @type {number} */
    tickRate;
    /** @type {number} */
    maxTicksPerFrame;
    /** @type {boolean} */
    running;
    /** @type {boolean} */
    pause;
    /** @type {AbortController} */
    abort;

    /** @type {number} */
    last;
    /** @type {number} */
    acc;
    /** @type {number} */
    rafId;

    /** @type {GUIElement[]} */
    guiElements;
    /** @type {Circuit} */
    circuit;


    /**
     * @param {HTMLCanvasElement} canvas 
     * @param {CanvasRenderingContext2D} ctx
     * @param {Circuit} circuit
     */
    constructor(canvas, ctx, circuit) {
        this.name = "untitled";
        this.canvas = canvas;
        this.ctx = ctx;
        this.posDelta = Vec2.ZERO;
        this.posScale = 1.0;

        this.hovered = null;
        this.captured = null;
        this.selecteds = [];
        this.isDragging = false;
        this.isSelecting = false;

        this.isWiring = false;
        this.draggingWire = null;
        this.wirePort = null;

        this.lastMousePos = Vec2.ZERO;
        this.firstMousePos = Vec2.ZERO;
        this.deltaMouse = Vec2.ZERO;

        this.context = new RenderingDrawContext(this.canvas, this.ctx, this.posDelta, this.posScale);

        this.tickRate = 2;
        this.maxTicksPerFrame = 60;
        this.running = false;
        this.pause = true;

        this.last = 0;
        this.acc = 0;
        this.rafId = 0;

        // this.wires = [];
        // this.blocks = blocks ?? [];
        this.guiElements = [];
        this.circuit = circuit;
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
        this.guiElements.push(wireGUI);

        return wireGUI;
    }

    /**
     * @param {GUIElement} block 
     */
    asignId(block) {
        if (block.id != '') return block.id;
        if (block instanceof BlockGUI) {
            const id = this.circuit.asignID(block.block);
            block.id = id;

            return block.id;
        }

        const ids = this.guiElements.filter((b) => b.idPrefix == block.idPrefix);
        const idsN = ids.map((b) => Number(b.id.toLowerCase().replace(b.idPrefix, '')));
        var id = Math.max(...idsN);
        if (id == -Infinity) id = -1;

        block.id = block.idPrefix + (id + 1);

        return block.id;
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
        const blockGui = new BlockGUI(block, new Vec2(...pos));

        return this.addBlockGUI(blockGui);
    }

    /**
     * @param {BlockGUI} blockGUI
     * @returns {BlockGUI}
     */
    addBlockGUI(blockGUI) {
        this.guiElements.push(blockGUI);
        if (blockGUI.id == '') this.asignId(blockGUI);

        return blockGUI;
    }

    /**
     * @param {string} id 
     * @return {GUIElement}
     */
    getBlockGUI(id) {
        // @ts-ignore
        return this.guiElements.find((b) => (b.id == id));
    }

    /**
     * @param {GUIElement | null} gui 
     */
    hoverElement(gui) {
        if (this.hovered) this.hovered.isHovered = false;
        this.hovered = gui;
        if (gui) gui.isHovered = true;
    }

    /**
     * @param {GUIElement | null} gui 
     */
    captureElement(gui) {
        if (this.captured) this.captured.isCaptured = false;
        this.captured = gui;
        if (gui) gui.isCaptured = true;
    }

    /** 
     * @param {GUIElement[]} guis 
     */
    setSelectedElements(guis) {
        for (const gui of this.selecteds) gui.isSelected = false;
        this.selecteds = [...new Set(guis)];
        for (const gui of this.selecteds) gui.isSelected = true;
    }

    /** 
     * @param {GUIElement} gui 
     */
    addSelectedElement(gui) {
        if (this.selecteds.includes(gui)) return;
        gui.isSelected = true;
        this.selecteds = [...this.selecteds, gui];
    }

    /** 
     * @param {GUIElement} gui 
     */
    removeSelectedElement(gui) {
        gui.isSelected = false;
        this.selecteds = this.selecteds.filter((b) => b !== gui);
    }

    clearSelectedElements() {
        for (const gui of this.selecteds) gui.isSelected = false;
        this.selecteds = [];
    }

    bindEvents() {
        this.abort = new AbortController();
        const { signal } = this.abort;

        this.canvas.addEventListener("mousedown", (e) => this.handleMouseEvent(e), { signal });
        window.addEventListener("mousemove", (e) => this.handleMouseEvent(e), { signal });
        window.addEventListener("mouseup", (e) => this.handleMouseEvent(e), { signal });
    }

    /**
     * @param {MouseEvent} e 
     * @param {Vec2} pos 
     */
    handleBackground(e, pos) {
        switch (e.type) {
            case "mousedown":
                this.isSelecting = true;
                break;
        
            case "mousemove":
                if (this.isWiring && this.wirePort && this.draggingWire) {    
                    const b = this.wirePort[1] ? this.draggingWire.dst : this.draggingWire.src;
                    b.pos = pos;
                    break;
                }

                if (!this.isSelecting) break;

                this.clearSelectedElements();
                for (const block of this.guiElements) if (inInterval(block.center.x, this.firstMousePos.x, this.lastMousePos.x) && inInterval(block.center.y, this.firstMousePos.y, this.lastMousePos.y)) this.addSelectedElement(block);
                break;

            case "mouseup":
                this.isSelecting = false;
                if (this.firstMousePos.equals(this.lastMousePos)) {
                    this.clearSelectedElements();
                }
                this.isWiring = false;
                this.wirePort = null;
                this.draggingWire = null;
                break;

            default:
                break;
        }
        
    }

    /** @param {MouseEvent} e */
    handleMouseEvent(e) {
        const pos = new Vec2(...this.getAbsolutePos(e));

        if (e.type == "mousedown") this.firstMousePos = pos.clone();
        if (e.type == "mousemove") this.deltaMouse = pos.sub(this.lastMousePos);
        this.lastMousePos = pos.clone();

        if (this.captured) {
            const events = this.selecteds.map((b) => (b.handleMouseEvent(e, pos, this)));
            if (events.some((e) => (e))) { // if any block is used
                if (this.isDragging) {
                    for (const block of this.selecteds) {
                        block.pos.iadd(this.deltaMouse);
                    }
                } 
                
                return
            } else {
                // if (e.type === "mouseup") 
                this.captureElement(null);
            }
        }

        // top first
        this.hoverElement(null);
        for (let i = this.guiElements.length - 1; i >= 0; i--) {
            const gui = this.guiElements[i];
            if (!this.hovered && gui.contains(pos)) this.hoverElement(gui);

            if (!gui.handleMouseEvent(e, pos, this)) continue;

            if (e.type === "mousedown") {
                this.captureElement(gui);
                this.guiElements.push(...this.guiElements.splice(i, 1));
            }

            return;
        }

        this.handleBackground(e, pos);
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.pause = false;
        this.last = performance.now();
        this.rafId = requestAnimationFrame(this.step);
        this.bindEvents();
    }

    stop() {
        this.running = false;
        this.pause = true;
        cancelAnimationFrame(this.rafId);

        this.abort.abort();

        this.captureElement(null);
        this.hoverElement(null);
        this.clearSelectedElements();
        this.isSelecting = false;
        this.isWiring = false;
        this.wirePort = null;
        this.draggingWire = null;
    }


    step = (/** @type {Number} */ now) => {
        if (!this.running) return;
        if (!this.pause) this.update(now);   // simulation
        this.draw();                        //  drawing
        this.rafId = requestAnimationFrame(this.step);
    };

    /**
     * @param {number} now
     */
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
        for (const wire of this.guiElements) wire.draw(this.context);
        if (this.draggingWire) this.draggingWire.draw(this.context);
    }

    toJSON() {
        return {
            version: 2,
            name: this.name,
            circuit: this.circuit.toJSON(),
            blocks: this.guiElements.map((b) => b.toJSON())
        };
    }

    
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {CanvasRenderingContext2D} ctx
     * @param {{ circuit: { blocks: any; }; name: string; blocks: any; wires: any; }} data
     */
    static _fromJSONv1(canvas, ctx, data) {
        const circuit = Circuit.fromJSON(data.circuit);
        const gui = new CircuitGUI(canvas, ctx, circuit);
        gui.name = data.name;
        for (const b of data.blocks) gui.addBlock(circuit.getBlock(b.block_id), [b.pos.x, b.pos.y]);
        // @ts-ignore
        for (const w of data.wires) gui.connectGUI(gui.getBlockGUI(w.src[0]), w.src[1], gui.getBlockGUI(w.dst[0]), w.dst[1]);

        return gui;
    }

    /**
     * @param {HTMLCanvasElement} canvas
     * @param {CanvasRenderingContext2D} ctx
     * @param {{ circuit: { blocks: any; }; name: string; blocks: any; wires: any; }} data
     */
    static _fromJSONv2(canvas, ctx, data) {
        const order = ["BlockGUI", "WireGUI"];
        // TODO: make block with dict for faster search
        const circuit = Circuit.fromJSON(data.circuit);
        const gui = new CircuitGUI(canvas, ctx, circuit);
        gui.name = data.name;
        const blocks = data.blocks;
        blocks.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
        for (const b of blocks) gui.guiElements.push(GUIElement.fromJSON(gui, circuit, b));

        return gui;
    }

    /**
     * @param {HTMLCanvasElement} canvas
     * @param {CanvasRenderingContext2D} ctx
     * @param {{ version: number, circuit: { blocks: any; }; name: string; blocks: any; wires: any; }} data
     */
    static fromJSON(canvas, ctx, data) {
        switch (data.version) {
            case 1:
                return CircuitGUI._fromJSONv1(canvas, ctx, data);

            case 2:
                return CircuitGUI._fromJSONv2(canvas, ctx, data);
        
            default:
                break;
        }
    }
}