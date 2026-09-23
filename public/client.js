const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const player = {
    x: 100,
    y: 100,
    width: 40,
    height: 40,
    speed: 3,
    color: "rgba(0,255,0,1)"
};

const keys = {};

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
    let moveX = 0;
    let moveY = 0;

    if (keys["ArrowLeft"] || keys["KeyA"]) moveX -= 1;
    if (keys["ArrowRight"] || keys["KeyD"]) moveX += 1;
    if (keys["ArrowUp"] || keys["KeyW"]) moveY -= 1;
    if (keys["ArrowDown"] || keys["KeyS"]) moveY += 1;

    if (moveX !== 0 || moveY !== 0) {
        const length = Math.hypot(moveX, moveY) || 1;
        player.x += (moveX / length) * player.speed;
        player.y += (moveY / length) * player.speed;
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

    ctx.fillStyle = player.color;
    ctx.fillRect(player.x, player.y, player.width, player.height);
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

gameLoop();