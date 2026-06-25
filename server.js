const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const db = require("./db");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve the public folder
app.use(express.static(path.join(__dirname, "public")));

// Connected users
const users = {};

// Typing users
const typingUsers = new Map();

// =========================
// SOCKET.IO
// =========================

io.on("connection", (socket) => {

    console.log("🟢 Someone connected");

    // =========================
    // SIGN UP
    // =========================

    socket.on("signup", ({ username, password }, callback) => {

        if (!username || !password) {

            return callback({
                success: false,
                message: "Enter a username and password."
            });

        }

        callback(
            db.createUser(username, password)
        );

    });

    // =========================
    // LOGIN
    // =========================

    socket.on("login", ({ username, password }, callback) => {

        if (!username || !password) {

            return callback({
                success: false,
                message: "Enter a username and password."
            });

        }

        const result = db.loginUser(username, password);

        if (!result.success) {
            return callback(result);
        }

        socket.username = username;
        users[socket.id] = username;

        io.emit(
            "online count",
            Object.keys(users).length
        );

        io.emit("chat message", {
            system: true,
            text: `🟢 ${username} joined the chat`
        });

        // =========================
        // SEND CHAT HISTORY
        // =========================

        socket.emit(
            "chat history",
            db.loadMessages()
        );

        callback({
            success: true
        });

    });

    // =========================
    // CHAT MESSAGE
    // =========================

    socket.on("chat message", (data) => {

        // Save message
        db.addMessage(data);

        // Broadcast
        io.emit("chat message", data);

    });

    // =========================
    // TYPING
    // =========================

    socket.on("typing", (username) => {

        if (!username) return;

        typingUsers.set(socket.id, username);

        io.emit(
            "typing users",
            Array.from(typingUsers.values())
        );

        clearTimeout(socket.typingTimeout);

        socket.typingTimeout = setTimeout(() => {

            typingUsers.delete(socket.id);

            io.emit(
                "typing users",
                Array.from(typingUsers.values())
            );

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

            io.emit(
                "online count",
                Object.keys(users).length
            );

        }

        typingUsers.delete(socket.id);

        io.emit(
            "typing users",
            Array.from(typingUsers.values())
        );

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
