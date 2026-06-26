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

// reply system
let replyingTo = null;
let replyPreview;

// DISCORD GROUPING STATE
let lastMessageUser = null;
let lastMessageElement = null;

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
// REPLY SYSTEM (SAFE INIT)
// =========================
function createReplyPreview() {
    replyPreview = document.createElement("div");
    replyPreview.id = "replyPreview";
    replyPreview.style.display = "none";
    replyPreview.style.padding = "6px 10px";
    replyPreview.style.background = "#2b2d31";
    replyPreview.style.borderLeft = "3px solid #5865F2";
    replyPreview.style.fontSize = "13px";
    replyPreview.style.marginBottom = "6px";
    replyPreview.style.borderRadius = "6px";

    chatForm.parentNode.insertBefore(replyPreview, chatForm);
}

createReplyPreview();

function startReply(data) {
    replyingTo = data;

    replyPreview.innerHTML = `
        <strong>Replying to ${data.username}</strong><br>
        ${data.text}
        <button id="cancelReply" type="button" style="float:right;cursor:pointer;">✕</button>
    `;

    replyPreview.style.display = "block";

    document.getElementById("cancelReply").onclick = () => {
        replyingTo = null;
        replyPreview.style.display = "none";
    };

    messageInput.focus();
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
        replyTo: replyingTo,
        time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
        })
    });

    replyingTo = null;
    replyPreview.style.display = "none";

    messageInput.value = "";
    playSound(900);
});

// =========================
// RECEIVE MESSAGES (DISCORD GROUPING)
// =========================
socket.on("chat message", (data) => {
    const message = document.createElement("div");

    // reset grouping on system messages
    if (data.system) {
        message.className = "system-wrapper";
        message.innerHTML = `<div class="system-message">${data.text}</div>`;

        messages.appendChild(message);
        messages.scrollTop = messages.scrollHeight;

        lastMessageUser = null;
        lastMessageElement = null;
        return;
    }

    message.className = "message";

    const isGrouped =
        data.username === lastMessageUser &&
        lastMessageElement &&
        !lastMessageElement.classList.contains("system-wrapper");

    message.innerHTML = `
        ${isGrouped ? "" : `<div class="username">${data.username}</div>`}

        ${data.replyTo ? `
            <div class="reply-preview">
                <div class="reply-bar"></div>
                <div class="reply-content">
                    <span class="reply-user">${data.replyTo.username}</span>
                    <span class="reply-text">${data.replyTo.text}</span>
                </div>
            </div>
        ` : ""}

        <div class="text">${data.text}</div>
        <div class="time">${data.time}</div>

        <div class="message-toolbar">
    <button class="react-btn" title="Add Reaction">😊</button>
    <button class="reply-btn" title="Reply">↩</button>
    <button class="edit-btn" title="Edit">✏️</button>
    <button class="delete-btn" title="Delete">🗑️</button>
    <button class="more-btn" title="More">⋯</button>
</div>

<div class="reactions"></div>
    `;

    message.querySelector(".reply-btn").addEventListener("click", () => {
        startReply({
            username: data.username,
            text: data.text
        });
    });

    message.querySelector(".react-btn").addEventListener("click", () => {
    playSound(600);
});

message.querySelector(".edit-btn").addEventListener("click", () => {
    // Edit feature coming soon
});

message.querySelector(".delete-btn").addEventListener("click", () => {
    // Delete feature coming soon
});

message.querySelector(".more-btn").addEventListener("click", () => {
    // More menu coming soon
});

    if (isGrouped) {
        message.style.marginTop = "2px";
    }

    messages.appendChild(message);
    messages.scrollTop = messages.scrollHeight;

    lastMessageUser = data.username;
    lastMessageElement = message;

    if (!isTabActive) {
        unreadCount++;
        document.title = `(${unreadCount}) Jetchat 2.0`;
        playSound(800);
    }
});

// =========================
// TYPING
// =========================
messageInput.addEventListener("input", () => {
    if (!typingSent) {
        socket.emit("typing", username);
        typingSent = true;
        setTimeout(() => typingSent = false, 1000);
    }
});

// =========================
// TYPING INDICATOR
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
            ${list.join(", ")} is typing...
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
