const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

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
        VALUES
        (
            $1,
            $2,
            '',
            '',
            NOW()
        )
        RETURNING *
        `,
        [username, password]
    );

    return {
        success: true,
        user: result.rows[0]
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
        AND password = $2
        `,
        [username, password]
    );

    if (result.rows.length === 0) {
        return {
            success: false,
            message: "Invalid login"
        };
    }

    return {
        success: true,
        user: result.rows[0]
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

    const result = await pool.query(
        `
        INSERT INTO messages
        (
            username,
            recipient,
            text,
            chat,
            time
        )
        VALUES
        (
            $1,
            $2,
            $3,
            $4,
            $5
        )
        RETURNING id
        `,
        [
            message.username,
            message.recipient,
            message.text,
            message.chat,
            message.time
        ]
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

    let query = `
        SELECT *
        FROM messages
        WHERE chat = $1
        ORDER BY id ASC
    `;

    let params = [chat];

    if (username && peer) {
        query = `
            SELECT *
            FROM messages
            WHERE
                chat = $1
                OR (username = $2 AND recipient = $3)
                OR (username = $3 AND recipient = $2)
                OR recipient IN ($4, $5)
            ORDER BY id ASC
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
            latest_conversations.last_message_time DESC NULLS LAST,
            latest_conversations.peer ASC
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

async function getProfile(username) {
    await ensureLastSeenColumn();
    await ensureProfileColorColumn();
    await ensureShowOnlineColumn();
    await ensureCustomStatusColumn();

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
            custom_status
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
async function updateProfile(oldUsername, newUsername, bio, profileColor, customStatus) {
    await ensureProfileColorColumn();
    await ensureCustomStatusColumn();

    await pool.query(
        `
        UPDATE users
        SET username = $1,
            bio = $2,
            profile_color = $3,
            custom_status = $4
        WHERE username = $5
        `,
        [newUsername, bio, profileColor, customStatus, oldUsername]
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
// EXPORTS
// =========================
module.exports = {

    createUser,
    loginUser,

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

};
