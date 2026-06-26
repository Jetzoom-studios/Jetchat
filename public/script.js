const socket = io();

// =========================
// STATE
// =========================
let isTabActive = true;
let unreadCount = 0;
let username = "";

let typingUsers = new Set();
let typingTimeout;
let typingSent = false;

let replyingTo = null;
let replyPreview;

let lastMessageUser = null;
let lastMessageElement = null;

// =========================
// DOM
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
// HELPERS
// =========================
function findMessageElementById(id) {
    return document.querySelector(`.message[data-id="${id}"]`);
}

// =========================
// REPLY
// =========================
function createReplyPreview() {
    replyPreview = document.createElement("div");
    replyPreview.style.display = "none";
    replyPreview.style.padding = "6px 10px";
    replyPreview.style.background = "#2b2d31";
    replyPreview.style.borderLeft = "3px solid #5865F2";
    replyPreview.style.marginBottom = "6px";

    chatForm.parentNode.insertBefore(replyPreview, chatForm);
}
createReplyPreview();

function startReply(data) {
    replyingTo = data;

    replyPreview.innerHTML = `
        <strong>Replying to ${data.username}</strong><br>
        ${data.text}
        <button id="cancelReply" type="button" style="float:right;">✕</button>
    `;

    replyPreview.style.display = "block";

    document.getElementById("cancelReply").onclick = () => {
        replyingTo = null;
        replyPreview.style.display = "none";
    };
}

// =========================
// LOGIN
// =========================
function startChat(user) {
    username = user;

    loginScreen.style.display = "none";
    app.style.display = "flex";

    socket.emit("join", username);
}

// =========================
// AUTH
// =========================
loginButton.addEventListener("click", () => {
    const user = usernameInput.value.trim();
    const pass = passwordInput.value.trim();

    socket.emit("login", { username: user, password: pass }, (res) => {
        if (!res.success) return alert(res.message);
        startChat(user);
    });
});

signupButton.addEventListener("click", () => {
    const user = usernameInput.value.trim();
    const pass = passwordInput.value.trim();

    socket.emit("signup", { username: user, password: pass }, (res) => {
        if (!res.success) return alert(res.message);
        alert("Account created!");
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
        text,
        replyTo: replyingTo
    });

    messageInput.value = "";
    replyingTo = null;
    replyPreview.style.display = "none";

    playSound(900);
});

// =========================
// RECEIVE MESSAGE
// =========================
socket.on("chat message", (data) => {

    const el = document.createElement("div");
    el.className = "message";

    el.dataset.id = data.id; // IMPORTANT

    el.innerHTML = `
        <div class="username">${data.username}</div>

        ${data.replyTo ? `
            <div class="reply-preview">
                <strong>${data.replyTo.username}</strong>: ${data.replyTo.text}
            </div>
        ` : ""}

        <div class="text">${data.text}</div>
        <div class="time">${data.time || ""}</div>

        <button class="edit-btn">✏️</button>
        <button class="delete-btn">🗑️</button>
    `;

    // REPLY
    el.querySelector(".username").addEventListener("click", () => {
        startReply({
            username: data.username,
            text: data.text
        });
    });

    // EDIT
    el.querySelector(".edit-btn").addEventListener("click", () => {

        const newText = prompt("Edit message:", data.text);
        if (!newText || newText === data.text) return;

        socket.emit("edit message", {
            id: data.id,
            newText
        });
    });

    // DELETE
    el.querySelector(".delete-btn").addEventListener("click", () => {

        if (!confirm("Delete message?")) return;

        socket.emit("delete message", {
            id: data.id
        });
    });

    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
});

// =========================
// SYNC EDIT
// =========================
socket.on("chat message edited", (data) => {

    const el = findMessageElementById(data.id);
    if (el) {
        el.querySelector(".text").textContent = data.newText;
    }
});

// =========================
// SYNC DELETE
// =========================
socket.on("chat message deleted", (data) => {

    const el = findMessageElementById(data.id);
    if (el) {
        el.remove();
    }
});

// =========================
// ONLINE + TYPING
// =========================
socket.on("online count", (count) => {
    onlineCount.textContent = `• ${count} online`;
});

socket.on("typing users", (users) => {
    typingIndicator.textContent = users.length
        ? `${users.join(", ")} is typing...`
        : "";
});
