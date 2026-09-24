const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

let ws = null;
let myId = null;
let players = {};

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const keys = {};

function connect() {
    ws = new WebSocket("ws://localhost:3000");

    ws.addEventListener("message", (event) => {
        try {
            const message = JSON.parse(event.data);

            if (message.type === "init") {
                myId = message.id;
                players = message.players;
            } else if (message.type === "update") {
                players = message.players;
            } else if (message.type === "remove") {
                delete players[message.id];
            }
        } catch (error) {
            console.error("メッセージ解析エラー:", error);
        }
    });

    ws.addEventListener("close", () => {
        console.log("接続が切れました");
        myId = null;
        players = {};
        setTimeout(connect, 1000);
    });

    ws.addEventListener("error", (error) => {
        console.error("WebSocketエラー:", error);
    });
}


window.addEventListener("keydown", (event) => {
    keys[event.code] = true;
});

window.addEventListener("keyup", (event) => {
    keys[event.code] = false;
});

window.addEventListener("resize", () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

function update() {
    if (!myId || !players[myId]) return;

    let moveX = 0;
    let moveY = 0;

    if (keys["ArrowLeft"] || keys["KeyA"]) moveX -= 1;
    if (keys["ArrowRight"] || keys["KeyD"]) moveX += 1;
    if (keys["ArrowUp"] || keys["KeyW"]) moveY -= 1;
    if (keys["ArrowDown"] || keys["KeyS"]) moveY += 1;

    if (moveX !== 0 || moveY !== 0) {
        // || 0なのはMath.hypot(moveX, moveY)が0のとき0除算を防ぐため
        const length = Math.hypot(moveX, moveY) || 1;

        //ws.readyStateがWebSocket.OPENのときのみ送信
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "move", x: players[myId].x + (moveX / length) * 3, y: players[myId].y + (moveY / length) * 3 }));
        }
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }

    for (const id in players) {
        const p = players[id];
        const drawX = p.x;
        const drawY = p.y;

        ctx.fillStyle = p.color || "rgba(255, 255, 255, 1)";
        ctx.fillRect(drawX, drawY, 40, 40);
    }
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

connect();
gameLoop();
