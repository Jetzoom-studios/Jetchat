const fs = require("fs");
const path = require("path");

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
function createUser(username, password) {

    const users = loadUsers();

    const exists = users.find(
        u => u.username === username
    );

    if (exists) {

        return {
            success: false,
            message: "Username already exists"
        };

    }

    users.push({

        username,
        password

    });

    saveUsers(users);

    return {

        success: true

    };

}

// =========================
// LOGIN
// =========================
function loginUser(username, password) {

    const users = loadUsers();

    const user = users.find(

        u =>
            u.username === username &&
            u.password === password

    );

    if (!user) {

        return {

            success: false,
            message: "Invalid login"

        };

    }

    return {

        success: true

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

    // Keep only the latest 200 messages
    if (messages.length > 200) {

        messages.shift();

    }

    saveMessages(messages);

}

module.exports = {

    createUser,
    loginUser,

    loadMessages,
    addMessage

};
