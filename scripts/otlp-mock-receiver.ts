import http from "node:http";

const port = 4318;
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end();
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Mock OTLPSmoke receiver listening on ${port}`);
});

process.on("SIGTERM", () => {
  server.close(() => {
    process.exit(0);
  });
});
