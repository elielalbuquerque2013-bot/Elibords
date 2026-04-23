import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
// Move twilio to lazy import inside the route to avoid startup crashes
// import twilio from "twilio"; 
import dotenv from "dotenv";
import cors from "cors";
import fs from "fs";

dotenv.config();

console.log("[SERVER] Início da execução do script.");

async function startServer() {
  console.log("[SERVER] Iniciando startServer()...");
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // Logging middleware
  app.use((req, res, next) => {
    console.log(`[REQUEST] ${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
  });

  // TEST API - Definida ANTES de qualquer outra coisa
  app.get("/api/ping", (req, res) => {
    console.log("[API] Ping recebido");
    res.json({ status: "alive", timestamp: new Date().toISOString() });
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      time: new Date().toISOString(), 
      env: process.env.NODE_ENV || "development"
    });
  });

  const recoveryCodes = new Map<string, { code: string; expires: number }>();

  // Use a router for /api to avoid conflicts
  const apiRouter = express.Router();

  apiRouter.post("/recovery/send-code", async (req, res) => {
    try {
      const { whatsapp, username } = req.body;
      console.log(`[API] Send code: ${username} -> ${whatsapp}`);

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expires = Date.now() + 10 * 60 * 1000;
      recoveryCodes.set(username, { code, expires });

      const sid = process.env.TWILIO_ACCOUNT_SID;
      const token = process.env.TWILIO_AUTH_TOKEN;
      const fromNum = process.env.TWILIO_WHATSAPP_NUMBER;

      if (!sid || !token || !fromNum) {
        console.log(`[DEV-MODE] Código para ${username}: ${code}`);
        return res.json({ success: true, devCode: code, isDev: true });
      }

      // Lazy import twilio
      const twilioModule = await import("twilio");
      const client = twilioModule.default(sid, token);
      
      await client.messages.create({
        body: `Seu código EliBord's: ${code}`,
        from: fromNum.startsWith('whatsapp:') ? fromNum : `whatsapp:${fromNum}`,
        to: whatsapp.startsWith('whatsapp:') ? whatsapp : `whatsapp:${whatsapp}`
      });

      res.json({ success: true });
    } catch (err: any) {
      console.error("[API ERROR]", err);
      res.status(500).json({ error: err.message });
    }
  });

  apiRouter.post("/recovery/verify-code", (req, res) => {
    const { username, code } = req.body;
    const stored = recoveryCodes.get(username);
    if (!stored || stored.code !== code || Date.now() > stored.expires) {
      return res.status(400).json({ error: "Código inválido ou expirado" });
    }
    res.json({ success: true });
  });

  apiRouter.get("/proxy-image", async (req, res) => {
    try {
      const imageUrl = req.query.url as string;
      const fileName = req.query.filename as string;
      if (!imageUrl) return res.status(400).send("URL is required");

      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);

      const contentType = response.headers.get("content-type");
      if (contentType) res.setHeader("Content-Type", contentType);
      
      if (fileName) {
        // Force the browser to use this filename even if proxying
        res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      }
      
      // Add generic CORS headers
      res.setHeader("Access-Control-Allow-Origin", "*");

      const arrayBuffer = await response.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    } catch (err) {
      console.error("[PROXY ERROR]", err);
      res.status(500).send("Error proxying image");
    }
  });

  app.use("/api", apiRouter);

  // Vite/Static logic
  if (process.env.NODE_ENV !== "production") {
    console.log("[SERVER] Carregando Vite no modo Middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[SERVER] Rodando com sucesso na porta ${PORT}`);
    // Create a signal file to verify startup success
    fs.writeFileSync("server_ready.txt", `Ready at ${new Date().toISOString()}`);
  });
}

startServer().catch(err => {
  console.error("[SERVER] ERRO FATAL NA INICIALIZAÇÃO:", err);
  fs.writeFileSync("server_error.txt", err.stack || err.message);
});
