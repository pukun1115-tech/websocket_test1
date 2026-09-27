const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

//ブラウザにテキストを送信する関数
//テキストを送信するとき1バイト目は0x81(=10000001)にする
//送信するフレームの構造
//1バイト目: 
//          FIN(1bit, 最後のフレームなら1) +
//          rsv1(1bit, 0にして問題はない) +
//          rsv2(1bit) +
//          rsv3(1bit) +
//          opcode(4bit, データの種類, 0x1はテキスト)
//
//2バイト目:
//          MASK(1bit, サーバーから送信するデータはマスクしないから0) +
//          payload length(7bit)
//
//3バイト目以降:
//          payload data(送信するデータ)
function sendText(socket, text) {
    const payload = Buffer.from(text, "utf8");

    if (payload.length >= 126) {
        console.error(`126バイト以上のデータは未対応です。\r\n${text}`);
        return;
    }

    //実際に送信するフレーム
    const frame = Buffer.alloc(2 + payload.length);

    frame[0] = 0x81;
    frame[1] = payload.length;

    //payloadをフレームにコピーする(payloadの長さが126バイト未満だからこれでいい)
    payload.copy(frame, 2);

    //送信する
    socket.write(frame);
}


//ブラウザから届いたフレームをテキストにデコードする関数
function decodeTextFrame(frame) {
    if (frame.length < 6) {
        console.log("フレームが短すぎます。");
        return null;
    }

    const firstByte = frame[0];
    const secondByte = frame[1];

    //テキストの,最終フレームか,確認(後で変えないといけない)
    if (firstByte !== 0x81) {
        return null;
    }

    //secondByteの最上位ビットが1(マスクされている)か確認
    //マスクは暗号化ではなく、HTTP通信ではないということを示すため
    const masked = ((secondByte & 0x80) !== 0);//0x80は2進数で10000000
    if (!masked) {
        console.log("ブラウザからのデータがマスクされていません。");
        return null;
    }

    //0x7fは2進数で01111111
    //マスクされているかどうかのビットを除外
    const payloadLength = secondByte & 0x7f;
    if (payloadLength >= 126) {
        console.log("126バイト以上のデータは未対応です。");
        return null;
    }

    //4バイトのマスキングキーを取得する
    const maskingKey = frame.subarray(2, 6);
    //データの長さが126バイト未満だからデータの始まりは6
    const payloadStartIndex = 6;

    //フレーム全体が届いているか
    //後で変えないといけない。なぜなら一度に完全なフレームが届くとは限らないから
    if (frame.length < payloadStartIndex + payloadLength) {
        console.log("データが不完全です。");
        return null;
    }

    //マスクされたデータを取得
    const maskedPayload = frame.subarray(payloadStartIndex, payloadStartIndex + payloadLength);

    //デコードしたあとのデータをいれるバッファ
    const decodedPayload = Buffer.alloc(payloadLength);

    //マスクを外すときはXOR演算をする
    //a XOR b XOR b === aになる。
    //XORは^でやる
    //maskingKey[i % 4] はそういう仕様
    for (let i = 0; i < payloadLength; i++) {
        decodedPayload[i] = maskedPayload[i] ^ maskingKey[i % 4];
    }

    //decodedPayload.toString("utf8")でutf8の文字列に変換
    return decodedPayload.toString("utf8");
}

//受信バッファから完全なwebsocketフレームを1つ取り出す
//戻り値:
//  { frame: buffer, rest: buffer } :{完全なフレーム,残りのフレーム}
//  { frame: null }                 :まだデータが足りない
//  null                            :不正なフレーム
function extractFrame(buffer) {
    if (buffer.length < 2) {
        return { frame: null };
    }

    const firstByte = buffer[0];
    const secondByte = buffer[1];

    if (firstByte !== 0x81) {
        console.log("テキストの最終フレームではありません。");
        return null;
    }

    const masked = ((secondByte & 0x80) !== 0);
    if (!masked) {
        console.log("ブラウザからのデータがマスクされていません。");
        return null;
    }

    const payloadLength = secondByte & 0x7f;
    if (payloadLength >= 126) {
        console.log("126バイト以上のデータは未対応です。");
        return null;
    }

    const frameLength = 2 + 4 + payloadLength;

    if (buffer.length < frameLength) {
        return { frame: null };
    }

    return {
        frame: buffer.subarray(0, frameLength),
        rest: buffer.subarray(frameLength)
    };
}

//http.createServer()の引数の関数はHTTPリクエスト(GETでindex.htmlの取得など)された時に毎回呼ばれる
//http通信ができる
const server = http.createServer((request, response) => {
    //index.htmlに全部書く
    //安全だと思っている
    if (!(request.method === "GET" && (request.url === "/" || request.url === "/index.html"))) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("404 Not Found");
        return;
    }
    const filePath = path.join(__dirname, "public", "index.html");

    //非同期でファイルを読み込む
    fs.readFile(filePath, (error, fileData) => {
        if (error) {
            //500はサーバー側のエラー
            response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
            response.end("index.htmlを読み込めませんでした。");
            return;
        }
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end(fileData);
    });
});

//引数の関数はブラウザからwebsocket接続の要求(あっぷぐれーどする)があったとき呼ばれる
server.on("upgrade", (request, socket, head) => {
    console.log("websocket接続を要求されました。");

    //Node.jsがSec-WebSocket-Keyを全部小文字に自動でする
    const websocketKey = request.headers["sec-websocket-key"];
    //WebSocket接続に必要なキーがないなら接続を切る
    if (!websocketKey) {
        socket.destroy();
        return;
    }

    //websocket仕様で決められている文字列
    const magicString = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    //ブラウザに返すためのSec-WebSocket-Acceptを求める
    const acceptKey = crypto
    .createHash("sha1")
    .update(websocketKey + magicString)
    .digest("base64");
    
    //「通信プロトコルを切り替えます」というレスポンス
    const response = (
        "HTTP/1.1 101 Switching Protocols\r\n" +
        "Upgrade: websocket\r\n" +
        "Connection: Upgrade\r\n" +
        `Sec-WebSocket-Accept: ${acceptKey}\r\n` +
        "\r\n"
    );
    //HTTPヘッダー形式のハンドシェイク-レスポンスを返す
    socket.write(response);
    
    //サーバーのコンソールに出力
    console.log("websocket接続が成功しました。\r\n");
    
    //ブラウザにテキストを送信する
    sendText(socket, "こんにちは。サーバーです。._.");
    
    let receiveBuffer = Buffer.alloc(0);

    function processReceivedData(socket, data) {
        receiveBuffer = Buffer.concat([receiveBuffer, data]);

        while (receiveBuffer.length > 0) {
            const result = extractFrame(receiveBuffer);

            if (result && result.frame === null) {
                return;
            }

            if (result === null) {
                console.log("不正なWebSocketフレームを受信しました。");
                socket.destroy();
                return;
            }

            const { frame, rest } = result;
            receiveBuffer = rest;

            const text = decodeTextFrame(frame);

            if (text === null) {
                console.log("データのデコードに失敗しました。");
                socket.destroy();
                return;
            }

            console.log("ブラウザから受信:", text, "\r\n");

            sendText(socket, `メッセージを受け取りました:\"${text}\"`);
        }
    }

    //ブラウザからデータを受信したときの処理
    //後で変えないといけない。なぜなら一度に完全なフレームが届くとは限らないから
    socket.on("data", (data) => {
        console.log("ブラウザからデータを受け取りました。");
        processReceivedData(socket, data);
    })

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