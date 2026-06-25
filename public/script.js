const socket = io();

// =========================
// TAB STATE + UNREAD SYSTEM
// =========================
let isTabActive = true;
let unreadCount = 0;

// =========================
// TYPING SYSTEM
// =========================
const typingIndicator = document.getElementById("typingIndicator");
let typingUsers = new Set();
let typingTimeout;

// =========================
// NOTIFICATION SOUND
// =========================
let audioCtx;

function playNotificationSound() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.type = "sine";
    osc.frequency.value = 800;

    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
}

// =========================
// TAB VISIBILITY
// =========================
document.addEventListener("visibilitychange", () => {
    isTabActive = !document.hidden;

    if (isTabActive) {
        unreadCount = 0;
        document.title = "Jetchat 2.0";
    }
});

// =========================
// LOGIN ELEMENTS
// =========================
const loginScreen = document.getElementById("loginScreen");
const app = document.getElementById("app");

const usernameInput = document.getElementById("usernameInput");
const passwordInput = document.getElementById("passwordInput");

const loginButton = document.getElementById("loginButton");
const signupButton = document.getElementById("signupButton");

// =========================
// CHAT ELEMENTS
// =========================
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const messages = document.getElementById("messages");
const onlineCount = document.getElementById("onlineCount");

let username = "";

// =========================
// EMOJI PICKER (NEW)
// =========================
const emojiButton = document.getElementById("emojiButton");
const emojiPicker = document.getElementById("emojiPicker");

// toggle emoji picker
emojiButton.addEventListener("click", (e) => {
    e.preventDefault();

    if (!emojiPicker) return;

    emojiPicker.style.display =
        emojiPicker.style.display === "flex" ? "none" : "flex";
});

// insert emoji into input
if (emojiPicker) {
    emojiPicker.querySelectorAll("span").forEach((emoji) => {
        emoji.addEventListener("click", () => {
            messageInput.value += emoji.textContent;
            messageInput.focus();
        });
    });
}

// close emoji picker when clicking outside
document.addEventListener("click", (e) => {
    if (!emojiPicker || !emojiButton) return;

    if (
        !emojiPicker.contains(e.target) &&
        e.target !== emojiButton
    ) {
        emojiPicker.style.display = "none";
    }
});

// =========================
// START CHAT
// =========================
function startChat(user) {
    username = user;

    loginScreen.style.display = "none";
    app.style.display = "flex";

    socket.emit("join", username);

    messageInput.focus();
}

// =========================
// LOGIN
// =========================
loginButton.addEventListener("click", () => {
    const user = usernameInput.value.trim();
    const pass = passwordInput.value.trim();

    if (!user || !pass) {
        alert("Enter username and password");
        return;
    }

    socket.emit("login", { username: user, password: pass }, (res) => {
        if (!res.success) {
            alert(res.message);
            return;
        }

        startChat(user);
    });
});

// =========================
// SIGNUP
// =========================
signupButton.addEventListener("click", () => {
    const user = usernameInput.value.trim();
    const pass = passwordInput.value.trim();

    if (!user || !pass) {
        alert("Enter username and password");
        return;
    }

    socket.emit("signup", { username: user, password: pass }, (res) => {
        if (!res.success) {
            alert(res.message);
            return;
        }

        alert("Account created! Now log in.");
    });
});

// =========================
// SEND MESSAGE
// =========================
chatForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const text = messageInput.value.trim();
    if (!text) return;

    socket.emit("chat message", {
        username,
        text,
        time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
        })
    });

    messageInput.value = "";
});

// =========================
// TYPING (IMPROVED - LESS SPAM)
// =========================
let typingSent = false;

messageInput.addEventListener("input", () => {
    if (!typingSent) {
        socket.emit("typing", username);
        typingSent = true;

        setTimeout(() => {
            typingSent = false;
        }, 1000);
    }
});

// =========================
// RECEIVE MESSAGES
// =========================
socket.on("chat message", (data) => {
    const message = document.createElement("div");

    if (data.system) {
        message.className = "system-wrapper";
        message.innerHTML = `<div class="system-message">${data.text}</div>`;
    } else {
        message.className = "message";
        message.innerHTML = `
            <div class="username">${data.username}</div>
            <div>${data.text}</div>
            <div class="time">${data.time}</div>
        `;
    }

    messages.appendChild(message);
    messages.scrollTop = messages.scrollHeight;

    if (!isTabActive) {
        unreadCount++;
        document.title = `(${unreadCount}) Jetchat 2.0`;
        playNotificationSound();
    }
});

// =========================
// TYPING USERS
// =========================
socket.on("typing users", (users) => {
    typingUsers = new Set(users);

    if (typingUsers.size === 0) {
        typingIndicator.textContent = "";
        return;
    }

    const list = Array.from(typingUsers);

    if (list.length === 1) {
        typingIndicator.textContent = `${list[0]} is typing...`;
    } else {
        typingIndicator.textContent = `${list.join(", ")} are typing...`;
    }

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        typingIndicator.textContent = "";
    }, 2000);
});

// =========================
// ONLINE COUNT
// =========================
socket.on("online count", (count) => {
    onlineCount.textContent = `• ${count} online`;
});
