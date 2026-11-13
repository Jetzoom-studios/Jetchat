
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
// CURRENT RELEASE UPDATE
// =========================

const CURRENT_UPDATE = {
    id: "jetchat-3.3",
    version: "3.3",
    title: "What's New in Jetchat",
    date: "November 2026",
    items: [
        "Introducing the Jetchat update log.",
        "Update notifications are remembered per account.",
        "Dismiss the announcement with OK or X."
    ]
};

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

const upload = multer({ storage });

// Serve public folder
app.use(express.static(path.join(__dirname, "public")));

app.post("/upload-avatar", upload.single("avatar"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false });
        }

        const username = req.body.username;

        if (!username) {
            return res.status(400).json({ success: false });
        }

        const avatar = "/uploads/" + req.file.filename;

        await db.updateAvatar(username, avatar);

        res.json({
            success: true,
            avatar
        });
    } catch (err) {
        console.error(err);

        res.status(500).json({ success: false });
    }
});

// Connected users
const users = {};
const onlineUsers = {};

// Typing users
const typingUsers = new Map();

// Build account-level presence: multiple tabs count as one online user.
function getPresenceSnapshot() {
    const usernames = [...new Set(Object.values(users))].sort((a, b) =>
        a.localeCompare(b)
    );

    return {
        users: usernames,
        count: usernames.length
    };
}

function broadcastPresence() {
    const presence = getPresenceSnapshot();
    io.emit("presence update", presence);
    io.emit("online count", presence.count);
}

// =========================
// HELPERS
// =========================
function findMessageIndexById(messages, id) {
    return messages.findIndex(message =>
        String(message.id) === String(id)
    );
}

function getDMPartner(chatValue, currentUsername) {
    if (
        typeof chatValue !== "string" ||
        typeof currentUsername !== "string" ||
        !currentUsername
    ) {
        return null;
    }

    const value = chatValue.trim();

    if (!value || value === "global") {
        return null;
    }

    // Backward compatibility: older clients sent "username|friend".
    if (value.includes("|")) {
        const parts = value.split("|").map(part => part.trim());

        if (
            parts.length !== 2 ||
            !parts.includes(currentUsername) ||
            parts[0] === parts[1]
        ) {
            return null;
        }

        return parts[0] === currentUsername ? parts[1] : parts[0];
    }

    return value === currentUsername ? null : value;
}

async function isAcceptedFriend(username, peer) {
    if (!username || !peer || username === peer) {
        return false;
    }

    const friends = await db.getFriends(username);

    return friends.some(friend => friend.friend === peer);
}

function makeDMChatId(username, peer) {
    return [username, peer].sort().join("|");
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
            socket.accountId = result.user.id;
            onlineUsers[result.user.username] = socket.id;
            // A username room delivers DMs to every active session for this account.
            socket.join(`user:${result.user.username}`);

            broadcastPresence();

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
// GET CURRENT UPDATE
// =========================

socket.on("get current update", async (callback) => {
    if (!socket.username || !socket.accountId) {
        return callback({
            success: false
        });
    }

    try {
        const dismissed = await db.hasDismissedUpdate(
            socket.accountId,
            CURRENT_UPDATE.id
        );

        callback({
            success: true,
            update: dismissed ? null : CURRENT_UPDATE
        });
    } catch (err) {
        console.error("Get update error:", err);

        callback({
            success: false
        });
    }
});

// =========================
// DISMISS CURRENT UPDATE
// =========================

socket.on("dismiss update", async (updateId, callback) => {
    if (!socket.username || !socket.accountId) {
        return callback({
            success: false,
            message: "Not logged in."
        });
    }

    if (updateId !== CURRENT_UPDATE.id) {
        return callback({
            success: false,
            message: "Invalid update."
        });
    }

    try {
        const result = await db.dismissUpdate(
            socket.accountId,
            updateId
        );

        callback(result);
    } catch (err) {
        console.error("Dismiss update error:", err);

        callback({
            success: false,
            message: "Couldn't save your preference."
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

            callback({ success: false });
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
            const result = await db.updateBio(socket.username, bio);
            callback(result);
        } catch (err) {
            console.error(err);
            callback({ success: false });
        }
    });

    // =========================
    // UPDATE AVATAR
    // =========================
    socket.on("update avatar", async (avatar, callback) => {
        if (!socket.username) {
            return callback({ success: false });
        }

        try {
            const result = await db.updateAvatar(socket.username, avatar);
            callback(result);
        } catch (err) {
            console.error(err);
            callback({ success: false });
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
                const oldUsername = socket.username;
                const newUsername = data.username;

                // Keep every active tab for this account in sync after a rename.
                for (const activeSocket of io.sockets.sockets.values()) {
                    if (activeSocket.accountId === socket.accountId) {
                        activeSocket.leave(`user:${oldUsername}`);
                        activeSocket.join(`user:${newUsername}`);
                        activeSocket.username = newUsername;
                        users[activeSocket.id] = newUsername;
                    }
                }

                delete onlineUsers[oldUsername];
                onlineUsers[newUsername] = socket.id;
                broadcastPresence();
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
            const requests = await db.getFriendRequests(socket.username);
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
            const friends = await db.getFriends(socket.username);
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
        if (!socket.username) {
            socket.emit("chat history", []);
            return;
        }

        try {
            let history;

            if (chat === "global") {
                history = db.loadMessages();
            } else {
                const peer = getDMPartner(chat, socket.username);

                if (!peer || !(await isAcceptedFriend(socket.username, peer))) {
                    socket.emit("chat history", []);
                    return;
                }

                const chatId = makeDMChatId(socket.username, peer);

                const deliveredIds = await db.markDMDelivered(
                    chatId,
                    socket.username
                );

                if (deliveredIds.length) {
                    io.to(`user:${peer}`).emit("messages delivered", {
                        chat: chatId,
                        ids: deliveredIds
                    });
                }

                history = await db.loadChat(
                    chatId,
                    socket.username,
                    peer
                );
            }

            socket.emit("chat history", history);
        } catch (err) {
            console.error("Load chat error:", err);
            socket.emit("chat history", []);
        }
    });

    // =========================
    // MARK DIRECT MESSAGES AS READ
    // =========================
    socket.on("mark chat read", async (peer, callback) => {
        const respond = result => {
            if (typeof callback === "function") callback(result);
        };

        if (!socket.username) {
            return respond({ success: false, ids: [] });
        }

        try {
            const partner = getDMPartner(peer, socket.username);

            if (!partner || !(await isAcceptedFriend(socket.username, partner))) {
                return respond({ success: false, ids: [] });
            }

            const chatId = makeDMChatId(socket.username, partner);
            const ids = await db.markDMRead(chatId, socket.username);

            if (ids.length) {
                io.to(`user:${partner}`).emit("messages read", {
                    chat: chatId,
                    reader: socket.username,
                    ids
                });
            }

            respond({ success: true, ids });
        } catch (err) {
            console.error("Mark messages read error:", err);
            respond({ success: false, ids: [] });
        }
    });

    // =========================
    // ACCEPT FRIEND REQUEST
    // =========================
    socket.on("accept friend request", async (sender, callback) => {
        if (!socket.username) {
            return callback({ success: false });
        }

        try {
            const result = await db.acceptFriendRequest(
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
            callback({ success: false });
        }
    });

    // =========================
    // CHAT MESSAGE
    // =========================
    socket.on("chat message", async (data) => {
        if (!socket.username || !data || typeof data.text !== "string") return;

        const messageText = data.text.trim();

        if (!messageText) return;

        const msg = {
            id: Date.now() + Math.random(),
            username: socket.username,
            text: messageText,
            replyTo: data.replyTo || null,
            time: data.time || Date.now()
        };

        if (data.chat === "global") {
            msg.chat = "global";

            db.addMessage(msg);

            io.emit("chat message", msg);
            return;
        }

        try {
            const peer = getDMPartner(data.chat, socket.username);

            if (!peer || !(await isAcceptedFriend(socket.username, peer))) {
                return;
            }

            const chatId = makeDMChatId(socket.username, peer);

            msg.chat = chatId;
            msg.recipient = peer;

            const savedMessage = await db.saveDM(msg);

            // Use the database ID so the live message and loaded history agree.
            if (savedMessage && savedMessage.id !== undefined) {
                msg.id = savedMessage.id;
            }

            // Deliver to the sender and the actual recipient, not the chat ID.
            socket.emit("chat message", msg);

            // Send to the recipient's account room, not a single socket ID.
            // This also supports multiple tabs/devices logged into the same account.
            const recipientRoom = `user:${peer}`;
            const recipientOnline =
                (io.sockets.adapter.rooms.get(recipientRoom)?.size || 0) > 0;

            io.to(recipientRoom).emit("chat message", msg);

            if (recipientOnline) {
                const deliveredIds = await db.markDMDelivered(chatId, peer);

                if (deliveredIds.length) {
                    io.to(`user:${socket.username}`).emit("messages delivered", {
                        chat: chatId,
                        ids: deliveredIds
                    });
                }
            }
        } catch (err) {
            console.error("Direct message error:", err);
        }
    });

    // =========================
    // EDIT MESSAGE
    // =========================
    socket.on("edit message", (data, callback) => {
        const respond = result => {
            if (typeof callback === "function") {
                callback(result);
            }
        };

        if (!socket.username) {
            return respond({
                success: false,
                message: "You must be logged in."
            });
        }

        if (
            !data ||
            data.id === undefined ||
            data.id === null ||
            typeof data.newText !== "string" ||
            !data.newText.trim()
        ) {
            return respond({
                success: false,
                message: "Invalid edit request."
            });
        }

        try {
            const messages = db.loadMessages();
            const index = findMessageIndexById(messages, data.id);

            if (index === -1) {
                return respond({
                    success: false,
                    message: "Message not found in global chat."
                });
            }

            if (messages[index].username !== socket.username) {
                return respond({
                    success: false,
                    message: "You can only edit your own messages."
                });
            }

            const newText = data.newText.trim();

            messages[index].text = newText;
            messages[index].edited = true;

            db.saveMessages(messages);

            io.emit("chat message edited", {
                id: messages[index].id,
                username: socket.username,
                newText,
                edited: true
            });

            respond({ success: true });
        } catch (err) {
            console.error("Edit message error:", err);

            respond({
                success: false,
                message: "The message could not be edited."
            });
        }
    });

    // =========================
    // DELETE MESSAGE
    // =========================
    socket.on("delete message", (id, callback) => {
        const respond = result => {
            if (typeof callback === "function") {
                callback(result);
            }
        };

        if (!socket.username) {
            return respond({
                success: false,
                message: "You must be logged in."
            });
        }

        if (id === undefined || id === null) {
            return respond({
                success: false,
                message: "Invalid delete request."
            });
        }

        try {
            const messages = db.loadMessages();
            const index = findMessageIndexById(messages, id);

            if (index === -1) {
                return respond({
                    success: false,
                    message: "Message not found in global chat."
                });
            }

            if (messages[index].username !== socket.username) {
                return respond({
                    success: false,
                    message: "You can only delete your own messages."
                });
            }

            const deletedId = messages[index].id;

            messages.splice(index, 1);

            db.saveMessages(messages);

            io.emit("chat message deleted", {
                id: deletedId,
                username: socket.username
            });

            respond({ success: true });
        } catch (err) {
            console.error("Delete message error:", err);

            respond({
                success: false,
                message: "The message could not be deleted."
            });
        }
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
    socket.on("disconnect", async () => {
        const username = users[socket.id];

        if (username) {
            io.emit("chat message", {
                system: true,
                text: `🔴 ${username} left the chat`
            });

            if (socket.username && onlineUsers[socket.username] === socket.id) {
                // Do not mark the account offline if another tab is still connected.
                const remainingSocket = [...io.sockets.sockets.values()]
                    .find(activeSocket =>
                        activeSocket.id !== socket.id &&
                        activeSocket.username === socket.username
                    );

                if (remainingSocket) {
                    onlineUsers[socket.username] = remainingSocket.id;
                } else {
                    delete onlineUsers[socket.username];

                    try {
                        await db.updateLastSeen(username);
                    } catch (err) {
                        console.error("Last seen update error:", err);
                    }
                }
            }

            delete users[socket.id];

            broadcastPresence();
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
