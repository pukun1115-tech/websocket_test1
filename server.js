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
