
const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { Server } = require("socket.io");

const db = require("./db");

const app = express();
app.use(express.json({ limit: "10kb" }));
const server = http.createServer(app);
const io = new Server(server);

const SESSION_COOKIE_NAME = "jetchat_session";
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function getCookieValue(cookieHeader, name) {
    if (typeof cookieHeader !== "string") return "";
    const prefix = name + "=";
    const part = cookieHeader.split(";").map(value => value.trim()).find(value => value.startsWith(prefix));
    if (!part) return "";
    try { return decodeURIComponent(part.slice(prefix.length)); }
    catch { return ""; }
}

function sessionCookieOptions(req) {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production" || req.headers["x-forwarded-proto"] === "https",
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_MAX_AGE_MS
    };
}

function clearSessionCookieOptions(req) {
    const options = sessionCookieOptions(req);
    delete options.maxAge;
    return options;
}

const PORT = process.env.PORT || 3000;

// =========================
// CURRENT RELEASE UPDATE
// =========================

const CURRENT_UPDATE = {
    id: "jetchat-3.7.3",
    version: "3.7.3",
    title: "Jetchat Activity",
    date: "November 14, 2026",
    items: [
        "A unified activity centre brings your social notifications together.",
        "Get notified when someone likes or comments on your posts.",
        "Get notified when someone follows you.",
        "Reply to a Story and continue the conversation in direct messages.",
        "Notifications are saved to your account and update while you're online."
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
const chatUpload = multer({
    storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024, files: 1 },
    fileFilter(req,file,cb) {
        const allowed=new Set(["image/jpeg","image/png","image/gif","image/webp","application/pdf","text/plain","audio/webm","audio/ogg","audio/mp4","audio/mpeg","audio/wav","audio/x-m4a"]);
        if(!allowed.has(file.mimetype)) return cb(new Error("That file type isn't supported."));
        cb(null,true);
    }
});

// Cloudflare Turnstile configuration. The secret key is never sent to browsers.
const TURNSTILE_SITE_KEY = process.env.TURNSTILE_SITE_KEY || "";
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || "";

app.get("/api/captcha-config", (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ enabled: Boolean(TURNSTILE_SITE_KEY && TURNSTILE_SECRET_KEY), siteKey: TURNSTILE_SITE_KEY });
});

// Verify every auth attempt on the server. Client-side widget state is never trusted.
async function verifyTurnstileToken(token) {
    if (!TURNSTILE_SECRET_KEY || typeof token !== "string" || !token.trim()) {
        return false;
    }

    try {
        const body = new URLSearchParams({
            secret: TURNSTILE_SECRET_KEY,
            response: token.trim()
        });

        const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
            signal: AbortSignal.timeout(8000)
        });

        if (!response.ok) return false;
        const result = await response.json();
        return result.success === true && result.action === "jetchat-auth";
    } catch (error) {
        console.error("CAPTCHA verification unavailable:", error.message);
        return false;
    }
}

// Establish a persistent session cookie after a successful CAPTCHA-protected login.
app.post("/api/session/establish", async (req, res) => {
    try {
        const token = req.body && req.body.token;
        const session = await db.getAuthSession(token);
        if (!session) return res.status(401).json({ success: false, message: "Session could not be established. Please sign in again." });
        res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions(req));
        res.set("Cache-Control", "no-store");
        return res.json({ success: true });
    } catch (error) {
        console.error("Session establishment error:", error.message);
        return res.status(500).json({ success: false, message: "Could not save your sign-in." });
    }
});

// Revoke only this remembered browser session. Other devices remain signed in.
app.post("/api/session/logout", async (req, res) => {
    try {
        const token = getCookieValue(req.headers.cookie, SESSION_COOKIE_NAME);
        const session = token ? await db.getAuthSession(token) : null;
        if (token) await db.revokeAuthSession(token);
        res.clearCookie(SESSION_COOKIE_NAME, clearSessionCookieOptions(req));
        res.set("Cache-Control", "no-store");
        if (session) {
            const room = `session:${session.sessionHash}`;
            io.to(room).emit("session revoked");
            for (const activeSocket of io.sockets.sockets.values()) {
                if (activeSocket.sessionHash === session.sessionHash) {
                    activeSocket.disconnect(true);
                }
            }
        }
        return res.json({ success: true });
    } catch (error) {
        console.error("Session logout error:", error.message);
        res.clearCookie(SESSION_COOKIE_NAME, clearSessionCookieOptions(req));
        return res.status(500).json({ success: false, message: "Could not sign out cleanly." });
    }
});

async function getRequestSession(req) {
    const token = getCookieValue(req.headers.cookie, SESSION_COOKIE_NAME);
    return token ? db.getAuthSession(token) : null;
}

app.use("/api/social", require("./social-api")(getRequestSession, io, isAcceptedFriend));

// Authenticated chat media lives in PostgreSQL, so it survives Render restarts and deploys.
app.post("/api/chat/upload",(req,res,next)=>chatUpload.single("file")(req,res,error=>{if(error)return res.status(400).json({success:false,message:error.message||"Upload failed."});next();}),async(req,res)=>{
    try {
        const session=await getRequestSession(req);if(!session)return res.status(401).json({success:false,message:"Please sign in again."});
        if(!req.file)return res.status(400).json({success:false,message:"Choose a file first."});
        const chat=String(req.body.chat||"");let allowed=false;
        if(/^group:[1-9][0-9]*$/.test(chat))allowed=await db.isGroupMember(chat.slice(6),session.user.username);
        else if(chat.includes("|")&&chat.split("|").length===2){const peer=getDMPartner(chat,session.user.username);allowed=Boolean(peer&&await isAcceptedFriend(session.user.username,peer)&&makeDMChatId(session.user.username,peer)===chat);}
        if(!allowed)return res.status(403).json({success:false,message:"You can't upload to this conversation."});
        const attachment=await db.storeChatAttachment(chat,session.user.username,req.file);res.set("Cache-Control","no-store");return res.json({success:true,attachment});
    }catch(error){console.error("Chat media upload error:",error.message);return res.status(500).json({success:false,message:"Couldn't upload that file."});}
});
app.get("/api/chat-media/:id",async(req,res)=>{
    try{
        const session=await getRequestSession(req);if(!session)return res.sendStatus(401);
        if(!/^[1-9][0-9]*$/.test(req.params.id))return res.sendStatus(404);
        const file=await db.getChatAttachment(req.params.id);if(!file)return res.sendStatus(404);
        let allowed=false;
        if(file.chat.startsWith("group:"))allowed=await db.isGroupMember(file.chat.slice(6),session.user.username);
        else if(file.chat.includes("|")){const peer=getDMPartner(file.chat,session.user.username);allowed=Boolean(peer&&await isAcceptedFriend(session.user.username,peer));}
        if(!allowed)return res.sendStatus(403);
        res.set("X-Content-Type-Options","nosniff");res.set("Cache-Control","private,no-store");res.type(file.mime_type);
        const safeName=String(file.original_name||"file").replace(/[\\r\\n"\\\\]/g,"_");
        const inlineMedia=file.mime_type.startsWith("image/")||file.mime_type.startsWith("audio/");
        res.set("Content-Disposition",inlineMedia?"inline":`attachment; filename="${safeName}"`);
        return res.send(file.data);
    }catch(error){console.error("Chat media retrieval error:",error.message);return res.sendStatus(500);}
});

function describeDevice(userAgent) {
    const ua = String(userAgent || "");
    let os = "Unknown device";
    if (/Windows NT/i.test(ua)) os = "Windows";
    else if (/Mac OS X/i.test(ua)) os = "macOS";
    else if (/Android/i.test(ua)) os = "Android";
    else if (/(iPhone|iPad|iPod)/i.test(ua)) os = "iOS";
    else if (/Linux/i.test(ua)) os = "Linux";
    let browser = "Browser";
    if (/Edg\//i.test(ua)) browser = "Microsoft Edge";
    else if (/OPR\//i.test(ua)) browser = "Opera";
    else if (/Firefox\//i.test(ua)) browser = "Firefox";
    else if (/Chrome\//i.test(ua)) browser = "Chrome";
    else if (/Safari\//i.test(ua)) browser = "Safari";
    return `${browser} on ${os}`;
}
function notifyRevokedSessions(hashes) {
    for (const hash of hashes || []) {
        io.to(`session:${hash}`).emit("session revoked");
        for (const active of io.sockets.sockets.values()) {
            if (active.sessionHash === hash) active.disconnect(true);
        }
    }
}
app.get("/api/account/sessions", async (req, res) => {
    try {
        const current = await getRequestSession(req);
        if (!current) return res.status(401).json({ success:false, message:"Please sign in again." });
        const sessions = await db.listAuthSessions(current.user.id);
        res.set("Cache-Control","no-store");
        return res.json({ success:true, sessions:sessions.map(row => ({
            id:row.token_hash, device:describeDevice(row.user_agent),
            createdAt:row.created_at, lastActiveAt:row.last_used_at,
            expiresAt:row.expires_at, current:row.token_hash === current.sessionHash
        })) });
    } catch(error) {
        console.error("List account sessions error:",error.message);
        return res.status(500).json({success:false,message:"Couldn't load signed-in devices."});
    }
});
app.post("/api/account/sessions/revoke", async (req,res) => {
    try {
        const current=await getRequestSession(req);
        if(!current) return res.status(401).json({success:false,message:"Please sign in again."});
        const revoked=await db.revokeAuthSessionForUser(req.body && req.body.sessionId,current.user.id,current.sessionHash);
        if(!revoked) return res.status(404).json({success:false,message:"That session wasn't found or is the current device."});
        notifyRevokedSessions([revoked.token_hash]);
        res.set("Cache-Control","no-store");
        return res.json({success:true});
    } catch(error) {
        console.error("Revoke account session error:",error.message);
        return res.status(500).json({success:false,message:"Couldn't sign out that device."});
    }
});
app.post("/api/account/sessions/revoke-others", async (req,res) => {
    try {
        const current=await getRequestSession(req);
        if(!current) return res.status(401).json({success:false,message:"Please sign in again."});
        const revoked=await db.revokeOtherAuthSessions(current.user.id,current.sessionHash);
        notifyRevokedSessions(revoked);
        res.set("Cache-Control","no-store");
        return res.json({success:true,count:revoked.length});
    } catch(error) {
        console.error("Revoke other sessions error:",error.message);
        return res.status(500).json({success:false,message:"Couldn't sign out other devices."});
    }
});
app.post("/api/account/change-password", async (req,res) => {
    try {
        const current=await getRequestSession(req);
        if(!current) return res.status(401).json({success:false,message:"Please sign in again."});
        const currentPassword=String(req.body && req.body.currentPassword || "");
        const newPassword=String(req.body && req.body.newPassword || "");
        if(newPassword.length<8 || newPassword.length>128) return res.status(400).json({success:false,message:"Your new password must be 8–128 characters."});
        const result=await db.changeAccountPassword(current.user.username,currentPassword,newPassword,current.sessionHash);
        if(!result.success) return res.status(400).json(result);
        notifyRevokedSessions(result.revokedSessions);
        res.set("Cache-Control","no-store");
        return res.json({success:true,signedOutDevices:result.revokedSessions.length});
    } catch(error) {
        console.error("Change account password error:",error.message);
        return res.status(500).json({success:false,message:"Couldn't change your password."});
    }
});

// Read the HttpOnly cookie during the Socket.IO handshake. The raw token is
// never exposed to page JavaScript after the initial login exchange.
io.use(async (socket, next) => {
    try {
        const token = getCookieValue(socket.handshake.headers.cookie, SESSION_COOKIE_NAME);
        if (token) {
            const session = await db.getAuthSession(token);
            if (session) socket.restoredSession = session;
        }
        next();
    } catch (error) {
        next(error);
    }
});

// Serve public folder
app.use(express.static(path.join(__dirname, "public")));

app.post("/upload-avatar", upload.single("avatar"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false });
        }

        // The authenticated Socket.IO event saves the returned path to the
        // currently logged-in account. Do not trust a username from this upload.
        const avatar = "/uploads/" + req.file.filename;

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
const presenceVisibility = new Map();

// Typing users
const typingUsers = new Map();

// Build account-level presence: multiple tabs count as one online user.
function getPresenceSnapshot() {
    const usernames = [...new Set(Object.values(users))]
        .filter(username => presenceVisibility.get(username) !== false)
        .sort((a, b) => a.localeCompare(b));

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

async function activateAuthenticatedSocket(socket, user, sessionHash) {
    socket.username = user.username;
    socket.accountId = user.id;
    socket.sessionHash = sessionHash || null;
    users[socket.id] = user.username;
    presenceVisibility.set(user.username, user.show_online !== false);
    onlineUsers[user.username] = socket.id;
    await socket.join(`user:${user.username}`);
    const groups=await db.getUserGroups(user.username);
    for(const group of groups)await socket.join(`group:${group.id}`);
    if (sessionHash) await socket.join(`session:${sessionHash}`);
    broadcastPresence();
    io.emit("chat message", {
        system: true,
        text: `🟢 ${user.username} joined the chat`
    });
    socket.emit("chat history", await attachMessageReactions("global", db.loadMessages()));
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


async function attachMessageReactions(chat, history) {
    const rows = await db.getMessageReactions(chat);
    const grouped = new Map();
    rows.forEach(row => {
        const key = String(row.message_id);
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push({
            emoji: row.emoji,
            count: Number(row.count),
            users: row.users || []
        });
    });
    return history.map(message => ({
        ...message,
        reactions: grouped.get(String(message.id)) || []
    }));
}

// =========================
// SOCKET.IO
// =========================
io.on("connection", (socket) => {
    console.log("🟢 Someone connected");
    socket.on("session activity", () => {
        if (socket.sessionHash) db.touchAuthSession(socket.sessionHash).catch(error =>
            console.error("Session activity update error:", error.message)
        );
    });

    socket.on("restore session", async callback => {
        if (typeof callback !== "function") return;
        if (!socket.restoredSession) return callback({ success: false });
        try {
            if (!socket.username) {
                await activateAuthenticatedSocket(
                    socket,
                    socket.restoredSession.user,
                    socket.restoredSession.sessionHash
                );
            }
            callback({ success: true, user: socket.restoredSession.user });
        } catch (error) {
            console.error("Session restore error:", error.message);
            callback({ success: false });
        }
    });

    // =========================
    // SIGNUP
    // =========================
    socket.on("signup", async ({ username, password, captchaToken }, callback) => {
        if (!username || !password) {
            return callback({
                success: false,
                message: "Enter a username and password."
            });
        }

        if (!(await verifyTurnstileToken(captchaToken))) {
            return callback({
                success: false,
                message: "Please complete the security check and try again."
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
    socket.on("login", async ({ username, password, captchaToken }, callback) => {
        if (!username || !password) {
            return callback({
                success: false,
                message: "Enter a username and password."
            });
        }

        if (!(await verifyTurnstileToken(captchaToken))) {
            return callback({
                success: false,
                message: "Please complete the security check and try again."
            });
        }

        try {
            const result = await db.loginUser(username, password);

            if (!result.success) {
                return callback(result);
            }

            const session = await db.createAuthSession(result.user.id, socket.handshake.headers["user-agent"] || "");
            await activateAuthenticatedSocket(socket, result.user, session.sessionHash);

            callback({
                success: true,
                user: result.user,
                sessionToken: session.token
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
    // UPDATE PRESENCE VISIBILITY
    // =========================
    socket.on("set presence visibility", async (showOnline, callback) => {
        if (!socket.username) {
            if (typeof callback === "function") callback({ success: false });
            return;
        }

        try {
            const visible = showOnline !== false;
            await db.updateShowOnline(socket.username, visible);
            presenceVisibility.set(socket.username, visible);
            broadcastPresence();

            if (typeof callback === "function") {
                callback({ success: true, showOnline: visible });
            }
        } catch (err) {
            console.error("Presence privacy update error:", err);

            if (typeof callback === "function") {
                callback({ success: false });
            }
        }
    });

    // =========================
    // GET PROFILE
    // =========================
    socket.on("get profile", async (username, callback) => {
        if (typeof username !== "string" || !username.trim()) {
            return callback({ success: false });
        }

        try {
            const result = await db.getProfile(username.trim());
            callback(result);
        } catch (err) {
            console.error("Get profile error:", err);
            callback({ success: false });
        }
    });

    // =========================
    // LOAD DM CONVERSATIONS
    // =========================
    socket.on("get dm conversations", async (callback) => {
        if (!socket.username) {
            return callback({ success: false, conversations: [] });
        }

        try {
            const conversations = await db.getDMConversations(socket.username);
            callback({ success: true, conversations });
        } catch (err) {
            console.error("Load DM conversations error:", err);
            callback({ success: false, conversations: [] });
        }
    });

    // =========================
    // PIN / UNPIN DM CONVERSATION
    // =========================
    socket.on("set dm pin", async (data, callback) => {
        const respond = result => {
            if (typeof callback === "function") callback(result);
        };

        if (!socket.username || !data || typeof data.peer !== "string") {
            return respond({ success: false, message: "Invalid conversation." });
        }

        try {
            const peer = data.peer.trim();

            if (!peer || !(await isAcceptedFriend(socket.username, peer))) {
                return respond({ success: false, message: "You can only pin an existing friend's conversation." });
            }

            await db.setDMPin(socket.username, peer, data.pinned === true);
            respond({ success: true });
        } catch (err) {
            console.error("Set DM pin error:", err);
            respond({ success: false, message: "Couldn't update pinned conversation." });
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
            if (!data || typeof data.username !== "string" || !data.username.trim()) {
                return callback({ success: false, message: "Enter a valid username." });
            }

            const newUsername = data.username.trim();
            const bio = typeof data.bio === "string" ? data.bio.trim().slice(0, 200) : "";
            const customStatus = typeof data.customStatus === "string"
                ? data.customStatus.trim().slice(0, 60)
                : "";
            const profileColor =
                typeof data.profileColor === "string" &&
                /^#[0-9a-fA-F]{6}$/.test(data.profileColor)
                    ? data.profileColor
                    : "#5865f2";

            const result = await db.updateProfile(
                socket.username,
                newUsername,
                bio,
                profileColor,
                customStatus
            );

            if (result.success) {
                const oldUsername = socket.username;
                const newUsername = data.username.trim();

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
                const wasVisible = presenceVisibility.get(oldUsername) !== false;
                presenceVisibility.delete(oldUsername);
                presenceVisibility.set(newUsername, wasVisible);
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

            if (result.success) {
                io.to(`user:${receiver}`).emit("new friend request", {
                    sender: socket.username
                });
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
    // SEARCH USERS FOR FRIEND DISCOVERY
    // =========================
    socket.on("search users", async (query, callback) => {
        const respond = result => {
            if (typeof callback === "function") callback(result);
        };
        if (!socket.username) return respond({ success: false, users: [] });

        try {
            const users = await db.searchUsers(query, socket.username);
            respond({ success: true, users });
        } catch (err) {
            console.error("User search error:", err);
            respond({ success: false, users: [], message: "Search is temporarily unavailable." });
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



    socket.on("get groups",async callback=>{
        if(!socket.username)return typeof callback==="function"&&callback({success:false,groups:[]});
        try{const groups=await db.getUserGroups(socket.username);if(typeof callback==="function")callback({success:true,groups});}
        catch(error){console.error("Get groups error:",error.message);if(typeof callback==="function")callback({success:false,groups:[]});}
    });
    socket.on("create group",async(data,callback)=>{
        const respond=result=>{if(typeof callback==="function")callback(result);};
        if(!socket.username||!data||typeof data.name!=="string")return respond({success:false,message:"Invalid group details."});
        const name=data.name.trim().slice(0,40),requested=Array.isArray(data.members)?[...new Set(data.members.map(v=>String(v).trim()).filter(Boolean))]:[];
        if(name.length<2)return respond({success:false,message:"Group names must be at least 2 characters."});
        if(requested.length<1||requested.length>20)return respond({success:false,message:"Choose between 1 and 20 friends."});
        try{
            const friends=await db.getFriends(socket.username),accepted=new Set(friends.map(row=>row.friend));
            if(requested.some(member=>!accepted.has(member)))return respond({success:false,message:"Groups can only include your existing friends."});
            const group=await db.createGroup(name,socket.username,requested);
            for(const member of group.members){io.in(`user:${member}`).socketsJoin(`group:${group.id}`);io.to(`user:${member}`).emit("groups updated");}
            respond({success:true,group});
        }catch(error){console.error("Create group error:",error.message);respond({success:false,message:"Couldn't create that group."});}
    });
    socket.on("get chat media",async(chat,callback)=>{
        const respond=result=>{if(typeof callback==="function")callback(result);};
        if(!socket.username||typeof chat!=="string")return respond({success:false,media:[]});
        try{let allowed=false;if(/^group:[1-9][0-9]*$/.test(chat))allowed=await db.isGroupMember(chat.slice(6),socket.username);else{const peer=getDMPartner(chat,socket.username);allowed=Boolean(peer&&await isAcceptedFriend(socket.username,peer));}
            if(!allowed)return respond({success:false,media:[]});respond({success:true,media:await db.getChatMedia(chat)});
        }catch(error){console.error("Get chat media error:",error.message);respond({success:false,media:[]});}
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
            } else if (/^group:[1-9][0-9]*$/.test(String(chat))) {
                const groupId=String(chat).slice(6);
                if(!(await db.getGroup(groupId,socket.username))){socket.emit("chat history",[]);return;}
                history=await db.loadGroupMessages(groupId);
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

            socket.emit("chat history", await attachMessageReactions(chat === "global" ? "global" : String(chat).startsWith("group:") ? chat : makeDMChatId(socket.username, getDMPartner(chat, socket.username)), history));
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

    socket.on("chat message",async data=>{
        if(!socket.username||!data||typeof data.text!=="string")return;
        const textValue=data.text.trim().slice(0,5000),attachmentId=data.attachmentId&&/^[1-9][0-9]*$/.test(String(data.attachmentId))?String(data.attachmentId):null;
        if(!textValue&&!attachmentId)return;
        const msg={id:Date.now()+Math.random(),username:socket.username,text:textValue,replyTo:data.replyTo||null,time:data.time||Date.now()};
        if(data.chat==="global"){if(attachmentId)return;msg.chat="global";db.addMessage(msg);io.emit("chat message",msg);return;}
        try{
            if(/^group:[1-9][0-9]*$/.test(String(data.chat))){
                const groupId=String(data.chat).slice(6);if(!(await db.isGroupMember(groupId,socket.username)))return;
                if(attachmentId){const file=await db.getChatAttachment(attachmentId);if(!file||file.chat!==data.chat||file.uploader!==socket.username)return;msg.attachment_id=file.id;msg.attachment_name=file.original_name;msg.attachment_mime=file.mime_type;msg.attachment_size=file.size;}
                msg.chat=data.chat;const saved=await db.addGroupMessage({...msg,attachmentId});if(saved&&saved.id!==undefined)msg.id=saved.id;io.to(`group:${groupId}`).emit("chat message",msg);return;
            }
            const peer=getDMPartner(data.chat,socket.username);if(!peer||!(await isAcceptedFriend(socket.username,peer)))return;
            const chatId=makeDMChatId(socket.username,peer);
            if(attachmentId){const file=await db.getChatAttachment(attachmentId);if(!file||file.chat!==chatId||file.uploader!==socket.username)return;msg.attachment_id=file.id;msg.attachment_name=file.original_name;msg.attachment_mime=file.mime_type;msg.attachment_size=file.size;}
            msg.chat=chatId;msg.recipient=peer;const saved=await db.saveDM({...msg,attachmentId});if(saved&&saved.id!==undefined)msg.id=saved.id;
            socket.emit("chat message",msg);const room=`user:${peer}`,online=(io.sockets.adapter.rooms.get(room)?.size||0)>0;io.to(room).emit("chat message",msg);
            if(online){const ids=await db.markDMDelivered(chatId,peer);if(ids.length)io.to(`user:${socket.username}`).emit("messages delivered",{chat:chatId,ids});}
        }catch(error){console.error("Chat message error:",error);}
    });

    // =========================
    // PERSISTENT MESSAGE REACTIONS
    // =========================
    socket.on("toggle message reaction", async (data, callback) => {
        const respond = result => {
            if (typeof callback === "function") callback(result);
        };
        const allowedEmoji = new Set(["👍", "❤️", "😂", "🔥", "🎉", "😮", "😢", "👎", "👏", "💯"]);
        if (!socket.username || !data || data.messageId === undefined ||
            typeof data.chat !== "string" || !allowedEmoji.has(data.emoji)) {
            return respond({ success: false, message: "Invalid reaction." });
        }

        try {
            let messageExists = false;
            let peer = null;
            if (data.chat === "global") {
                messageExists = db.loadMessages().some(message =>
                    String(message.id) === String(data.messageId)
                );
            } else if (/^group:[1-9][0-9]*$/.test(String(data.chat))) {
                if(!(await db.isGroupMember(String(data.chat).slice(6),socket.username)))return respond({success:false,message:"You cannot react in this conversation."});
                const groupHistory=await db.loadGroupMessages(String(data.chat).slice(6));
                messageExists=groupHistory.some(message=>String(message.id)===String(data.messageId));
            } else {
                peer = getDMPartner(data.chat, socket.username);
                if (!peer || !(await isAcceptedFriend(socket.username, peer))) {
                    return respond({ success: false, message: "You cannot react in this conversation." });
                }
                const chatId = makeDMChatId(socket.username, peer);
                const history = await db.loadChat(chatId, socket.username, peer);
                messageExists = history.some(message =>
                    String(message.id) === String(data.messageId)
                );
            }

            if (!messageExists) {
                return respond({ success: false, message: "Message not found." });
            }

            const reactionChat = data.chat === "global" ? "global" : String(data.chat).startsWith("group:") ? data.chat : makeDMChatId(socket.username, peer);
            await db.toggleMessageReaction(data.messageId, reactionChat, socket.username, data.emoji);
            const rows = await db.getMessageReactions(reactionChat);
            const reactions = rows
                .filter(row => String(row.message_id) === String(data.messageId))
                .map(row => ({
                    emoji: row.emoji,
                    count: Number(row.count),
                    users: row.users || []
                }));
            const update = {
                messageId: String(data.messageId),
                chat: reactionChat,
                reactions
            };

            if (reactionChat === "global") {
                io.emit("message reactions updated", update);
            } else if(reactionChat.startsWith("group:")) {
                io.to(reactionChat).emit("message reactions updated",update);
            } else {
                io.to(`user:${socket.username}`).emit("message reactions updated", update);
                io.to(`user:${peer}`).emit("message reactions updated", update);
            }
            respond({ success: true, reactions });
        } catch (err) {
            console.error("Reaction error:", err);
            respond({ success: false, message: "Couldn't save that reaction." });
        }
    });

    // =========================
    // PERSONAL SAVED-MESSAGE VAULT
    // =========================
    socket.on("toggle saved message", async (data, callback) => {
        const respond = result => {
            if (typeof callback === "function") callback(result);
        };
        if (!socket.username || !data || data.messageId === undefined ||
            typeof data.chat !== "string") {
            return respond({ success: false, message: "Invalid save request." });
        }
        try {
            let source = null;
            if (data.chat === "global") {
                source = db.loadMessages().find(message =>
                    String(message.id) === String(data.messageId)
                );
            } else if(/^group:[1-9][0-9]*$/.test(String(data.chat))){
                if(!(await db.isGroupMember(String(data.chat).slice(6),socket.username)))return respond({success:false,message:"You cannot save from this conversation."});
                const groupHistory=await db.loadGroupMessages(String(data.chat).slice(6));
                source=groupHistory.find(message=>String(message.id)===String(data.messageId));
            } else {
                const peer = getDMPartner(data.chat, socket.username);
                if (!peer || !(await isAcceptedFriend(socket.username, peer))) {
                    return respond({ success: false, message: "You cannot save from this conversation." });
                }
                const history = await db.loadChat(makeDMChatId(socket.username, peer), socket.username, peer);
                source = history.find(message =>
                    String(message.id) === String(data.messageId)
                );
            }
            if (!source) {
                return respond({ success: false, message: "Message not found." });
            }
            const savedChat = data.chat === "global" ? "global" : String(data.chat).startsWith("group:") ? data.chat : makeDMChatId(socket.username, getDMPartner(data.chat, socket.username));
            const result = await db.toggleSavedMessage(socket.username, {
                id: source.id,
                chat: savedChat,
                username: source.username,
                text: source.text
            });
            respond({ success: true, saved: result.saved });
        } catch (err) {
            console.error("Save message error:", err);
            respond({ success: false, message: "Couldn't update your saved messages." });
        }
    });

    socket.on("get saved messages", async callback => {
        if (!socket.username) {
            if (typeof callback === "function") callback({ success: false, messages: [] });
            return;
        }
        try {
            const saved = await db.getSavedMessages(socket.username);
            if (typeof callback === "function") callback({ success: true, messages: saved });
        } catch (err) {
            console.error("Saved messages error:", err);
            if (typeof callback === "function") callback({ success: false, messages: [] });
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
                    presenceVisibility.delete(socket.username);

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
async function startServer() {
    try {
        await db.migratePlaintextPasswords();
    } catch (error) {
        console.error("Password security migration failed. Server startup stopped:", error.message);
        process.exit(1);
        return;
    }

    server.listen(PORT, () => {
        console.log("");
        console.log("=================================");
        console.log("🚀 Jetchat is running!");
        console.log(`🌐 Port: ${PORT}`);
        console.log("=================================");
        console.log("");
    });
}

startServer();
