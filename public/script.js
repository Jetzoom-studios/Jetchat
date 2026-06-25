const socket = io();

// =========================
// STATE
// =========================
let isTabActive = true;
let unreadCount = 0;

let username = "";

// typing system
let typingUsers = new Set();
let typingTimeout;
let typingSent = false;

// =========================
// DOM ELEMENTS
// =========================
const loginScreen = document.getElementById("loginScreen");
const app = document.getElementById("app");

const usernameInput = document.getElementById("usernameInput");
const passwordInput = document.getElementById("passwordInput");

const loginButton = document.getElementById("loginButton");
const signupButton = document.getElementById("signupButton");

const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const messages = document.getElementById("messages");
const onlineCount = document.getElementById("onlineCount");
const typingIndicator = document.getElementById("typingIndicator");

// emoji
const emojiButton = document.getElementById("emojiButton");
const emojiPicker = document.getElementById("emojiPicker");

// =========================
// SOUND
// =========================
let audioCtx;

function playSound(freq = 800) {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.type = "sine";
    osc.frequency.value = freq;

    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.08);
}

// =========================
// TAB STATE
// =========================
document.addEventListener("visibilitychange", () => {
    isTabActive = !document.hidden;

    if (isTabActive) {
        unreadCount = 0;
        document.title = "Jetchat 2.0";
    }
});

// =========================
// LOGIN FLOW
// =========================
function startChat(user) {
    username = user;

    loginScreen.style.display = "none";
    app.style.display = "flex";

    socket.emit("join", username);

    messageInput.focus();
}

loginButton.addEventListener("click", () => {
    const user = usernameInput.value.trim();
    const pass = passwordInput.value.trim();

    if (!user || !pass) return alert("Enter username and password");

    socket.emit("login", { username: user, password: pass }, (res) => {
        if (!res.success) return alert(res.message);
        startChat(user);
    });
});

signupButton.addEventListener("click", () => {
    const user = usernameInput.value.trim();
    const pass = passwordInput.value.trim();

    if (!user || !pass) return alert("Enter username and password");

    socket.emit("signup", { username: user, password: pass }, (res) => {
        if (!res.success) return alert(res.message);
        alert("Account created! Now log in.");
    });
});

// =========================
// EMOJI SYSTEM
// =========================
emojiButton.addEventListener("click", (e) => {
    e.preventDefault();
    emojiPicker.style.display =
        emojiPicker.style.display === "flex" ? "none" : "flex";
});

emojiPicker.querySelectorAll("span").forEach(e => {
    e.addEventListener("click", () => {
        messageInput.value += e.textContent;
        messageInput.focus();
    });
});

document.addEventListener("click", (e) => {
    if (!emojiPicker.contains(e.target) && e.target !== emojiButton) {
        emojiPicker.style.display = "none";
    }
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
    playSound(900);
});

// =========================
// TYPING (OPTIMIZED)
// =========================
messageInput.addEventListener("input", () => {
    if (!typingSent) {
        socket.emit("typing", username);
        typingSent = true;

        setTimeout(() => typingSent = false, 1000);
    }
});

// =========================
// RECEIVE MESSAGES (DISCORD STYLE)
// =========================
socket.on("chat message", (data) => {
    const message = document.createElement("div");

    if (data.system) {
        message.className = "system-wrapper";
        message.innerHTML = `<div class="system-message">${data.text}</div>`;
    } else {
        message.className = "message";
        message.style.opacity = "0";
        message.style.transform = "translateY(10px)";

        message.innerHTML = `
            <div class="username">${data.username}</div>
            <div class="text">${data.text}</div>
            <div class="time">${data.time}</div>

            <!-- REACTIONS -->
            <div class="reactions">
                <button class="react">👍</button>
                <button class="react">😂</button>
                <button class="react">❤️</button>
            </div>
        `;

        // animate in (Discord feel)
        setTimeout(() => {
            message.style.transition = "0.2s ease";
            message.style.opacity = "1";
            message.style.transform = "translateY(0)";
        }, 10);

        // reaction system (local only for now)
        message.querySelectorAll(".react").forEach(btn => {
            btn.addEventListener("click", () => {
                btn.classList.toggle("active");
                playSound(600);
            });
        });
    }

    messages.appendChild(message);
    messages.scrollTop = messages.scrollHeight;

    if (!isTabActive) {
        unreadCount++;
        document.title = `(${unreadCount}) Jetchat 2.0`;
        playSound(800);
    }
});

// =========================
// TYPING INDICATOR (DISCORD STYLE)
// =========================
socket.on("typing users", (users) => {
    typingUsers = new Set(users);

    const list = [...typingUsers];

    if (list.length === 0) {
        typingIndicator.innerHTML = "";
        return;
    }

    typingIndicator.innerHTML = `
        <span class="typing-dots">
            ${list.join(", ")} is typing
            <span>.</span><span>.</span><span>.</span>
        </span>
    `;

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        typingIndicator.innerHTML = "";
    }, 2000);
});

// =========================
// ONLINE COUNT
// =========================
socket.on("online count", (count) => {
    onlineCount.textContent = `• ${count} online`;
});
