const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { Server } = require("socket.io");

const db = require("./db");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// =========================
// UPLOADS
// =========================

const uploadsFolder = path.join(__dirname, "public", "uploads");

if (!fs.existsSync(uploadsFolder)) {
    fs.mkdirSync(uploadsFolder, { recursive: true });
}

const storage = multer.diskStorage({

    destination(req, file, cb) {
        cb(null, uploadsFolder);
    },

    filename(req, file, cb) {

        const ext = path.extname(file.originalname);

        cb(
            null,
            Date.now() + "-" + Math.random().toString(36).slice(2) + ext
        );

    }

});

const upload = multer({
    storage
});

// Serve public folder
app.use(express.static(path.join(__dirname, "public")));

app.post("/upload-avatar", upload.single("avatar"), async (req, res) => {

    try {

        if (!req.file) {
            return res.status(400).json({
                success: false
            });
        }

        const username = req.body.username;

        if (!username) {
            return res.status(400).json({
                success: false
            });
        }

        const avatar = "/uploads/" + req.file.filename;

        await db.updateAvatar(
            username,
            avatar
        );

        res.json({
            success: true,
            avatar
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            success: false
        });

    }

});

// Connected users
const users = {};

// Typing users
const typingUsers = new Map();

// =========================
// HELPERS
// =========================
function findMessageIndexById(messages, id) {
    return messages.findIndex(m => m.id === id);
}

// =========================
// SOCKET.IO
// =========================
io.on("connection", (socket) => {

    console.log("🟢 Someone connected");

    // =========================
    // SIGNUP
    // =========================
    socket.on("signup", async ({ username, password }, callback) => {

        if (!username || !password) {
            return callback({
                success: false,
                message: "Enter a username and password."
            });
        }

        try {

            const result = await db.createUser(username, password);

            callback(result);

        } catch (err) {

            console.error("Signup error:", err);

            callback({
                success: false,
                message: "Database error."
            });

        }

    });

    // =========================
    // LOGIN
    // =========================
    socket.on("login", async ({ username, password }, callback) => {

        if (!username || !password) {
            return callback({
                success: false,
                message: "Enter a username and password."
            });
        }

        try {

            const result = await db.loginUser(username, password);

            if (!result.success) {
                return callback(result);
            }

            socket.username = result.user.username;
            users[socket.id] = result.user.username;

            io.emit("online count", Object.keys(users).length);

            io.emit("chat message", {
                system: true,
                text: `🟢 ${result.user.username} joined the chat`
            });

            socket.emit("chat history", db.loadMessages());

            callback({
                success: true,
                user: result.user
            });

        } catch (err) {

            console.error("Login error:", err);

            callback({
                success: false,
                message: "Database error."
            });

        }

    });

    // =========================
    // GET PROFILE
    // =========================
    socket.on("get profile", async (username, callback) => {

        console.log("GET PROFILE EVENT:", username);

        try {

            const result = await db.getProfile(username);

            callback(result);

        } catch (err) {

            console.error(err);

            callback({
                success: false
            });

        }

    });

    // =========================
// UPDATE BIO
// =========================
socket.on("update bio", async (bio, callback) => {

    if (!socket.username) {
        return callback({ success: false });
    }

    try {

        const result = await db.updateBio(
            socket.username,
            bio
        );

        callback(result);

    } catch (err) {

        console.error(err);

        callback({
            success: false
        });

    }

});

        // =========================
    // CHAT MESSAGE
    // =========================
    socket.on("chat message", (data) => {

        if (!socket.username) return;

        const msg = {
            id: Date.now() + Math.random(),
            username: socket.username,
            text: data.text,
            replyTo: data.replyTo || null,
            time: data.time || Date.now()
        };

        db.addMessage(msg);

        io.emit("chat message", msg);

    });

    // =========================
    // EDIT MESSAGE
    // =========================
    socket.on("edit message", ({ id, newText }) => {

        if (!socket.username) return;

        const messages = db.loadMessages();

        const index = findMessageIndexById(messages, id);

        if (index === -1) return;

        if (messages[index].username !== socket.username) return;

        messages[index].text = newText;
        messages[index].edited = true;

        db.saveMessages(messages);

        io.emit("chat message edited", {
            id,
            newText
        });

    });

    // =========================
    // DELETE MESSAGE
    // =========================
    socket.on("delete message", (id) => {

        if (!socket.username) return;

        const messages = db.loadMessages();

        const index = findMessageIndexById(messages, id);

        if (index === -1) return;

        if (messages[index].username !== socket.username) return;

        messages.splice(index, 1);

        db.saveMessages(messages);

        io.emit("chat message deleted", {
            id
        });

    });

    // =========================
    // TYPING
    // =========================
    socket.on("typing", () => {

        if (!socket.username) return;

        typingUsers.set(socket.id, socket.username);

        io.emit("typing users", Array.from(typingUsers.values()));

        clearTimeout(socket.typingTimeout);

        socket.typingTimeout = setTimeout(() => {

            typingUsers.delete(socket.id);

            io.emit("typing users", Array.from(typingUsers.values()));

        }, 2000);

    });

          // =========================
    // DISCONNECT
    // =========================
    socket.on("disconnect", () => {

        const username = users[socket.id];

        if (username) {

            io.emit("chat message", {
                system: true,
                text: `🔴 ${username} left the chat`
            });

            delete users[socket.id];

            io.emit("online count", Object.keys(users).length);

        }

        typingUsers.delete(socket.id);

        io.emit("typing users", Array.from(typingUsers.values()));

        console.log("🔴 Someone disconnected");

    });

});

// =========================
// START SERVER
// =========================
server.listen(PORT, () => {

    console.log("");
    console.log("=================================");
    console.log("🚀 Jetchat is running!");
    console.log(`🌐 Port: ${PORT}`);
    console.log("=================================");
    console.log("");

});
