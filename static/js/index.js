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
    gui = new CircuitGUI(canva, ctx, c);
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

const circuitSelect = document.getElementById('circuitSelect');
const loadCircuitButton = document.getElementById('loadCircuitButton');
const circuitName = document.getElementById('circuitName');
const saveCircuitButton = document.getElementById('saveCircuitButton');
const deleteCircuitButton = document.getElementById('deleteCircuitButton');
const newCircuitButton = document.getElementById('newCircuitButton');

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

function _listCircuits(names) {
    circuitSelect.children = [];
    for (const name of names) {
        const opt = document.createElement('option');
        opt.value = 'circuit_' + name;
        opt.text = name;

        circuitSelect.add(opt, null);
    }
}

function getCircuits() {
    const namesJSON = window.localStorage.getItem('circuits');
    if (!namesJSON) return [];
    return JSON.parse(namesJSON);
}

function listCircuits() {
    const names = getCircuits();
    _listCircuits(names);
}

async function _loadCircuit(name) {
    const cJSON = window.localStorage.getItem('circuit_'+name);
    if (!cJSON) {
        alert('This circuit does not exist.');
        return false;
    }

    try {
        const data = JSON.parse(cJSON);
        gui = CircuitGUI.fromJSON(canva, ctx, data);
    } catch (error) {
        alert("An error occured while opening the file : " + error);
        console.error(error);
        return false;
    }
    
    await startCircuit();
    return true;
}

async function loadCircuit() {
    var text = circuitSelect.options[circuitSelect.selectedIndex].text;
    await _loadCircuit(text);
}

function _saveCircuit(name) {
    var names = getCircuits();
    if (names.includes(name)) {
        alert("This name is already used. Please use another");
        return;
    }
    names.push(name);
    window.localStorage.setItem('circuits', JSON.stringify(names));
    gui.name = name;
    const cJSON = JSON.stringify(gui.toJSON());
    window.localStorage.setItem('circuit_'+name, cJSON);
    window.localStorage.setItem('last_circuit', name);
    listCircuits();
}

function saveCircuit() {
    const name = circuitName.value;
    _saveCircuit(name);
}

function _deleteCircuit(name) {
    const names = getCircuits();
    const newNames = names.filter((n) => (n != name));
    window.localStorage.setItem('circuits', JSON.stringify(newNames));
    window.localStorage.removeItem('circuit_'+name);
    newCircuit();
    listCircuits();
}

function deleteCircuit() {
    _deleteCircuit(gui.name);
}

function newCircuit() {
    bindCanvas();
    startCircuit();
}

function getLastCircuit() {
    const lastName = window.localStorage.getItem('last_circuit');
    if (!lastName || lastName == '') return;
    if (!_loadCircuit(lastName)) { // last circuit is not here
        window.localStorage.setItem('last_circuit', ''); 
        _deleteCircuit(lastName);
    }
}


function exportJSON() {
    const data = gui.toJSON();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "logic_" + gui.name + ".json";
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
        await startCircuit();
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

    listCircuits();
    loadCircuitButton.addEventListener('click', loadCircuit);
    saveCircuitButton.addEventListener('click', saveCircuit);
    newCircuitButton.addEventListener('click', newCircuit);
    deleteCircuitButton.addEventListener('click', deleteCircuit)

    exportButton.addEventListener('click', exportJSON);
    importButton.addEventListener('change', importJSON);
}


window.addEventListener('load', main);


async function startCircuit() {
    circuitName.value = gui.name;

    await SpriteCache.ready();
    gui.start();
}

async function main() {
    bindCanvas();
    bindLeftToolbar();
    await bindTopToolbar();

    await startCircuit();

    getLastCircuit();
}
