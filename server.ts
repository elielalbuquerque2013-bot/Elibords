import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import multer from "multer";
import cors from "cors";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple JSON Database
const DB_FILE = path.join(__dirname, "db.json");

interface DbSchema {
  users: Record<string, any>;
  orders: any[];
}

function readDb(): DbSchema {
  if (!fs.existsSync(DB_FILE)) {
    const initialDb = { users: {}, orders: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialDb, null, 2));
    return initialDb;
  }
  const data = fs.readFileSync(DB_FILE, "utf-8");
  return JSON.parse(data);
}

function writeDb(data: DbSchema) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize DB
  try {
    const db = readDb();
    writeDb(db);
    console.log("Database initialized and writable");
  } catch (error) {
    console.error("CRITICAL: Database is not writable!", error);
  }

  // Middleware
  app.use(cors());
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
  });
  app.use(express.json({ limit: '50mb' }));
  
  // File upload setup
  const isProd = process.env.NODE_ENV === "production";
  const uploadDir = isProd ? "/tmp/uploads" : path.join(__dirname, "uploads");
  
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  try {
    const testFile = path.join(uploadDir, ".write-test");
    fs.writeFileSync(testFile, "test");
    fs.unlinkSync(testFile);
    console.log("Uploads directory is writable");
  } catch (error) {
    console.error("CRITICAL: Uploads directory is NOT writable!", error);
  }

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      cb(null, Date.now() + "-" + file.originalname);
    },
  });

  const upload = multer({ 
    storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB
  });

  // Serve uploaded files
  app.use("/uploads", (req, res, next) => {
    const filePath = path.join(uploadDir, req.url);
    if (fs.existsSync(filePath)) {
      console.log(`Serving file: ${filePath}`);
    } else {
      console.warn(`File not found: ${filePath}`);
    }
    next();
  }, express.static(uploadDir));

  // Error handling for multer
  const handleUpload = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    upload.single("file")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: "Arquivo muito grande. O limite é 50MB." });
        }
        return res.status(400).json({ error: `Erro no upload: ${err.message}` });
      } else if (err) {
        console.error("Unknown upload error:", err);
        return res.status(500).json({ error: "Erro interno no servidor durante o upload." });
      }
      next();
    });
  };

  // API Routes
  app.get("/api/health", (req, res) => {
    const uploads = fs.existsSync(uploadDir) ? fs.readdirSync(uploadDir) : [];
    res.json({ 
      status: "ok", 
      time: new Date().toISOString(),
      env: process.env.NODE_ENV,
      uploadDir,
      uploadCount: uploads.length,
      uploads: uploads.slice(0, 10) // Show first 10 files
    });
  });

  app.get("/api/proxy-image", async (req, res) => {
    const imageUrl = req.query.url as string;
    if (!imageUrl) return res.status(400).send("URL is required");
    
    try {
      // If it's a local upload path (either relative or full URL containing /uploads/)
      if (imageUrl.includes("/uploads/")) {
        const parts = imageUrl.split("/uploads/");
        const fileName = parts[parts.length - 1];
        const filePath = path.join(uploadDir, fileName);
        
        if (fs.existsSync(filePath)) {
          return res.sendFile(filePath);
        } else if (!imageUrl.startsWith("http")) {
          // If it's not a full URL and file doesn't exist locally, it's a 404
          console.error(`Local file not found: ${filePath}`);
          return res.status(404).send(`
            <html>
              <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #f8f9fa; color: #343a40; text-align: center; padding: 20px;">
                <h1 style="color: #dc3545;">Imagem não encontrada</h1>
                <p>Esta imagem foi salva temporariamente no servidor e foi removida automaticamente.</p>
                <p style="font-size: 0.9em; color: #6c757d;">Para evitar que isso aconteça, certifique-se de que o selo <b>"Nuvem OK"</b> esteja verde no painel administrativo antes de receber novos pedidos.</p>
                <button onclick="window.close()" style="margin-top: 20px; padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer;">Fechar aba</button>
              </body>
            </html>
          `);
        }
        // If it's a full URL containing /uploads/ but not found locally, 
        // we fall through to try fetching it as a regular URL
      }

      // For external URLs (like Firebase Storage or full URLs)
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
      
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const contentType = response.headers.get("content-type");
      
      res.setHeader("Content-Type", contentType || "image/jpeg");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.send(buffer);
    } catch (error) {
      console.error("Proxy image error:", error);
      res.status(500).send(`Error fetching image: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  
  // Users
  app.get("/api/users", (req, res) => {
    const db = readDb();
    res.json(db.users);
  });

  app.post("/api/users", (req, res) => {
    const { username, password, whatsapp, role } = req.body;
    const db = readDb();
    if (db.users[username]) {
      return res.status(400).json({ error: "User already exists" });
    }
    db.users[username] = { username, password, whatsapp, role: role || 'client' };
    writeDb(db);
    res.json({ success: true });
  });

  app.put("/api/users/:username", (req, res) => {
    const { whatsapp } = req.body;
    const { username } = req.params;
    const db = readDb();
    if (db.users[username]) {
      db.users[username].whatsapp = whatsapp;
      writeDb(db);
    }
    res.json({ success: true });
  });

  // Orders
  app.get("/api/orders", (req, res) => {
    const db = readDb();
    // Sort by date descending
    const sortedOrders = [...db.orders].sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    res.json(sortedOrders);
  });

  app.post("/api/orders", handleUpload, (req, res) => {
    try {
      if (!req.body.data) {
        console.error("Missing order data in request body");
        return res.status(400).json({ error: "Missing order data" });
      }

      const orderData = JSON.parse(req.body.data);
      let fileUrl = orderData.imagePreview;

      const mReq = req as any;
      if (mReq.file) {
        fileUrl = `/uploads/${mReq.file.filename}`;
        console.log(`File uploaded: ${mReq.file.filename}, size: ${mReq.file.size}`);
      } else {
        console.warn("No file received in order request");
      }

      const db = readDb();
      const newOrder = {
        ...orderData,
        id: Date.now().toString(),
        imagePreview: fileUrl
      };
      
      db.orders.push(newOrder);
      writeDb(db);
      console.log(`Order ${newOrder.id} saved successfully for ${newOrder.customerName}. Image URL: ${fileUrl}`);

      res.json({ success: true, id: newOrder.id, imagePreview: fileUrl });
    } catch (error) {
      console.error("Error processing order:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/orders/:id", (req, res) => {
    const { status } = req.body;
    const { id } = req.params;
    const db = readDb();
    const orderIndex = db.orders.findIndex(o => o.id === id);
    if (orderIndex !== -1) {
      db.orders[orderIndex].status = status;
      writeDb(db);
    }
    res.json({ success: true });
  });

  app.put("/api/orders/:id/file", handleUpload, (req, res) => {
    try {
      const { id } = req.params;
      const mReq = req as any;
      if (mReq.file) {
        const fileUrl = `/uploads/${mReq.file.filename}`;
        const fileName = mReq.file.originalname;
        
        const db = readDb();
        const orderIndex = db.orders.findIndex(o => o.id === id);
        if (orderIndex !== -1) {
          db.orders[orderIndex].fileUrl = fileUrl;
          db.orders[orderIndex].fileName = fileName;
          db.orders[orderIndex].status = 'Concluído';
          writeDb(db);
        }
        res.json({ 
          success: true, 
          fileUrl, 
          fileName 
        });
      } else {
        res.status(400).json({ error: "Nenhum arquivo enviado" });
      }
    } catch (error) {
      console.error("Error uploading matrix file:", error);
      res.status(500).json({ error: "Erro interno ao processar arquivo da matriz" });
    }
  });

  app.delete("/api/orders/:id", (req, res) => {
    const { id } = req.params;
    const db = readDb();
    db.orders = db.orders.filter(o => o.id !== id);
    writeDb(db);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
  server.timeout = 120000; // 2 minutes
}

startServer();
