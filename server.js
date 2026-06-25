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