const socket = io();

// =========================
// TAB STATE + UNREAD SYSTEM
// =========================
let isTabActive = true;
let unreadCount = 0;

// =========================
// TYPING SYSTEM (STEP 4)
// =========================
const typingIndicator = document.getElementById("typingIndicator");
let typingUsers = new Set();
let typingTimeout;

// =========================
// NOTIFICATION SOUND (KEEP FROM STEP 3)
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
const joinButton = document.getElementById("joinButton");

// =========================
// CHAT ELEMENTS
// =========================
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const messages = document.getElementById("messages");
const onlineCount = document.getElementById("onlineCount");

let username = "";

// =========================
// JOIN CHAT
// =========================
joinButton.addEventListener("click", () => {

    username = usernameInput.value.trim();

    if (!username) {
        alert("Please enter a username.");
        return;
    }

    loginScreen.style.display = "none";
    app.style.display = "flex";

    socket.emit("join", username);

    messageInput.focus();
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
// TYPING EMIT (STEP 4 CLIENT)
// =========================
messageInput.addEventListener("input", () => {

    socket.emit("typing", username);

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

    // =========================
    // STEP 2 + 3 (UNREAD + SOUND)
    // =========================
    if (!isTabActive) {

        unreadCount++;
        document.title = `(${unreadCount}) Jetchat 2.0`;

        playNotificationSound();
    }
});

// =========================
// RECEIVE TYPING USERS (STEP 4)
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

    // auto-clear after inactivity safety
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
