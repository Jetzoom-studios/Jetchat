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
const onlineUsers = {};

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
            onlineUsers[result.user.username] = socket.id;

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
// UPDATE AVATAR
// =========================
socket.on("update avatar", async (avatar, callback) => {

    if (!socket.username) {
        return callback({
            success: false
        });
    }

    try {

        const result = await db.updateAvatar(
            socket.username,
            avatar
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
// UPDATE PROFILE
// =========================
socket.on("update profile", async (data, callback) => {

    if (!socket.username) {
        return callback({
            success: false,
            message: "Not logged in."
        });
    }

    try {

    const result = await db.updateProfile(
        socket.username,
        data.username,
        data.bio
    );

    if (result.success) {
        socket.username = data.username;
    }

    callback(result);

} catch (err) {

    console.error(err);

    callback({
        success: false,
        message: "Couldn't update profile."
    });

}

    }); 

    // =========================
// SEND FRIEND REQUEST
// =========================
socket.on("send friend request", async (receiver, callback) => {

    if (!socket.username) {
        return callback({
            success: false,
            message: "Not logged in."
        });
    }

    try {

        const result = await db.sendFriendRequest(
            socket.username,
            receiver
        );

        callback(result);
        if (result.success && onlineUsers[receiver]) {

    io.to(onlineUsers[receiver]).emit("new friend request");

}

    } catch (err) {

        console.error(err);

        callback({
            success: false,
            message: "Server error."
        });

    }

});

    // =========================
// GET FRIEND REQUESTS
// =========================
socket.on("get friend requests", async (callback) => {

    if (!socket.username) {
        return callback([]);
    }

    try {

        const requests =
            await db.getFriendRequests(socket.username);

        callback(requests);

    } catch (err) {

        console.error(err);

        callback([]);

    }

});

    // =========================
// GET FRIENDS
// =========================
socket.on("get friends", async (callback) => {

    if (!socket.username) {
        return callback([]);
    }

    try {

        const friends =
            await db.getFriends(socket.username);

        callback(friends);

    } catch (err) {

        console.error(err);

        callback([]);

    }

});

    // =========================
// LOAD CHAT
// =========================
socket.on("load chat", async (chat) => {

    try {

        let history;

        if (chat === "global") {

            history = db.loadMessages();

        } else {

            const users = [
                socket.username,
                chat
            ].sort().join("|");

            history = await db.loadChat(users);

        }

        socket.emit("chat history", history);

    } catch (err) {

        console.error(err);

    }

});

    // =========================
// ACCEPT FRIEND REQUEST
// =========================
socket.on("accept friend request", async (sender, callback) => {

    if (!socket.username) {
        return callback({
            success: false
        });
    }

    try {

        const result =
            await db.acceptFriendRequest(
                sender,
                socket.username
            );

        callback(result);
        if (result.success) {

    io.to(socket.id).emit("friends updated");

    if (onlineUsers[sender]) {
        io.to(onlineUsers[sender]).emit("friends updated");
    }

}

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
    socket.on("chat message", async (data) => {

    if (!socket.username) return;

    const msg = {
        id: Date.now() + Math.random(),
        username: socket.username,
        text: data.text,
        replyTo: data.replyTo || null,
        time: data.time || Date.now()
    };

    if (data.chat === "global") {

        msg.chat = "global";

        db.addMessage(msg);

        io.emit("chat message", msg);

    } else {

        const chatId = [
            socket.username,
            data.chat
        ].sort().join("|");

        msg.chat = chatId;
        msg.recipient = data.chat;

        await db.saveDM(msg);

        socket.emit("chat message", msg);

        if (onlineUsers[data.chat]) {
            io.to(onlineUsers[data.chat]).emit("chat message", msg);
        }

    }

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
            if (socket.username) {
    delete onlineUsers[socket.username];
}

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
