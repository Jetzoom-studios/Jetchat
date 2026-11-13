```javascript
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
        chat: currentChat,
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
function displayMessage(data) {

    const wasNearBottom = chatContainer
        ? chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight < 140
        : true;

    if (
        currentChat === "global"
            ? data.chat !== "global"
            : !data.chat.includes(currentChat)
    ) {
        return;
    }

    const message = document.createElement("div");

    if (data.system) {
        message.className = "system-wrapper";
        message.innerHTML = `<div class="system-message">${data.text}</div>`;

        messages.appendChild(message);

        if (wasNearBottom) {
            scrollChatToBottom(true);
        }

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
            <button class="reply-btn">↩️</button>
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

    if (wasNearBottom || data.username === username) {
        scrollChatToBottom(true);
    }

    lastMessageUser = data.username;
    lastMessageElement = message;
}

socket.on("chat message", displayMessage);

socket.on("chat message received", displayMessage);

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
// CHAT HISTORY
// =========================
socket.on("chat history", (history) => {

    messages.innerHTML = "";

    lastMessageUser = null;
    lastMessageElement = null;

    history.forEach(msg => {
        displayMessage(msg);
    });

    scrollChatToBottom(false);
});

// =========================
// PROFILE SYSTEM
// =========================

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
        chat: currentChat,
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
function displayMessage(data) {

    const wasNearBottom = chatContainer
        ? chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight < 140
        : true;

    if (
        currentChat === "global"
            ? data.chat !== "global"
            : !data.chat.includes(currentChat)
    ) {
        return;
    }

    const message = document.createElement("div");

    if (data.system) {
        message.className = "system-wrapper";
        message.innerHTML = `<div class="system-message">${data.text}</div>`;

        messages.appendChild(message);

        if (wasNearBottom) {
            scrollChatToBottom(true);
        }

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

    if (wasNearBottom || data.username === username) {
        scrollChatToBottom(true);
    }

    lastMessageUser = data.username;
    lastMessageElement = message;
}

socket.on("chat message", displayMessage);

socket.on("chat message received", displayMessage);

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
// CHAT HISTORY
// =========================
socket.on("chat history", (history) => {

    messages.innerHTML = "";

    lastMessageUser = null;
    lastMessageElement = null;

    history.forEach(msg => {
        displayMessage(msg);
    });

    scrollChatToBottom(false);
});

// =========================
// PROFILE SYSTEM
// =========================

function openProfile(targetUsername) {

    console.log("Opening profile:", targetUsername);

    socket.emit("get profile", targetUsername, (res) => {

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

        if (res.profile.username === username) {
            addFriendBtn.style.display = "none";
        } else {
            addFriendBtn.style.display = "block";
        }

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

const editProfileModal = document.getElementById("editProfileModal");
const closeEditProfile = document.getElementById("closeEditProfile");

const editAvatarPreview = document.getElementById("editAvatarPreview");
const editUsername = document.getElementById("editUsername");
const editBio = document.getElementById("editBio");
const saveProfileBtn = document.getElementById("saveProfileBtn");
const changeAvatarBtn = document.getElementById("changeAvatarBtn");

editProfileBtn.addEventListener("click", () => {

    editAvatarPreview.src = profileAvatar.src;
    editUsername.value = profileUsername.textContent;
    editBio.value = profileBio.textContent;

    profileModal.style.display = "none";
    editProfileModal.style.display = "flex";

});

closeEditProfile.addEventListener("click", () => {

    editProfileModal.style.display = "none";
    profileModal.style.display = "flex";

});

changeAvatarBtn.addEventListener("click", () => {

    avatarInput.click();

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

saveProfileBtn.addEventListener("click", () => {

    socket.emit("update profile", {
        username: editUsername.value.trim(),
        bio: editBio.value.trim()
    }, (res) => {

        if (!res.success) {
            return alert(res.message);
        }

        profileUsername.textContent = editUsername.value;
        profileBio.textContent = editBio.value;

        editProfileModal.style.display = "none";
        profileModal.style.display = "flex";

        alert("Profile updated!");

    });

});

// =========================
// FRIEND REQUEST BUTTON
// =========================
const addFriendBtn = document.getElementById("addFriendBtn");

addFriendBtn.addEventListener("click", () => {

    const target = profileUsername.textContent;

    socket.emit("send friend request", target, (res) => {

        if (!res.success) {
            return alert(res.message);
        }

        alert("Friend request sent!");

    });

});

// =========================
// LOAD FRIEND REQUESTS
// =========================
function loadFriendRequests() {

    const container =
        document.getElementById("friendRequests");

    socket.emit("get friend requests", (requests) => {

        container.innerHTML = "";

        if (!requests.length) {
            container.textContent = "No requests";
            return;
        }

        requests.forEach(request => {

            const div = document.createElement("div");

            div.innerHTML = `
                ${request.sender}
                <button class="acceptFriendBtn">
                    Accept
                </button>
            `;

            const button =
                div.querySelector(".acceptFriendBtn");

            button.addEventListener("click", () => {

                socket.emit(
                    "accept friend request",
                    request.sender,
                    (res) => {

                        if (!res.success) {
                            return alert("Couldn't accept request.");
                        }

                        alert("Friend request accepted!");

                        loadFriendRequests();

                    }
                );

            });

            container.appendChild(div);

        });

    });

}

// =========================
// LIVE FRIEND UPDATES
// ========================

socket.on("friends updated", () => {

    loadFriendRequests();
    loadFriends();

});

// =========================
// GLOBAL CHAT BUTTON
// =========================
globalChatBtn.addEventListener("click", () => {

    currentChat = "global";

    document.querySelector(".chat-title h2").textContent =
        "Global Chat";

    messages.innerHTML = "";

    socket.emit("load chat", "global");

});
