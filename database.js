const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// =========================
// DATABASE FILE
// =========================
const db = new sqlite3.Database(
    path.join(__dirname, "jetchat.db")
);

// =========================
// CREATE TABLES
// =========================
db.serialize(() => {

    // USERS
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT
        )
    `);

    // FRIENDS
    db.run(`
        CREATE TABLE IF NOT EXISTS friends (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user TEXT,
            friend TEXT
        )
    `);

    // MESSAGES (for later DMs + chat history)
    db.run(`
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender TEXT,
            receiver TEXT,
            message TEXT,
            time TEXT
        )
    `);

});

module.exports = db;
