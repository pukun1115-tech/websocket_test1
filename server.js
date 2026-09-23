const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((requst, response) => {
    if (request.url === "/" || requst.url === "/index.html") {
        fs.readFile(path.join(__dirname, "index.html"), (error, data) => {
            if (error) {
                response.writeHead(500);
                return response.end("Error loading index.html");
            }
            response.writeHead(200, { "Content-Type": "text/html" });
            response.end(data);
        })
    } else {
        response.writeHead(404);
        response.end("Not Found");
    }
});

server.listen(3000, () => {
    console.log("Server is running on http://localhost:3000");
});