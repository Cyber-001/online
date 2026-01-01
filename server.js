// =========================
// FULL WORKING SERVER.JS
// Render + MongoDB READY
// =========================

require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { Server } = require("socket.io");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// =========================
// CONFIG
// =========================
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || "";
const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_ME";

// =========================
// APP & SERVER
// =========================
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(cors());
app.use(express.json());

// =========================
// MONGO CONNECT (SAFE)
// =========================
let mongoReady = false;

if (MONGO_URI) {
  mongoose
    .connect(MONGO_URI)
    .then(() => {
      mongoReady = true;
      console.log("✅ MongoDB connected");
    })
    .catch((err) => {
      console.error("❌ MongoDB error:", err.message);
    });
} else {
  console.warn("⚠️ MONGO_URI yo‘q, Mongo ishlatilmaydi");
}

// =========================
// MODELS
// =========================
const UserSchema = new mongoose.Schema({
  username: String,
  password: String
});

const MessageSchema = new mongoose.Schema({
  from: String,
  to: String,
  text: String,
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.models.User || mongoose.model("User", UserSchema);
const Message = mongoose.models.Message || mongoose.model("Message", MessageSchema);

// =========================
// AUTH MIDDLEWARE
// =========================
function auth(req, res, next) {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: "No token" });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

// =========================
// ROUTES
// =========================
app.get("/", (req, res) => {
  res.send("Server is running ✅");
});

// REGISTER
app.post("/api/register", async (req, res) => {
  if (!mongoReady) return res.status(500).json({ error: "DB not ready" });

  const { username, password } = req.body;
  const hash = await bcrypt.hash(password, 10);
  await User.create({ username, password: hash });
  res.json({ success: true });
});

// LOGIN
app.post("/api/login", async (req, res) => {
  if (!mongoReady) return res.status(500).json({ error: "DB not ready" });

  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user) return res.status(404).json({ error: "User not found" });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: "Wrong password" });

  const token = jwt.sign({ id: user._id, username }, JWT_SECRET);
  res.json({ token });
});

// GET MESSAGES
app.get("/api/messages/:to", auth, async (req, res) => {
  if (!mongoReady) return res.json([]);

  const msgs = await Message.find({
    $or: [
      { from: req.user.username, to: req.params.to },
      { from: req.params.to, to: req.user.username }
    ]
  }).sort({ createdAt: 1 });

  res.json(msgs);
});

// =========================
// FILE UPLOAD (SAFE FOR RENDER)
// =========================
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  try {
    fs.mkdirSync(uploadDir);
  } catch {}
}

const upload = multer({ dest: uploadDir });

app.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  res.json({ filename: req.file.filename });
});

// =========================
// SOCKET.IO
// =========================
io.on("connection", (socket) => {
  console.log("🟢 User connected:", socket.id);

  socket.on("send-message", async (data) => {
    const { from, to, text } = data;

    if (mongoReady) {
      await Message.create({ from, to, text });
    }

    io.emit("new-message", data);
  });

  socket.on("disconnect", () => {
    console.log("🔴 User disconnected:", socket.id);
  });
});

// =========================
// START SERVER (LAST)
// =========================
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
