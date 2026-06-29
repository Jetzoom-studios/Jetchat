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

// Discord grouping
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

const emojiButton = document.getElementById("emojiButton");
const emojiPicker = document.getElementById("emojiPicker");

const profileModal = document.getElementById("profileModal");
const profileUsername = document.getElementById("profileUsername");
const profileBio = document.getElementById("profileBio");
const profileJoinDate = document.getElementById("profileJoinDate");
const profileAvatar = document.getElementById("profileAvatar");
const avatarInput = document.getElementById("avatarInput");
const closeProfile = document.getElementById("closeProfile");
const editProfileBtn = document.getElementById("editProfileBtn");
const avatarInput = document.getElementById("avatarInput");

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
function findMessageElement(text, username) {
    return [...document.querySelectorAll(".message")].reverse().find(msg => {
        const textEl = msg.querySelector(".text");
        const userEl = msg.querySelector(".username");

        if (!textEl) return false;

        return textEl.textContent === text &&
            (!username || userEl?.textContent === username);
    });
}

// =========================
// REPLY SYSTEM
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
// LOGIN
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
// EMOJI
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
// RECEIVE MESSAGES
// =========================
socket.on("chat message", (data) => {

    const message = document.createElement("div");

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
        ${isGrouped ? "" : `<div class="username clickable">${data.username}</div>`}

        <div class="message-body">
            <div class="text">${data.text}</div>
            <div class="time">${data.time}</div>
        </div>

        <div class="message-toolbar">
            <button class="react-btn">😊</button>
            <button class="reply-btn">↩</button>
            <button class="edit-btn">✏️</button>
            <button class="delete-btn">🗑️</button>
        </div>
    `;

    const usernameElement = message.querySelector(".username");

if (usernameElement) {
    usernameElement.style.cursor = "pointer";

    usernameElement.onclick = () => {
        console.log("CLICKED:", data.username);
        alert("Clicked " + data.username);
        openProfile(data.username);
    };
}

    message.querySelector(".reply-btn").addEventListener("click", () => {
        startReply({ username: data.username, text: data.text });
    });

    message.querySelector(".edit-btn").addEventListener("click", () => {
        const oldText = data.text;
        const newText = prompt("Edit message:", oldText);

        if (!newText || newText === oldText) return;

        socket.emit("edit message", { oldText, newText });

        const el = findMessageElement(oldText, data.username);
        if (el) el.querySelector(".text").textContent = newText;
    });

    message.querySelector(".delete-btn").addEventListener("click", () => {
        if (!confirm("Delete this message?")) return;

        socket.emit("delete message", data.text);

        const el = findMessageElement(data.text, data.username);
        if (el) el.remove();
    });

    messages.appendChild(message);
    messages.scrollTop = messages.scrollHeight;

    lastMessageUser = data.username;
    lastMessageElement = message;
});

// =========================
// SOCKET EVENTS
// =========================
socket.on("chat message edited", (data) => {
    const el = findMessageElement(data.oldText, data.username);
    if (el) el.querySelector(".text").textContent = data.newText;
});

socket.on("chat message deleted", (data) => {
    const el = findMessageElement(data.text, data.username);
    if (el) el.remove();
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

socket.on("typing users", (users) => {
    typingUsers = new Set(users);

    const list = [...typingUsers];

    typingIndicator.innerHTML =
        list.length ? `${list.join(", ")} is typing...` : "";

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

// =========================
// PROFILE SYSTEM
// =========================

function openProfile(username) {

    console.log("Opening profile:", username);

    socket.emit("get profile", username, (res) => {

        console.log("PROFILE RESPONSE:", res);

        if (!res.success) {
            return alert("Couldn't load profile.");
        }

        profileUsername.textContent = res.profile.username;
        profileBio.textContent = res.profile.bio || "No bio yet.";
        profileJoinDate.textContent =
            new Date(res.profile.join_date).toLocaleDateString();

        profileAvatar.src =
            res.profile.avatar || "/default-avatar.png";

        profileModal.style.display = "flex";

    });

}

closeProfile.addEventListener("click", () => {
    profileModal.style.display = "none";
});

/* =========================
   ⚙ SETTINGS + THEME SYSTEM (ADDED)
========================= */

const settingsBtn = document.getElementById("settingsBtn");
const settingsPanel = document.getElementById("settingsPanel");
const closeSettings = document.getElementById("closeSettings");

const darkModeToggle = document.getElementById("darkModeToggle");
const lightModeToggle = document.getElementById("lightModeToggle");

// open settings
if (settingsBtn && settingsPanel) {
    settingsBtn.addEventListener("click", () => {
        settingsPanel.style.display =
            settingsPanel.style.display === "block" ? "none" : "block";
    });
}

// close settings
if (closeSettings) {
    closeSettings.addEventListener("click", () => {
        settingsPanel.style.display = "none";
    });
}

// DARK MODE
if (darkModeToggle) {
    darkModeToggle.addEventListener("change", () => {
        if (darkModeToggle.checked) {
            document.body.classList.add("dark-mode");
            document.body.classList.remove("light-mode");
            if (lightModeToggle) lightModeToggle.checked = false;
        } else {
            document.body.classList.remove("dark-mode");
        }
    });
}

// LIGHT MODE
if (lightModeToggle) {
    lightModeToggle.addEventListener("change", () => {
        if (lightModeToggle.checked) {
            document.body.classList.add("light-mode");
            document.body.classList.remove("dark-mode");
            if (darkModeToggle) darkModeToggle.checked = false;
        } else {
            document.body.classList.remove("light-mode");
        }
    });
}

editProfileBtn.addEventListener("click", () => {

    const choice = prompt(
`What do you want to edit?

1 = Bio
2 = Avatar`
    );

    if (choice === "1") {

        const bio = prompt("Enter your new bio:");

        if (bio === null) return;

        socket.emit("update bio", bio, (res) => {

            if (!res.success) {
                return alert("Couldn't save bio.");
            }

            profileBio.textContent = bio;

            alert("Bio updated!");

        });

    }

    else if (choice === "2") {

        avatarInput.click();

    }

});

avatarInput.addEventListener("change", async () => {

    if (!avatarInput.files.length) return;

    const formData = new FormData();

    formData.append("avatar", avatarInput.files[0]);

    try {

        const upload = await fetch("/upload-avatar", {

            method: "POST",

            body: formData

        });

        const data = await upload.json();

        if (!data.success) {
            return alert("Upload failed.");
        }

        socket.emit("update avatar", data.avatar, (res) => {

            if (!res.success) {
                return alert("Couldn't save avatar.");
            }

            profileAvatar.src = data.avatar;

            alert("Avatar updated!");

        });

    } catch (err) {

        console.error(err);

        alert("Upload failed.");

    }

});
