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

    // Keep only latest 200
    if (messages.length > 200) {
        messages.shift();
    }

    saveMessages(messages);
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
// EXPORTS
// =========================
module.exports = {

    createUser,
    loginUser,

    loadMessages,
    addMessage,

    editMessage,
    deleteMessage

};
