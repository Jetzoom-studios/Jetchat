const fs = require("fs");
const path = require("path");

// =========================
// FILE PATHS
// =========================
const usersFile = path.join(__dirname, "users.json");

// =========================
// LOAD USERS
// =========================
function loadUsers() {
    if (!fs.existsSync(usersFile)) return [];
    return JSON.parse(fs.readFileSync(usersFile, "utf8"));
}

// =========================
// SAVE USERS
// =========================
function saveUsers(users) {
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

// =========================
// CREATE USER
// =========================
function createUser(username, password) {

    const users = loadUsers();

    const exists = users.find(u => u.username === username);
    if (exists) return { success: false, message: "Username already exists" };

    users.push({ username, password });

    saveUsers(users);

    return { success: true };
}

// =========================
// LOGIN USER
// =========================
function loginUser(username, password) {

    const users = loadUsers();

    const user = users.find(
        u => u.username === username && u.password === password
    );

    if (!user) {
        return { success: false, message: "Invalid login" };
    }

    return { success: true };
}

module.exports = {
    createUser,
    loginUser
};
