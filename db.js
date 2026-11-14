const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { promisify } = require("util");
const { Pool } = require("pg");

const scryptAsync = promisify(crypto.scrypt);
const PASSWORD_HASH_PREFIX = "scrypt";
const PASSWORD_SCRYPT_OPTIONS = {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024
};

async function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const derivedKey = await scryptAsync(
        String(password),
        salt,
        64,
        PASSWORD_SCRYPT_OPTIONS
    );

    return [
        PASSWORD_HASH_PREFIX,
        PASSWORD_SCRYPT_OPTIONS.N,
        PASSWORD_SCRYPT_OPTIONS.r,
        PASSWORD_SCRYPT_OPTIONS.p,
        salt.toString("hex"),
        derivedKey.toString("hex")
    ].join("$");
}

async function verifyPassword(password, storedValue) {
    if (typeof storedValue !== "string" || !storedValue.startsWith(PASSWORD_HASH_PREFIX + "$")) {
        return false;
    }

    const parts = storedValue.split("$");
    if (parts.length !== 6) return false;

    const [, nValue, rValue, pValue, saltHex, hashHex] = parts;
    const N = Number(nValue);
    const r = Number(rValue);
    const p = Number(pValue);

    if (
        !Number.isInteger(N) || N < 16384 ||
        !Number.isInteger(r) || r < 1 ||
        !Number.isInteger(p) || p < 1 ||
        !/^[a-f0-9]{32}$/i.test(saltHex) ||
        !/^[a-f0-9]{128}$/i.test(hashHex)
    ) return false;

    const expected = Buffer.from(hashHex, "hex");
    const actual = await scryptAsync(
        String(password),
        Buffer.from(saltHex, "hex"),
        expected.length,
        { N, r, p, maxmem: 64 * 1024 * 1024 }
    );

    return crypto.timingSafeEqual(actual, expected);
}

function publicUser(row) {
    if (!row) return null;
    return {
        id: row.id,
        username: row.username,
        avatar: row.avatar || "",
        bio: row.bio || "",
        join_date: row.join_date,
        show_online: row.show_online !== false
    };
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Run each additive schema migration once per server process.
const schemaMigrations = new Map();

async function runSchemaMigration(key, sql) {
    if (!schemaMigrations.has(key)) {
        const migration = pool.query(sql).catch(error => {
            schemaMigrations.delete(key);
            throw error;
        });

        schemaMigrations.set(key, migration);
    }

    await schemaMigrations.get(key);
}

// =========================
// FILE PATHS
// =========================
const usersFile = path.join(__dirname, "users.json");
const messagesFile = path.join(__dirname, "messages.json");
const friendsFile = path.join(__dirname, "friends.json");

// =========================
// CREATE FILES IF MISSING
// =========================
function ensureFile(file) {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, "[]");
    }
}

ensureFile(usersFile);
ensureFile(messagesFile);
ensureFile(friendsFile);

// =========================
// USERS
// =========================
function loadUsers() {
    return JSON.parse(
        fs.readFileSync(usersFile, "utf8")
    );
}

function saveUsers(users) {
    fs.writeFileSync(
        usersFile,
        JSON.stringify(users, null, 2)
    );
}

// =========================
// CREATE USER
// =========================
async function createUser(username, password) {
    await ensureShowOnlineColumn();

    const existing = await pool.query(
        "SELECT id FROM users WHERE username = $1",
        [username]
    );

    if (existing.rows.length > 0) {
        return {
            success: false,
            message: "Username already exists"
        };
    }

    const passwordHash = await hashPassword(password);
    const result = await pool.query(
        `
        INSERT INTO users
        (
            username,
            password,
            avatar,
            bio,
            join_date
        )
        VALUES ($1, $2, '', '', NOW())
        RETURNING id, username, avatar, bio, join_date, show_online
        `,
        [username, passwordHash]
    );

    return {
        success: true,
        user: publicUser(result.rows[0])
    };
}

// =========================
// LOGIN
// =========================
async function ensureShowOnlineColumn() {
    await runSchemaMigration(
        "users.show_online",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS show_online BOOLEAN NOT NULL DEFAULT TRUE"
    );
}

async function loginUser(username, password) {
    await ensureShowOnlineColumn();

    const result = await pool.query(
        `
        SELECT *
        FROM users
        WHERE username = $1
        LIMIT 1
        `,
        [username]
    );

    if (result.rows.length === 0) {
        return {
            success: false,
            message: "Invalid login"
        };
    }

    const validPassword = await verifyPassword(password, result.rows[0].password);
    if (!validPassword) {
        return {
            success: false,
            message: "Invalid login"
        };
    }

    return {
        success: true,
        user: publicUser(result.rows[0])
    };
}

// =========================
// MESSAGES
// =========================
function loadMessages() {
    return JSON.parse(
        fs.readFileSync(
            messagesFile,
            "utf8"
        )
    );
}

function saveMessages(messages) {
    fs.writeFileSync(
        messagesFile,
        JSON.stringify(
            messages,
            null,
            2
        )
    );
}

function addMessage(message) {

    const messages = loadMessages();

    messages.push(message);

    // Keep only latest 200
    if (messages.length > 200) {
        messages.shift();
    }

    saveMessages(messages);
}

// =========================
// SAVE DM
// =========================
async function saveDM(message) {
    await ensureAttachmentsSchema();
    const result = await pool.query(
        `INSERT INTO messages (username, recipient, text, chat, time, attachment_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [message.username, message.recipient, message.text, message.chat, message.time, message.attachmentId || null]
    );

    return result.rows[0] || null;
}


// =========================
// DIRECT MESSAGE DELIVERY / READ STATUS
// =========================
async function ensureDMStatusColumns() {
    await Promise.all([
        runSchemaMigration(
            "messages.delivered_at",
            "ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ"
        ),
        runSchemaMigration(
            "messages.read_at",
            "ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ"
        )
    ]);
}

async function markDMDelivered(chat, recipient) {
    await ensureDMStatusColumns();

    const result = await pool.query(
        `
        UPDATE messages
        SET delivered_at = NOW()
        WHERE chat = $1
          AND recipient = $2
          AND delivered_at IS NULL
        RETURNING id
        `,
        [chat, recipient]
    );

    return result.rows.map(row => row.id);
}

async function markDMRead(chat, reader) {
    await ensureDMStatusColumns();

    const result = await pool.query(
        `
        UPDATE messages
        SET delivered_at = COALESCE(delivered_at, NOW()),
            read_at = NOW()
        WHERE chat = $1
          AND recipient = $2
          AND read_at IS NULL
        RETURNING id
        `,
        [chat, reader]
    );

    return result.rows.map(row => row.id);
}

// =========================
// LOAD CHAT
// =========================
async function loadChat(chat, username, peer) {

    await ensureAttachmentsSchema();
    let query = `
        SELECT m.*, a.original_name AS attachment_name, a.mime_type AS attachment_mime, a.size AS attachment_size
        FROM messages m LEFT JOIN chat_attachments a ON a.id = m.attachment_id
        WHERE m.chat = $1 ORDER BY m.id ASC
    `;

    let params = [chat];

    if (username && peer) {
        query = `
            SELECT m.*, a.original_name AS attachment_name, a.mime_type AS attachment_mime, a.size AS attachment_size
            FROM messages m LEFT JOIN chat_attachments a ON a.id = m.attachment_id
            WHERE m.chat = $1 OR (m.username = $2 AND m.recipient = $3)
               OR (m.username = $3 AND m.recipient = $2) OR m.recipient IN ($4, $5)
            ORDER BY m.id ASC
        `;

        params = [
            chat,
            username,
            peer,
            `${username}|${peer}`,
            `${peer}|${username}`
        ];
    }

    const result = await pool.query(query, params);

    // Normalize legacy rows to the single canonical chat ID used by the client.
    return result.rows.map(message => ({
        ...message,
        chat
    }));

}



// =========================
// DIRECT MESSAGE CONVERSATIONS + PINS
// =========================
async function ensureDMPinsTable() {
    await runSchemaMigration(
        "dm_pins.table",
        `CREATE TABLE IF NOT EXISTS dm_pins (
            owner_username TEXT NOT NULL,
            peer_username TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (owner_username, peer_username)
        )`
    );
}

async function getDMConversations(username) {
    await ensureDMPinsTable();
    await ensureDMStatusColumns();

    const result = await pool.query(
        `
        WITH conversation_messages AS (
            SELECT
                CASE
                    WHEN username = $1 THEN recipient
                    ELSE username
                END AS peer,
                id,
                username AS last_sender,
                text AS last_message,
                time AS last_message_time,
                COUNT(*) FILTER (
                    WHERE recipient = $1 AND read_at IS NULL
                ) OVER (
                    PARTITION BY CASE
                        WHEN username = $1 THEN recipient
                        ELSE username
                    END
                ) AS unread_count
            FROM messages
            WHERE (username = $1 OR recipient = $1)
              AND recipient IS NOT NULL
        ),
        latest_conversations AS (
            SELECT DISTINCT ON (peer)
                peer,
                id AS last_message_id,
                last_sender,
                last_message,
                last_message_time,
                unread_count
            FROM conversation_messages
            WHERE peer IS NOT NULL AND peer <> ''
            ORDER BY peer, id DESC
        )
        SELECT
            latest_conversations.*,
            (dm_pins.peer_username IS NOT NULL) AS pinned
        FROM latest_conversations
        LEFT JOIN dm_pins
            ON dm_pins.owner_username = $1
           AND dm_pins.peer_username = latest_conversations.peer
        ORDER BY
            (dm_pins.peer_username IS NOT NULL) DESC,
            latest_conversations.last_message_id DESC
        `,
        [username]
    );

    return result.rows;
}

async function setDMPin(username, peer, pinned) {
    await ensureDMPinsTable();

    if (pinned) {
        await pool.query(
            `
            INSERT INTO dm_pins (owner_username, peer_username)
            VALUES ($1, $2)
            ON CONFLICT (owner_username, peer_username) DO NOTHING
            `,
            [username, peer]
        );
    } else {
        await pool.query(
            "DELETE FROM dm_pins WHERE owner_username = $1 AND peer_username = $2",
            [username, peer]
        );
    }

    return { success: true };
}

// =========================
// EDIT MESSAGE
// =========================
function editMessage(id, newText) {

    const messages = loadMessages();

    const message = messages.find(
        m => m.id === id
    );

    if (!message) {
        return false;
    }

    message.text = newText;
    message.edited = true;

    saveMessages(messages);

    return true;
}

// =========================
// DELETE MESSAGE
// =========================
function deleteMessage(id) {

    let messages = loadMessages();

    const originalLength = messages.length;

    messages = messages.filter(
        m => m.id !== id
    );

    if (messages.length === originalLength) {
        return false;
    }

    saveMessages(messages);

    return true;
}

// =========================
// LAST SEEN
// =========================
async function ensureLastSeenColumn() {
    await runSchemaMigration(
        "users.last_seen",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ"
    );
}

async function ensureProfileColorColumn() {
    await runSchemaMigration(
        "users.profile_color",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_color TEXT DEFAULT '#5865f2'"
    );
}

async function updateLastSeen(username) {
    await ensureLastSeenColumn();

    await pool.query(
        "UPDATE users SET last_seen = NOW() WHERE username = $1",
        [username]
    );

    return { success: true };
}

// =========================
// GET PROFILE
// =========================
async function ensureCustomStatusColumn() {
    await runSchemaMigration(
        "users.custom_status",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_status TEXT NOT NULL DEFAULT ''"
    );
}

async function ensureProfileCustomizationColumns() {
    await runSchemaMigration(
        "users.profile_customization",
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT NOT NULL DEFAULT '';
         ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_accent TEXT NOT NULL DEFAULT '#8d70ff';
         ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_banner_style TEXT NOT NULL DEFAULT 'aurora';
         ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_card_style TEXT NOT NULL DEFAULT 'glass';`
    );
}

async function getProfile(username) {
    await ensureLastSeenColumn();
    await ensureProfileColorColumn();
    await ensureShowOnlineColumn();
    await ensureCustomStatusColumn();
    await ensureProfileCustomizationColumns();

    console.log("Searching for username:", username);

    const result = await pool.query(
        `
        SELECT
            username,
            avatar,
            bio,
            join_date,
            last_seen,
            profile_color,
            show_online,
            custom_status,
            display_name,
            profile_accent,
            profile_banner_style,
            profile_card_style
        FROM users
        WHERE username = $1
        `,
        [username]
    );

    console.log(result.rows);

    if (result.rows.length === 0) {
        return { success: false };
    }

    return {
        success: true,
        profile: result.rows[0]
    };
}

// =========================
// SEND FRIEND REQUEST
// =========================
async function sendFriendRequest(sender, receiver) {

    if (sender === receiver) {
        return {
            success: false,
            message: "You can't add yourself."
        };
    }

    const existing = await pool.query(
        `
        SELECT *
        FROM friends
        WHERE
        (sender = $1 AND receiver = $2)
        OR
        (sender = $2 AND receiver = $1)
        `,
        [sender, receiver]
    );

    if (existing.rows.length > 0) {
        return {
            success: false,
            message: "Friend request already exists."
        };
    }

    await pool.query(
    `
    INSERT INTO friends
    (sender, receiver, status)
    VALUES ($1, $2, 'pending')
    `,
    [sender, receiver]
);

    return {
        success: true
    };
}
// =========================
// UPDATE PRESENCE PRIVACY
// =========================
async function updateShowOnline(username, showOnline) {
    await ensureShowOnlineColumn();

    await pool.query(
        "UPDATE users SET show_online = $1 WHERE username = $2",
        [!!showOnline, username]
    );

    return { success: true };
}

// =========================
// UPDATE BIO
// =========================
async function updateBio(username, bio) {

    await pool.query(
        `
        UPDATE users
        SET bio = $1
        WHERE username = $2
        `,
        [bio, username]
    );

    return {
        success: true
    };
}

// =========================
// UPDATE AVATAR
// =========================
async function updateAvatar(username, avatar) {

    await pool.query(
        `
        UPDATE users
        SET avatar = $1
        WHERE username = $2
        `,
        [avatar, username]
    );

    return {
        success: true
    };

}

// =========================
// UPDATE PROFILE
// =========================
async function updateProfile(oldUsername, newUsername, bio, profileColor, customStatus, displayName, profileAccent, bannerStyle, cardStyle) {
    await ensureProfileColorColumn();
    await ensureCustomStatusColumn();
    await ensureProfileCustomizationColumns();

    await pool.query(
        `
        UPDATE users
        SET username = $1,
            bio = $2,
            profile_color = $3,
            custom_status = $4,
            display_name = $5,
            profile_accent = $6,
            profile_banner_style = $7,
            profile_card_style = $8
        WHERE username = $9
        `,
        [newUsername, bio, profileColor, customStatus, displayName, profileAccent, bannerStyle, cardStyle, oldUsername]
    );

    return {
        success: true
    };

}

// =========================
// GET FRIEND REQUESTS
// =========================
async function getFriendRequests(username) {

    const result = await pool.query(
        `
        SELECT sender
FROM friends
WHERE receiver = $1
AND status = 'pending'
        `,
        [username]
    );

    return result.rows;

}

// =========================
// ACCEPT FRIEND REQUEST
// =========================
async function acceptFriendRequest(sender, receiver) {

    await pool.query(
        `
        UPDATE friends
        SET status = 'accepted'
        WHERE sender = $1
        AND receiver = $2
        `,
        [sender, receiver]
    );

    return {
        success: true
    };

}

// =========================
// GET FRIENDS
// =========================
// =========================
// SEARCH USERS FOR FRIEND DISCOVERY
// =========================
async function searchUsers(query, requester) {
    const term = String(query || "").trim().slice(0, 20);
    if (term.length < 2) return [];

    const result = await pool.query(
        `
        SELECT
            u.username,
            COALESCE(u.avatar, '') AS avatar,
            COALESCE(u.bio, '') AS bio,
            CASE
                WHEN f.status = 'accepted' THEN 'friend'
                WHEN f.status = 'pending' AND f.sender = $2 THEN 'sent'
                WHEN f.status = 'pending' AND f.receiver = $2 THEN 'received'
                ELSE 'none'
            END AS relationship
        FROM users u
        LEFT JOIN friends f
          ON (f.sender = $2 AND f.receiver = u.username)
          OR (f.sender = u.username AND f.receiver = $2)
        WHERE LOWER(u.username) LIKE LOWER($1)
          AND u.username <> $2
        ORDER BY
            CASE WHEN LOWER(u.username) = LOWER($3) THEN 0 ELSE 1 END,
            LOWER(u.username)
        LIMIT 20
        `,
        [`%${term}%`, requester, term]
    );

    return result.rows;
}

async function getFriends(username) {

    const result = await pool.query(
        `
        SELECT
            CASE
                WHEN sender = $1 THEN receiver
                ELSE sender
            END AS friend
        FROM friends
        WHERE
            (sender = $1 OR receiver = $1)
            AND status = 'accepted'
        `,
        [username]
    );

    return result.rows;

}

// =========================
// UPDATE LOG DISMISSALS
// =========================

async function ensureUpdateDismissalsTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS user_update_dismissals (
            user_id TEXT NOT NULL,
            update_id TEXT NOT NULL,
            dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (user_id, update_id)
        )
    `);
}

async function hasDismissedUpdate(userId, updateId) {
    await ensureUpdateDismissalsTable();

    const result = await pool.query(
        `
        SELECT 1
        FROM user_update_dismissals
        WHERE user_id = $1
        AND update_id = $2
        LIMIT 1
        `,
        [String(userId), updateId]
    );

    return result.rows.length > 0;
}

async function dismissUpdate(userId, updateId) {
    await ensureUpdateDismissalsTable();

    await pool.query(
        `
        INSERT INTO user_update_dismissals
            (user_id, update_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id, update_id) DO NOTHING
        `,
        [String(userId), updateId]
    );

    return { success: true };
}



// =========================
// MESSAGE REACTIONS + SAVED MESSAGES
// =========================
async function ensureMessageReactionsTable() {
    await runSchemaMigration(
        "message_reactions.table",
        `CREATE TABLE IF NOT EXISTS message_reactions (
            message_id TEXT NOT NULL,
            chat TEXT NOT NULL,
            username TEXT NOT NULL,
            emoji TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (message_id, chat, username, emoji)
        )`
    );
}

async function getMessageReactions(chat) {
    await ensureMessageReactionsTable();
    const result = await pool.query(
        `SELECT message_id, emoji, COUNT(*)::INT AS count,
                ARRAY_AGG(username ORDER BY username) AS users
         FROM message_reactions
         WHERE chat = $1
         GROUP BY message_id, emoji
         ORDER BY message_id, emoji`,
        [chat]
    );
    return result.rows;
}

async function toggleMessageReaction(messageId, chat, username, emoji) {
    await ensureMessageReactionsTable();
    const values = [String(messageId), chat, username, emoji];
    const removed = await pool.query(
        `DELETE FROM message_reactions
         WHERE message_id = $1 AND chat = $2 AND username = $3 AND emoji = $4
         RETURNING message_id`,
        values
    );
    if (!removed.rowCount) {
        await pool.query(
            `INSERT INTO message_reactions (message_id, chat, username, emoji)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (message_id, chat, username, emoji) DO NOTHING`,
            values
        );
        return { active: true };
    }
    return { active: false };
}

async function ensureSavedMessagesTable() {
    await runSchemaMigration(
        "saved_messages.table",
        `CREATE TABLE IF NOT EXISTS saved_messages (
            id BIGSERIAL PRIMARY KEY,
            saver_username TEXT NOT NULL,
            message_id TEXT NOT NULL,
            chat TEXT NOT NULL,
            author_username TEXT NOT NULL,
            message_text TEXT NOT NULL,
            saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (saver_username, message_id, chat)
        )`
    );
}

async function toggleSavedMessage(username, message) {
    await ensureSavedMessagesTable();
    const messageId = String(message.id);
    const existing = await pool.query(
        `SELECT id FROM saved_messages
         WHERE saver_username = $1 AND message_id = $2 AND chat = $3`,
        [username, messageId, message.chat]
    );
    if (existing.rows.length) {
        await pool.query("DELETE FROM saved_messages WHERE id = $1", [existing.rows[0].id]);
        return { saved: false };
    }
    await pool.query(
        `INSERT INTO saved_messages
            (saver_username, message_id, chat, author_username, message_text)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (saver_username, message_id, chat) DO NOTHING`,
        [username, messageId, message.chat, message.username, message.text]
    );
    return { saved: true };
}

async function getSavedMessages(username) {
    await ensureSavedMessagesTable();
    const result = await pool.query(
        `SELECT id, message_id, chat, author_username, message_text, saved_at
         FROM saved_messages
         WHERE saver_username = $1
         ORDER BY saved_at DESC
         LIMIT 500`,
        [username]
    );
    return result.rows;
}

// =========================
// PERSISTENT AUTH SESSIONS
// =========================
async function ensureAuthSessionsTable() {
    await runSchemaMigration(
        "auth_sessions.table",
        `CREATE TABLE IF NOT EXISTS auth_sessions (
            token_hash TEXT PRIMARY KEY,
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL,
            last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            user_agent TEXT NOT NULL DEFAULT ''
        );
        ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS user_agent TEXT NOT NULL DEFAULT '';
        CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx
            ON auth_sessions(user_id);
        CREATE INDEX IF NOT EXISTS auth_sessions_expires_at_idx
            ON auth_sessions(expires_at);`
    );
}

function hashSessionToken(token) {
    return crypto.createHash("sha256").update(String(token)).digest("hex");
}

async function createAuthSession(userId, userAgent = "") {
    await ensureAuthSessionsTable();
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashSessionToken(token);
    await pool.query(
        `INSERT INTO auth_sessions (token_hash, user_id, expires_at, user_agent)
         VALUES ($1, $2, NOW() + INTERVAL '30 days', $3)`,
        [tokenHash, userId, String(userAgent || "").slice(0, 500)]
    );
    return { token, sessionHash: tokenHash };
}

async function listAuthSessions(userId) {
    await ensureAuthSessionsTable();
    const result = await pool.query(
        `SELECT token_hash, user_agent, created_at, last_used_at, expires_at
         FROM auth_sessions WHERE user_id = $1 AND expires_at > NOW()
         ORDER BY last_used_at DESC`, [userId]
    );
    return result.rows;
}

async function revokeAuthSessionForUser(sessionHash, userId, currentSessionHash) {
    if (typeof sessionHash !== "string" || !/^[a-f0-9]{64}$/i.test(sessionHash) || sessionHash === currentSessionHash) return null;
    await ensureAuthSessionsTable();
    const result = await pool.query(
        `DELETE FROM auth_sessions WHERE token_hash = $1 AND user_id = $2 RETURNING token_hash`,
        [sessionHash, userId]
    );
    return result.rows[0] || null;
}

async function revokeOtherAuthSessions(userId, currentSessionHash) {
    await ensureAuthSessionsTable();
    const result = await pool.query(
        `DELETE FROM auth_sessions WHERE user_id = $1 AND token_hash <> $2 RETURNING token_hash`,
        [userId, currentSessionHash]
    );
    return result.rows.map(row => row.token_hash);
}

async function touchAuthSession(sessionHash) {
    if (typeof sessionHash !== "string" || !/^[a-f0-9]{64}$/i.test(sessionHash)) return;
    await ensureAuthSessionsTable();
    await pool.query(
        `UPDATE auth_sessions SET last_used_at = NOW()
         WHERE token_hash = $1 AND last_used_at < NOW() - INTERVAL '5 minutes'`,
        [sessionHash]
    );
}

async function changeAccountPassword(username, currentPassword, newPassword, currentSessionHash) {
    await ensureAuthSessionsTable();
    const result = await pool.query("SELECT id, password FROM users WHERE username = $1 LIMIT 1", [username]);
    if (!result.rows.length || !(await verifyPassword(currentPassword, result.rows[0].password))) {
        return { success: false, message: "Your current password is incorrect." };
    }
    const passwordHash = await hashPassword(newPassword);
    await pool.query("UPDATE users SET password = $1 WHERE id = $2", [passwordHash, result.rows[0].id]);
    const revokedSessions = await revokeOtherAuthSessions(result.rows[0].id, currentSessionHash);
    return { success: true, revokedSessions };
}

async function getAuthSession(token) {
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) return null;
    await ensureAuthSessionsTable();
    const tokenHash = hashSessionToken(token);
    const result = await pool.query(
        `SELECT s.token_hash, u.id, u.username, u.avatar, u.bio,
                u.join_date, u.show_online
         FROM auth_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = $1 AND s.expires_at > NOW()
         LIMIT 1`,
        [tokenHash]
    );
    if (!result.rows.length) {
        await pool.query(
            "DELETE FROM auth_sessions WHERE token_hash = $1 AND expires_at <= NOW()",
            [tokenHash]
        );
        return null;
    }
    await pool.query(
        "UPDATE auth_sessions SET last_used_at = NOW() WHERE token_hash = $1",
        [tokenHash]
    );
    return {
        user: publicUser(result.rows[0]),
        sessionHash: result.rows[0].token_hash
    };
}

async function revokeAuthSession(token) {
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) return null;
    await ensureAuthSessionsTable();
    const tokenHash = hashSessionToken(token);
    const result = await pool.query(
        "DELETE FROM auth_sessions WHERE token_hash = $1 RETURNING user_id",
        [tokenHash]
    );
    return result.rows[0] || null;
}

// Convert every existing plaintext password before the server accepts
// connections. The migration is idempotent and never logs password values.
async function migratePlaintextPasswords() {
    await ensureShowOnlineColumn();
    await ensureAuthSessionsTable();

    const result = await pool.query(
        "SELECT id, password FROM users"
    );

    let migrated = 0;
    for (const row of result.rows) {
        if (typeof row.password === "string" && row.password.startsWith(PASSWORD_HASH_PREFIX + "$")) {
            continue;
        }

        const passwordHash = await hashPassword(row.password || "");
        await pool.query(
            "UPDATE users SET password = $1 WHERE id = $2",
            [passwordHash, row.id]
        );
        migrated += 1;
    }

    console.log(`Password security migration complete. Hashed ${migrated} legacy account(s).`);
    return { migrated };
}



// GROUP CHATS + POSTGRESQL-BACKED CHAT ATTACHMENTS
async function ensureGroupsSchema() {
    await runSchemaMigration("groups.schema", `
        CREATE TABLE IF NOT EXISTS chat_groups (
            id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, created_by TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS chat_group_members (
            group_id BIGINT NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
            username TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member',
            joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (group_id, username)
        );
        CREATE INDEX IF NOT EXISTS chat_group_members_username_idx ON chat_group_members(username);
    `);
}
async function ensureAttachmentsSchema() {
    await Promise.all([
        runSchemaMigration("messages.attachment_id", "ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_id BIGINT"),
        runSchemaMigration("chat_attachments.table", `
            CREATE TABLE IF NOT EXISTS chat_attachments (
                id BIGSERIAL PRIMARY KEY, chat TEXT NOT NULL, uploader TEXT NOT NULL,
                original_name TEXT NOT NULL, mime_type TEXT NOT NULL, size INTEGER NOT NULL,
                data BYTEA NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS chat_attachments_chat_idx ON chat_attachments(chat);
        `)
    ]);
}
async function createGroup(name, creator, members) {
    await ensureGroupsSchema();
    const client=await pool.connect();
    try {
        await client.query("BEGIN");
        const inserted=await client.query("INSERT INTO chat_groups (name,created_by) VALUES ($1,$2) RETURNING id,name,created_by,created_at",[name,creator]);
        const group=inserted.rows[0], allMembers=[...new Set([creator,...(members||[])])];
        for(const member of allMembers) await client.query("INSERT INTO chat_group_members (group_id,username,role) VALUES ($1,$2,$3)",[group.id,member,member===creator?"admin":"member"]);
        await client.query("COMMIT"); return {...group,members:allMembers};
    } catch(error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
async function getUserGroups(username) {
    await ensureGroupsSchema();
    const result=await pool.query(
        `SELECT g.id,g.name,g.created_by,g.created_at,COUNT(gm.username)::INT AS member_count,
          COALESCE((SELECT m.text FROM messages m WHERE m.chat='group:'||g.id::TEXT ORDER BY m.id DESC LIMIT 1),'') AS last_message,
          (SELECT m.username FROM messages m WHERE m.chat='group:'||g.id::TEXT ORDER BY m.id DESC LIMIT 1) AS last_sender,
          (SELECT m.time FROM messages m WHERE m.chat='group:'||g.id::TEXT ORDER BY m.id DESC LIMIT 1) AS last_message_time
         FROM chat_groups g JOIN chat_group_members mine ON mine.group_id=g.id AND mine.username=$1
         JOIN chat_group_members gm ON gm.group_id=g.id GROUP BY g.id
         ORDER BY COALESCE((SELECT MAX(m.id) FROM messages m WHERE m.chat='group:'||g.id::TEXT),g.id) DESC`,[username]);
    return result.rows;
}
async function isGroupMember(groupId,username) {
    await ensureGroupsSchema();
    const result=await pool.query("SELECT 1 FROM chat_group_members WHERE group_id=$1 AND username=$2 LIMIT 1",[groupId,username]);
    return result.rowCount>0;
}
async function getGroup(groupId,username) {
    await ensureGroupsSchema();
    const result=await pool.query(`SELECT g.id,g.name,g.created_by,ARRAY_AGG(gm.username ORDER BY gm.joined_at) AS members
        FROM chat_groups g JOIN chat_group_members gm ON gm.group_id=g.id
        WHERE g.id=$1 AND EXISTS(SELECT 1 FROM chat_group_members mine WHERE mine.group_id=g.id AND mine.username=$2)
        GROUP BY g.id`,[groupId,username]);
    return result.rows[0]||null;
}
async function addGroupMessage(message) {
    await ensureAttachmentsSchema();
    const result=await pool.query(`INSERT INTO messages (username,recipient,text,chat,time,attachment_id)
        VALUES ($1,NULL,$2,$3,$4,$5) RETURNING id`,[message.username,message.text,message.chat,message.time,message.attachmentId||null]);
    return result.rows[0]||null;
}
async function loadGroupMessages(groupId) {
    await ensureAttachmentsSchema();
    const result=await pool.query(`SELECT m.*,a.original_name AS attachment_name,a.mime_type AS attachment_mime,a.size AS attachment_size
        FROM messages m LEFT JOIN chat_attachments a ON a.id=m.attachment_id WHERE m.chat=$1 ORDER BY m.id ASC`,[`group:${groupId}`]);
    return result.rows;
}
async function storeChatAttachment(chat,uploader,file) {
    await ensureAttachmentsSchema();
    const result=await pool.query(`INSERT INTO chat_attachments (chat,uploader,original_name,mime_type,size,data)
        VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,original_name,mime_type,size`,
        [chat,uploader,String(file.originalname||"attachment").slice(0,180),file.mimetype,file.size,file.buffer]);
    return result.rows[0];
}
async function getChatAttachment(id) {
    await ensureAttachmentsSchema();
    const result=await pool.query("SELECT id,chat,uploader,original_name,mime_type,size,data FROM chat_attachments WHERE id=$1 LIMIT 1",[id]);
    return result.rows[0]||null;
}
async function getChatMedia(chat) {
    await ensureAttachmentsSchema();
    const result=await pool.query("SELECT id,original_name,mime_type,size,uploader,created_at FROM chat_attachments WHERE chat=$1 ORDER BY created_at DESC LIMIT 100",[chat]);
    return result.rows;
}

// =========================
// EXPORTS
// =========================
module.exports = {

    createUser,
    loginUser,
    createAuthSession,
    getAuthSession,
    revokeAuthSession,
    listAuthSessions,
    revokeAuthSessionForUser,
    revokeOtherAuthSessions,
    touchAuthSession,
    changeAccountPassword,
    migratePlaintextPasswords,

    getProfile,
    getDMConversations,
    setDMPin,
    updateLastSeen,
    updateShowOnline,
    updateBio,
    updateAvatar,
    updateProfile,

    sendFriendRequest,
    getFriendRequests,
    acceptFriendRequest,
    getFriends,
    searchUsers,

    loadMessages,
     loadChat,
     addMessage,
      saveDM,
    markDMDelivered,
    markDMRead,
    
    editMessage,
    deleteMessage,
    saveMessages,

    hasDismissedUpdate,
dismissUpdate,
ensureUpdateDismissalsTable,
    getMessageReactions,
    toggleMessageReaction,
    toggleSavedMessage,
    getSavedMessages,
    ensureGroupsSchema,
    ensureAttachmentsSchema,
    createGroup,
    getUserGroups,
    isGroupMember,
    getGroup,
    addGroupMessage,
    loadGroupMessages,
    storeChatAttachment,
    getChatAttachment,
    getChatMedia,

};
