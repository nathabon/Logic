// MARK: Canvas
/** @type {HTMLCanvasElement} */
var canva;
/** @type {CanvasRenderingContext2D} */
var ctx;
/** @type {Circuit} */
var c;
/** @type {CircuitGUI} */
var gui;

function bindCanvas() {
    canva = document.getElementById('mainCanva');
    if (!canva.getContext) {
        console.log("Could not get context");
        return;
    }
    ctx = canva.getContext("2d");

    c = new Circuit();

    // var s1 = new Clock("s1", 2);
    // var s2 = new Source("s2", true);

    // var _or = new Block(OR, "or");
    // var _and = new Block(AND, "and");
    // var _or2 = new Block(OR, "or");

    // s1 = c.add(s1);
    // s2 = c.add(s2);
    // _and = c.add(_and);
    // _or = c.add(_or);
    // _or2 = c.add(_or2)

    gui = new CircuitGUI(canva, ctx, c);

    // const s1G = gui.addBlock(s1);
    // const s2G = gui.addBlock(s2);
    // const andG = gui.addBlock(_and);
    // const orG = gui.addBlock(_or);
    // const or2G = gui.addBlock(_or2);

    // gui.connectGUI(s1G, 0, andG, 0);
    // gui.connectGUI(s2G, 0, andG, 1);
    // gui.connectGUI(s1G, 0, orG, 0);
    // const w = gui.connectGUI(s2G, 0, orG, 1);
    // gui.connectGUI(orG, 0, or2G, 0);
    // gui.connectGUI(andG, 0, or2G, 1);
}


// MARK: Left toolbar
const gateSelectors = document.getElementsByClassName("gate-selector");


function addGate(gate) {
    const id = gate.id;
    gui.addGate(id);
}

function bindLeftToolbar() {
    for (const gate of gateSelectors) gate.addEventListener('click', () => addGate(gate));
}

// MARK: Top toolbar
const startStopButton = document.getElementById('startPauseButton');
const stepButton = document.getElementById('stepButton');
const speedRange = document.getElementById('speedSelect');
const speedValue = document.getElementById('speedValue');

const exportButton = document.getElementById('exportButton');
const importButton = document.getElementById('importButton');


function startPause() {
    gui.pause = !gui.pause;
    if (gui.pause) {
        startStopButton.innerText = "Start";
    } else {
        startStopButton.innerText = "Stop";
    }
}

function step() {
    gui.pause = true;
    startStopButton.innerText = "Start";
    gui.circuit.step();
}

function speedRangeSelect(e) {
    const value = speedRange.value;
    gui.tickRate = value;
    speedValue.innerText = value;
}

function exportJSON() {
    const data = gui.toJSON();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "logic.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function importJSON(event) {
    const file = event.target.files[0];

    // Validate file existence and type
    if (!file) {
        alert("No file selected. Please choose a file.");
        return;
    }

    if (file.type != 'application/json') {
        alert("Unsupported file type. Please select a .json file.");
        return;
    }

    // Read the file
    const reader = new FileReader();
    reader.onload = async () => {
        try {
            const data = JSON.parse(reader.result);
            gui = CircuitGUI.fromJSON(canva, ctx, data);
        } catch (error) {
            alert("An error occured while opening the file : " + error);
            console.error(error);
        }

        await SpriteCache.ready();

        gui.start();
    };
    reader.onerror = () => {
        alert("Error reading the file. Please try again.");
    };
    reader.readAsText(file);
}

function bindTopToolbar() {
    startStopButton.addEventListener('click', startPause);
    stepButton.addEventListener('click', step);
    speedRange.onchange = speedRangeSelect;

    exportButton.addEventListener('click', exportJSON);
    importButton.addEventListener('change', importJSON);
}


window.addEventListener('load', main);


async function start() {
    await SpriteCache.ready();
    gui.start();
}

async function main() {
    bindCanvas();
    bindLeftToolbar();
    bindTopToolbar();

    await start();
}
