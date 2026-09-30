const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/*
let sockets = [];
let players = [];
*/

function sendText(socket, text) {
    const payload = Buffer.from(text, "utf8");
    if (payload.length <= 125) {
        const frame = Buffer.alloc(2 + payload.length);
        frame[0] = 0x81;
        frame[1] = payload.length;
        payload.copy(frame, 2);
        socket.write(frame);
        return undefined;
    }

    if (payload.length <= 65535) {
        const frame = Buffer.alloc(4 + payload.length);
        frame[0] = 0x81;
        frame[1] = 126;
        frame.writeUInt16BE(payload.length, 2);
        payload.copy(frame, 4);
        socket.write(frame);
        return undefined;
    }

    console.error("65536バイト以上のデータには対応していません。");
}

function sendCloseFrame(socket, statusCode = 1000, reason = "") {
    const reasonBuffer = Buffer.from(reason, "utf8");
    if (reasonBuffer.length > 123) {
        console.error("closeフレームのreasonが123バイトを超えています。");
        return undefined;
    }
    const payload = Buffer.alloc(reasonBuffer.length + 2);
    payload.writeUInt16BE(statusCode, 0);
    reasonBuffer.copy(payload, 2);
    const frame = Buffer.alloc(2 + payload.length);
    frame[0] = 0x88;
    frame[1] = payload.length;
    payload.copy(frame, 2);
    socket.write(frame);
}

function decodeTextFrame(frame) {
    const secondByte = frame[1];
    const lengthCode = secondByte & 0x7f;
    let payloadLength;
    let payloadStartIndex;
    if (lengthCode < 126) {
        payloadLength = lengthCode;
        payloadStartIndex = 6;
    } else if (lengthCode === 126) {
        payloadLength = frame.readUInt16BE(2);
        payloadStartIndex = 8;
    } else {
        return null;
    }
    const maskingKeyStartIndex = payloadStartIndex - 4;
    const maskingKey = frame.subarray(maskingKeyStartIndex, maskingKeyStartIndex + 4);
    const maskedPayload = frame.subarray(payloadStartIndex, payloadStartIndex + payloadLength);
    const decodedPayload = Buffer.alloc(payloadLength, 0);
    for (let i = 0; i < payloadLength; i++) {
        decodedPayload[i] = maskedPayload[i] ^ maskingKey[i % 4];
    }
    return decodedPayload.toString("utf8");
}

function extractFrame(buffer) {
    if (buffer.length < 2) {
        return { frame: null, rest: buffer };
    }
    const firstByte = buffer[0];
    const secondByte = buffer[1];

    const fin = ((firstByte & 0x80) !== 0);
    const opcode = firstByte & 0x0f;
    const masked = ((secondByte & 0x80) !== 0);
    const lengthCode = secondByte & 0x7f;

    if (!fin || (opcode !== 0x8 && opcode !== 0x1) || !masked) {
        console.log("不正なWebSocketフレームを受信しました。");
        return null;
    }

    let lengthBytes = 0;

    if (lengthCode === 126) {
        lengthBytes = 2;
    } else if (lengthCode === 127) {
        console.log("65526バイト以上のデータには対応していません。");
        return null;
    }

    const headerLength = 2 + lengthBytes + 4;
    if (buffer.length < headerLength) {
        return { frame: null, rest: buffer };
    }
    const payloadLength = (lengthCode < 126) ? lengthCode : buffer.readUInt16BE(2);
    const frameLength = headerLength + payloadLength;
    if (buffer.length < frameLength) {
        return { frame: null, rest: buffer };
    }
    return {
        frame: buffer.subarray(0, frameLength),
        rest: buffer.subarray(frameLength)
    };
}

//繰り返す
//受信バッファからフレームを取り出して処理する
function processReceivedData(socket, receiveBuffer) {
    while (receiveBuffer.length > 0) {
        const result = extractFrame(receiveBuffer);
        if (result === null) {
            socket.destroy();
            return null;
        }

        const { frame, rest } = result;
        receiveBuffer = rest;
        if (frame === null) {
            return receiveBuffer;
        }

        const opcode = frame[0] & 0x0f;
        if (opcode === 0x8) {
            console.log("ブラウザからcloseフレームを受信しました。");
            sendCloseFrame(socket, 1000, "正常終了");
            socket.end();
            return null;
        }
        if (opcode === 0x1) {
            const text = decodeTextFrame(frame);

            if (text === null) {
                console.log("データのデコードに失敗しました。");
                socket.destroy();
                return null;
            }

            //処理を書く
            console.log("受信:", text);
            /*
            try {
                const obj = JSON.parse(text);
                if (!obj.type) {
                    socket.destroy();
                    return undefined;
                }
                if (obj.type === "init") {
                    //
                } else if (obj.type === "move") {
                    //
                }
            } catch (error) {
                console.error("クライエントが変なものを送ってきました。");
                socket.destroy();
                return undefined;
            }
            */
        }
    }
    return receiveBuffer;
}

const server = http.createServer((request, response) => {
    if (!(request.method === "GET" && (request.url === "/" || request.url === "/index.html"))) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("404 Not Found");
        return undefined;
    }
    const filePath = path.join(__dirname, "public", "index.html");
    fs.readFile(filePath, (error, fileData) => {
        if (error) {
            response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
            response.end("index.htmlを読み込めませんでした。");
            return undefined;
        }
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end(fileData);
    });
});

server.on("upgrade", (request, socket, head) => {
    const websocketKey = request.headers["sec-websocket-key"];
    if (!websocketKey) {
        socket.destroy();
        return undefined;
    }
    const magicString = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    const acceptKey = crypto
        .createHash("sha1")
        .update(websocketKey + magicString)
        .digest("base64");
    const response = (
        "HTTP/1.1 101 Switching Protocols\r\n" +
        "Upgrade: websocket\r\n" +
        "Connection: Upgrade\r\n" +
        `Sec-WebSocket-Accept: ${acceptKey}\r\n` +
        "\r\n"
    );
    socket.write(response);

    let receiveBuffer = Buffer.alloc(0);
    socket.on("data", (data) => {
        if (receiveBuffer === null) {
            return undefined;
        }
        receiveBuffer = Buffer.concat([receiveBuffer, data]);
        receiveBuffer = processReceivedData(socket, receiveBuffer);
    });
    if (head && head.length > 0) {
        if (receiveBuffer === null) {
            return undefined;
        }
        receiveBuffer = Buffer.concat([receiveBuffer, head]);
        receiveBuffer = processReceivedData(socket, receiveBuffer);
    }

    socket.on("end", () => {
        console.log("websocket接続が終了しました。");
    });

    socket.on("close", () => {
        console.log("接続が閉じられました。");
    });

    socket.on("error", (error) => {
        console.log("websocketエラー:", error.message);
    });
});

server.listen(3000, () => {
    console.log("サーバーが起動しました。");
    console.log("http://localhost:3000\r\n");
});
