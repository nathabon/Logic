class Vec2 {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    static from({ x, y }) { return new Vec2(x, y); }

    get 0() { return this.x; }
    set 0(v) { this.x = v; }
    get 1() { return this.y; }
    set 1(v) { this.y = v; }

    // Permet la déstructuration : const [x, y] = v;  et  [...v]
    *[Symbol.iterator]() {
        yield this.x;
        yield this.y;
    }

    clone() { return new Vec2(this.x, this.y); }
    add(v) { return new Vec2(this.x + v.x, this.y + v.y); }
    sub(v) { return new Vec2(this.x - v.x, this.y - v.y); }
    scale(k) { return new Vec2(this.x * k, this.y * k); }
    dot(v) { return this.x * v.x + this.y * v.y; }
    lengthSq() { return this.dot(this); }
    length() { return Math.sqrt(this.lengthSq()); }
    distanceTo(v) { return this.sub(v).length(); }
    equals(v, eps = 1e-9) {
        return Math.abs(this.x - v.x) <= eps && Math.abs(this.y - v.y) <= eps;
    }

    toJSON() { return { x: this.x, y: this.y }; }
}