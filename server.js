const http = require("http");
const fs = require("fs");
const path = require("path");

const mimeTypes = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".png": "image/png",
    ".json": "application/json"
};

const server = http.createServer((request, response) => {
    let filePath;
    if (request.url === "/") {
        filePath = path.join(__dirname, "public", "index.html");
    } else {
        filePath = path.join(__dirname, "public", request.url);
    }
    fs.readFile(filePath, (error, data) => {
        if (error) {
            response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
            return response.end(`${filePath} Not Found`);
        }
        const ext = path.extname(filePath).toLowerCase();
        const contentType = mimeTypes[ext] || "application/octet-stream";
        response.writeHead(200, { "Content-Type": contentType });
        response.end(data);
    });
});

server.listen(3000, () => {
    console.log("Server is running on http://localhost:3000");
});


//---------------
//------追加------
//---------------
const crypto = require("crypto");

//接続している全プレイヤーの情報を管理するオブジェクト
const players = {};
//プレイヤーごとの送信用のソケットを保存する配列
const clients = [];

//WebSocketアップグレード要求されたとき
server.on("upgrade", (request, socket, head) => {
    // 必須のキーを取得
    const acceptKey = request.headers["sec-websocket-key"];
    if (!acceptKey) {
        socket.destroy();
        return;
    }

    // WebSocketの仕様に沿ってレスポンス用のマジック文字列を結合・ハッシュ化
    const hash = crypto
        .createHash("sha1")
        .update(acceptKey + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
        .digest("base64");

    // ハンドシェイク（接続確立）の返答を送信
    socket.write(
        "HTTP/1.1 101 Switching Protocols\r\n" +
        "Upgrade: websocket\r\n" +
        "Connection: Upgrade\r\n" +
        `Sec-WebSocket-Accept: ${hash}\r\n\r\n`
    );

    // 新しいプレイヤーを登録（ランダムなIDと色、初期位置を設定）
    const playerId = Math.random().toString(36).substring(2, 9);
    players[playerId] = { id: playerId, x: 100, y: 100, color: '#' + Math.floor(Math.random()*16777215).toString(16) };
    clients.push({ id: playerId, socket: socket });

    console.log(`Player connected: ${playerId}`);

    // 新規プレイヤーに初期状態を、全員に新しいプレイヤー情報を送る
    broadcast({ type: "init", id: playerId, players: players });

    // データを受信したとき
    socket.on("data", (buffer) => {
        handleRawData(playerId, buffer);
    });

    //切断処理
    socket.on("end", () => {
        handleDisconnect(playerId);
    });
    socket.on("error", () => {
        handleDisconnect(playerId);
    });
});

// 生データ（WebSocketフレーム）を解析して文字を取り出す関数
function handleRawData(playerId, buffer) {
    const firstByte = buffer[0];
    const secondByte = buffer[1];
    
    // テキストデータ（0x81）以外は無視
    if (firstByte !== 129) return; 

    const length = secondByte & 127;
    let maskingKeyIndex = 2;
    if (length === 126) maskingKeyIndex = 4;
    if (length === 127) maskingKeyIndex = 10;

    const maskingKey = buffer.slice(maskingKeyIndex, maskingKeyIndex + 4);
    const dataIndex = maskingKeyIndex + 4;
    const payload = buffer.slice(dataIndex);

    // マスクを解除（ブラウザからのデータは必ず暗号化のマスクがかかっています）
    const decoded = Buffer.alloc(payload.length);
    for (let i = 0; i < payload.length; i++) {
        decoded[i] = payload[i] ^ maskingKey[i % 4];
    }

    try {
        const message = JSON.parse(decoded.toString());
        // プレイヤーの移動メッセージを処理
        if (message.type === 'move') {
            players[playerId].x = message.x;
            players[playerId].y = message.y;
            broadcast({ type: "update", players: players });
        }
    } catch (e) {
        return;
    }
}

//---------------
//------関数------
//---------------

// 全員にデータを送る（ブロードキャスト）関数
function broadcast(data) {
    const jsonStr = JSON.stringify(data);
    const jsonBuffer = Buffer.from(jsonStr);
    const len = jsonBuffer.length;

    // WebSocket送信用フレームの手動構築
    let frame;
    if (len <= 125) {
        frame = Buffer.alloc(2 + len);
        frame[0] = 0x81;
        frame[1] = len;
        jsonBuffer.copy(frame, 2);
    } else if (len >= 126 && len <= 65535) {
        frame = Buffer.alloc(4 + len);
        frame[0] = 0x81;
        frame[1] = 126;
        frame.writeUInt16BE(len, 2);
        jsonBuffer.copy(frame, 4);
    } else {
        return; // 巨大データはスキップ
    }

    // 全員にパケットを送信
    for (const c of clients) {
        try {
            c.socket.write(frame);
        } catch(error) {
            continue;
        }
    }
}

// 切断処理用の関数
function handleDisconnect(playerId) {
    if (players[playerId]) {
        delete players[playerId];
        const index = clients.findIndex(c => (c.id === playerId));
        if (index !== -1) {
            clients.splice(index, 1);
        }
        console.log(`Player disconnected: ${playerId}`);
        broadcast({ type: "remove", id: playerId });
    }
}


