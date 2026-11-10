var c = new Circuit();

var s1 = new Source("s1");
var s2 = new Source("s2", true);

var _or = new Block(OR, "or");
var _and = new Block(AND, "and");
var _or2 = new Block(OR, "or");

s1 = c.add(s1);
s2 = c.add(s2);
_and = c.add(_and);
_or = c.add(_or);
_or2 = c.add(_or2)




const canva = document.getElementById('mainCanva');

window.addEventListener('load', main);

async function main() {
    if (!canva.getContext) {
        console.log("Could not get context");
        return;
    }

    const ctx = canva.getContext("2d");

    var gui = new CircuitGUI(canva, ctx, c);
    const s1G = gui.addBlock(s1);
    const s2G = gui.addBlock(s2);
    const andG = gui.addBlock(_and);
    const orG = gui.addBlock(_or);
    const or2G = gui.addBlock(_or2);

    const w = gui.connectGUI(s1G, 0, andG, 0);
    gui.connectGUI(s2G, 0, andG, 1);
    gui.connectGUI(s1G, 0, orG, 0);
    gui.connectGUI(s2G, 0, orG, 1);
    gui.connectGUI(orG, 0, or2G, 0);
    gui.connectGUI(andG, 0, or2G, 1);

    console.log(gui.wires);
    console.log(gui.blocks);



    await SpriteCache.ready();

    console.log(gui.toJSON());

    gui.start();
}
