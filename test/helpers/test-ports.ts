import { createServer } from "node:net";

type TestPorts = {
  appPort: number;
  adminPort: number;
  ocPort: number;
};

async function findFreePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("failed to resolve ephemeral port")));
        return;
      }
      const { port } = address;
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(port);
      });
    });
  });
}

export async function reserveTestPorts(): Promise<TestPorts> {
  const appPort = await findFreePort();
  const adminPort = await findFreePort();
  const ocPort = await findFreePort();
  return { appPort, adminPort, ocPort };
}
