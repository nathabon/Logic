const startStopButton = document.getElementById('startPauseButton');
const stepButton = document.getElementById('stepButton');
const speedRange = document.getElementById('speedSelect');
const speedValue = document.getElementById('speedValue');

const exportButton = document.getElementById('exportButton');
const importButton = document.getElementById('importButton');

var c = new Circuit();

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




const canva = document.getElementById('mainCanva');

window.addEventListener('load', main);

async function main() {
    if (!canva.getContext) {
        console.log("Could not get context");
        return;
    }

    const ctx = canva.getContext("2d");
    var gui = new CircuitGUI(canva, ctx, c);

    startStopButton.addEventListener('click', () => {
        gui.pause = !gui.pause;
        if (gui.pause) {
            startStopButton.innerText = "Start";
        } else {
            startStopButton.innerText = "Stop";
        }
    });

    stepButton.addEventListener('click', () => {
        gui.pause = true;
        startStopButton.innerText = "Start";
        gui.circuit.step();

    });

    speedRange.onchange = (v) => {
        const value = speedRange.value;
        gui.tickRate = value;
        speedValue.innerText = value;
    };

    exportButton.addEventListener('click', () => {
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
    });

    importButton.addEventListener('change', (event) => {
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
            } catch (error){
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
    })

    
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

    await SpriteCache.ready();

    gui.start();
}
