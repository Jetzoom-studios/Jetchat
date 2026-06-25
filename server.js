const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const db = require("./database"); // ✅ STEP 5.3 ADD

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;

// Serve the public folder
app.use(express.static(path.join(__dirname, "public")));

// Store connected users
const users = {};

// =========================
// STEP 4: TYPING SYSTEM
// =========================
const typingUsers = new Map();

// =========================
// SOCKET.IO
// =========================

io.on("connection", (socket) => {

    console.log("🟢 Someone connected");

    // =========================
    // 🔐 STEP 5.3: SIGNUP
    // =========================
    socket.on("signup", ({ username, password }, callback) => {

        if (!username || !password) {
            return callback({ success: false, message: "Missing fields" });
        }

        db.run(
            "INSERT INTO users (username, password) VALUES (?, ?)",
            [username, password],
            function (err) {

                if (err) {
                    return callback({ success: false, message: "Username already exists" });
                }

                return callback({ success: true });
            }
        );
    });

    // =========================
    // 🔐 STEP 5.3: LOGIN
    // =========================
    socket.on("login", ({ username, password }, callback) => {

        db.get(
            "SELECT * FROM users WHERE username = ? AND password = ?",
            [username, password],
            (err, row) => {

                if (err || !row) {
                    return callback({ success: false, message: "Invalid login" });
                }

                socket.username = username;
                users[socket.id] = username;

                io.emit("online count", Object.keys(users).length);

                io.emit("chat message", {
                    system: true,
                    text: `🟢 ${username} joined the chat`
                });

                callback({ success: true });
            }
        );
    });

    // =========================
    // CHAT MESSAGES
    // (unchanged)
    // =========================
    socket.on("chat message", (data) => {
        io.emit("chat message", data);
    });

    // =========================
    // TYPING SYSTEM (UNCHANGED)
    // =========================
    socket.on("typing", (username) => {

        if (!username) return;

        typingUsers.set(socket.id, username);

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
    console.log(`🌐 http://localhost:${PORT}`);
    console.log("=================================");
    console.log("");

});
