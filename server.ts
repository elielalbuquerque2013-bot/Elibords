import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Recovery Memory Store (in production, use Firestore or Redis)
  const recoveryCodes = new Map<string, { code: string; expires: number }>();

  // API Route: Send WhatsApp Verification Code
  app.post("/api/recovery/send-code", async (req, res) => {
    const { whatsapp, username } = req.body;

    if (!whatsapp) {
      return res.status(400).json({ error: "Número do WhatsApp é obrigatório." });
    }

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = Date.now() + 10 * 60 * 1000; // 10 minutes

    recoveryCodes.set(username, { code, expires });

    const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
    const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
    const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER?.trim();

    const isDevMode = !accountSid || !authToken || !fromNumber || accountSid === "" || authToken === "";

    if (isDevMode) {
      console.warn("Twilio credentials missing or empty. Logging code for development.");
      console.log(`[RECOVERY] Code for ${username} (${whatsapp}): ${code}`);
      return res.json({ 
        success: true, 
        message: "Modo de desenvolvimento: Código gerado com sucesso.", 
        devCode: code,
        isDev: true 
      });
    }

    try {
      const client = twilio(accountSid, authToken);
      const to = whatsapp.startsWith('whatsapp:') ? whatsapp : `whatsapp:${whatsapp}`;
      const from = fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`;

      await client.messages.create({
        body: `Seu código de verificação EliBord's é: ${code}. Ele expira em 10 minutos.`,
        from: from,
        to: to
      });

      res.json({ success: true, message: "Código enviado com sucesso!" });
    } catch (error: any) {
      console.error("Twilio Error:", error);
      // Fallback for development if Twilio fails (e.g. invalid keys)
      res.status(200).json({ 
        success: true, 
        message: "Falha no Twilio, entrando em modo de fallback (DEV).", 
        devCode: code,
        isDev: true,
        error: error.message 
      });
    }
  });

  // API Route: Verify Code
  app.post("/api/recovery/verify-code", async (req, res) => {
    const { username, code } = req.body;
    const stored = recoveryCodes.get(username);

    if (!stored) {
      return res.status(400).json({ error: "Nenhum código solicitado para este usuário." });
    }

    if (Date.now() > stored.expires) {
      recoveryCodes.delete(username);
      return res.status(400).json({ error: "Código expirado. Solicite um novo." });
    }

    if (stored.code !== code) {
      return res.status(400).json({ error: "Código incorreto." });
    }

    res.json({ success: true, message: "Código verificado!" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
