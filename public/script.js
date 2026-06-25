const socket = io();

// Login Elements
const loginScreen = document.getElementById("loginScreen");
const app = document.getElementById("app");
const usernameInput = document.getElementById("usernameInput");
const joinButton = document.getElementById("joinButton");

// Chat Elements
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

    if (username === "") {
        alert("Please enter a username.");
        return;
    }

    loginScreen.style.display = "none";
    app.style.display = "flex";

    socket.emit("join", username);

    messageInput.focus();

});

usernameInput.addEventListener("keydown", (e) => {

    if (e.key === "Enter") {
        joinButton.click();
    }

});

// =========================
// SEND MESSAGE
// =========================

chatForm.addEventListener("submit", (e) => {

    e.preventDefault();

    const text = messageInput.value.trim();

    if (text === "") return;

    socket.emit("chat message", {

        username: username,

        text: text,

        time: new Date().toLocaleTimeString([], {

            hour: "2-digit",
            minute: "2-digit"

        })

    });

    messageInput.value = "";
    messageInput.focus();

});

// =========================
// RECEIVE MESSAGE
// =========================

socket.on("chat message", (data) => {

    if (data.system) {

        const wrapper = document.createElement("div");
        wrapper.className = "system-wrapper";

        wrapper.innerHTML = `
            <div class="system-message">
                ${data.text}
            </div>
        `;

        messages.appendChild(wrapper);

    } else {

        const message = document.createElement("div");
        message.className = "message";

        message.innerHTML = `
            <div class="username">${data.username}</div>
            <div>${data.text}</div>
            <div class="time">${data.time}</div>
        `;

        messages.appendChild(message);

    }

    messages.scrollTop = messages.scrollHeight;

});

// =========================
// ONLINE COUNT
// =========================

socket.on("online count", (count) => {

    onlineCount.textContent = `• ${count} online`;

});