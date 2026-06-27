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
    // SIGN UP
    // =========================
    socket.on("signup", async ({ username, password }, callback) => {

    if (!username || !password) {
        return callback({
            success: false,
            message: "Enter a username and password."
        });
    }

    try {

        const result = await db.createUser(
            username,
            password
        );

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

        try {

            const result = await db.getProfile(username);

            callback(result);

        } catch (err) {

            console.error("Profile error:", err);

            callback({
                success: false
            });

        }

    });

    // =========================
    // CHAT MESSAGE (FIXED)
    // =========================
    socket.on("chat message", (data) => {

        const msg = {
            id: Date.now() + Math.random(), // UNIQUE ID
            username: socket.username,
            text: data.text,
            time: Date.now()
        };

        db.addMessage(msg);

        io.emit("chat message", msg);
    });

    // =========================
    // EDIT MESSAGE (FIXED)
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
    // DELETE MESSAGE (FIXED)
    // =========================
    socket.on("delete message", (id) => {

        if (!socket.username) return;

        const messages = db.loadMessages();

        const index = findMessageIndexById(messages, id);
        if (index === -1) return;

        if (messages[index].username !== socket.username) return;

        messages.splice(index, 1);

        db.saveMessages(messages);

        io.emit("chat message deleted", { id });
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
