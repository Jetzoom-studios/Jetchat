const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

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

    // User joins
    socket.on("join", (username) => {

        users[socket.id] = username;

        io.emit("online count", Object.keys(users).length);

        io.emit("chat message", {
            system: true,
            text: `🟢 ${username} joined the chat`
        });

    });

    // Chat messages
    socket.on("chat message", (data) => {

        io.emit("chat message", data);

    });

    // =========================
    // STEP 4: TYPING SYSTEM
    // =========================
    socket.on("typing", (username) => {

        if (!username) return;

        typingUsers.set(socket.id, username);

        io.emit("typing users", Array.from(typingUsers.values()));

        // reset timeout per user
        clearTimeout(socket.typingTimeout);

        socket.typingTimeout = setTimeout(() => {

            typingUsers.delete(socket.id);

            io.emit("typing users", Array.from(typingUsers.values()));

        }, 2000);

    });

    // User disconnects
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

        // =========================
        // CLEANUP TYPING ON DISCONNECT
        // =========================
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
