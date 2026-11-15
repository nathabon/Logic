class Vec2 {
    static ZERO = new Vec2(0, 0);
    
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    /**
     * 
     * @param {{ x: number, y: number }} param0 
     * @returns {Vec2}
     */
    static from({ x, y }) { return new Vec2(x, y); }

    get 0() { return this.x; }
    set 0(v) { this.x = v; }
    get 1() { return this.y; }
    set 1(v) { this.y = v; }

    *[Symbol.iterator]() {
        yield this.x;
        yield this.y;
    }

    clone() { return new Vec2(this.x, this.y); }
    /** @param {Vec2} v */
    add(v) { return new Vec2(this.x + v.x, this.y + v.y); }
    /** @param {Vec2} v */
    iadd(v) { this.x += v.x; this.y += v.y; }
    /** @param {Vec2} v */
    sub(v) { return new Vec2(this.x - v.x, this.y - v.y); }
    /** @param {number} k */
    scale(k) { return new Vec2(this.x * k, this.y * k); }
    /** @param {Vec2} v */
    dot(v) { return this.x * v.x + this.y * v.y; }
    lengthSq() { return this.dot(this); }
    length() { return Math.sqrt(this.lengthSq()); }
    /** @param {Vec2} v */
    distanceTo(v) { return this.sub(v).length(); }
    /** @param {Vec2} v */
    equals(v, eps = 1e-9) {
        return Math.abs(this.x - v.x) <= eps && Math.abs(this.y - v.y) <= eps;
    }

    toJSON() { return { x: this.x, y: this.y }; }
}