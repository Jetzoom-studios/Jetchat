
const socket = io();

// =========================
// STATE
// =========================
let isTabActive = true;
let unreadCount = 0;
const unreadByChat = Object.create(null);
let username = "";
let currentChat = "global";
let groupConversationCache = [];
let onlineUsernames = new Set();
let currentProfileColor = "#5865f2";

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
const chatContainer = document.getElementById("chatContainer");
const onlineCount = document.getElementById("onlineCount");
const onlineUsersContainer = document.getElementById("onlineUsers");
const notificationBadge = document.getElementById("notificationBadge");
const notificationContainer = document.getElementById("notificationContainer");
const typingIndicator = document.getElementById("typingIndicator");

const emojiButton = document.getElementById("emojiButton");
const emojiPicker = document.getElementById("emojiPicker");

const profileModal = document.getElementById("profileModal");
const profileUsername = document.getElementById("profileUsername");
const profileBio = document.getElementById("profileBio");
const profileJoinDate = document.getElementById("profileJoinDate");
const profileAvatar = document.getElementById("profileAvatar");
const profileBanner = document.getElementById("profileBanner");
const avatarInput = document.getElementById("avatarInput");
const closeProfile = document.getElementById("closeProfile");
const editProfileBtn = document.getElementById("editProfileBtn");

const globalChatBtn = document.getElementById("globalChatBtn");
const dmListContainer = document.getElementById("dmList");
const dmSearchInput = document.getElementById("dmSearchInput");
const dmConversationCount = document.getElementById("dmConversationCount");
const messageSearchInput = document.getElementById("messageSearchInput");
const profileCustomStatus = document.getElementById("profileCustomStatus");
const authFeedback = document.getElementById("authFeedback");
const captchaWidget = document.getElementById("captchaWidget");
const captchaStatus = document.getElementById("captchaStatus");
let captchaToken = "";
let captchaWidgetId = null;
let captchaReady = false;
let captchaInitialized = false;
let reconnectAfterSessionEnd = false;

function setCaptchaStatus(message, isError = false) {
    if (!captchaStatus) return;
    captchaStatus.textContent = message;
    captchaStatus.classList.toggle("is-error", isError);
}

function updateAuthButtons() {
    const enabled = captchaReady && Boolean(captchaToken);
    loginButton.disabled = !enabled;
    signupButton.disabled = !enabled;
}

function resetCaptcha(message = "Please complete the security check.") {
    captchaToken = "";
    updateAuthButtons();
    if (window.turnstile && captchaWidgetId !== null) {
        window.turnstile.reset(captchaWidgetId);
    }
    setCaptchaStatus(message);
}

async function initializeCaptcha() {
    if (captchaInitialized) return;
    captchaInitialized = true;
    try {
        const response = await fetch("/api/captcha-config", { cache: "no-store" });
        if (!response.ok) throw new Error("Could not load CAPTCHA configuration.");
        const config = await response.json();

        if (!config.enabled || !config.siteKey) {
            setCaptchaStatus("Security check is not configured yet. Please contact the Jetchat administrator.", true);
            return;
        }

        window.onJetchatTurnstileLoad = () => {
            if (!window.turnstile || !captchaWidget) {
                setCaptchaStatus("Security check could not load. Refresh and try again.", true);
                return;
            }

            captchaWidgetId = window.turnstile.render(captchaWidget, {
                sitekey: config.siteKey,
                theme: "auto",
                action: "jetchat-auth",
                callback: token => {
                    captchaToken = token;
                    captchaReady = true;
                    updateAuthButtons();
                    setCaptchaStatus("Verification complete. You can continue.");
                },
                "expired-callback": () => resetCaptcha("Verification expired. Please try again."),
                "error-callback": () => {
                    captchaReady = false;
                    resetCaptcha("Security check failed to load. Please refresh.", true);
                }
            });
            setCaptchaStatus("Complete the security check to continue.");
        };

        const loader = document.createElement("script");
        loader.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onJetchatTurnstileLoad&render=explicit";
        loader.async = true;
        loader.defer = true;
        loader.onerror = () => setCaptchaStatus("Security check could not load. Check your connection and refresh.", true);
        document.head.appendChild(loader);
    } catch (error) {
        console.error("CAPTCHA setup error:", error);
        setCaptchaStatus("Security check is unavailable. Please refresh later.", true);
    }
}

const friendSearchInput = document.getElementById("friendSearchInput");
const friendSearchResults = document.getElementById("friendSearchResults");

let dmConversationCache = [];

// =========================
// CHAT SCROLL CONTROLS
// =========================
function scrollChatToBottom(smooth = true) {
    if (!chatContainer) return;

    chatContainer.scrollTo({
        top: chatContainer.scrollHeight,
        behavior: smooth ? "smooth" : "auto"
    });
}

function scrollChatToTop() {
    if (!chatContainer) return;

    chatContainer.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

if (chatContainer) {
    const scrollControls = document.createElement("div");
    scrollControls.className = "chat-scroll-controls";
    scrollControls.innerHTML = `
        <button type="button" class="chat-scroll-up" aria-label="Scroll to top" title="Scroll to top">↑</button>
        <button type="button" class="chat-scroll-down" aria-label="Scroll to bottom" title="Scroll to bottom">↓</button>
    `;

    chatContainer.appendChild(scrollControls);

    scrollControls.querySelector(".chat-scroll-up")
        .addEventListener("click", scrollChatToTop);

    scrollControls.querySelector(".chat-scroll-down")
        .addEventListener("click", () => scrollChatToBottom(true));
}

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
function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function findMessageElementById(id) {
    if (id === undefined || id === null) return null;

    return [...messages.querySelectorAll(".message")].find(message => {
        return String(message.dataset.messageId) === String(id);
    }) || null;
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

function cancelReply() {
    replyingTo = null;
    replyPreview.style.display = "none";
    replyPreview.innerHTML = "";
}

function startReply(data) {
    replyingTo = {
        id: data.id,
        username: data.username,
        text: data.text
    };

    replyPreview.innerHTML = `
        <strong>Replying to ${escapeHTML(data.username)}</strong><br>
        ${escapeHTML(data.text)}
        <button id="cancelReply" type="button" style="float:right;cursor:pointer;">✕</button>
    `;

    replyPreview.style.display = "block";

    document.getElementById("cancelReply").onclick = cancelReply;

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

    loadFriendRequests();
    loadFriends();
    loadDMConversations();
    loadGroups();
    loadUpdateNotice();

    if (window.openJetchatSocial) window.openJetchatSocial("home");
    messageInput.focus();
}

function showSignedOutScreen() {
    username = "";
    currentChat = "global";
    app.style.display = "none";
    loginScreen.style.display = "flex";
    passwordInput.value = "";
    resetCaptcha("You're signed out. Complete the security check to sign in again.");
    if (settingsPanel) {
        settingsPanel.classList.remove("open");
        settingsPanel.style.display = "none";
    }
}

socket.on("connect", () => {
    socket.emit("restore session", result => {
        if (result && result.success && result.user) {
            jetchatSettings.showOnline = result.user.show_online !== false;
            saveJetchatSettings();
            startChat(result.user.username);
        } else {
            initializeCaptcha();
        }
    });
});

socket.on("session revoked", () => {
    reconnectAfterSessionEnd = true;
    showSignedOutScreen();
});

socket.on("disconnect", reason => {
    if (reconnectAfterSessionEnd) {
        reconnectAfterSessionEnd = false;
        socket.connect();
    }
});

const logoutButton = document.getElementById("logoutButton");
const accountSessionsList = document.getElementById("accountSessionsList");
const refreshSessionsBtn = document.getElementById("refreshSessionsBtn");
const signOutOtherDevicesBtn = document.getElementById("signOutOtherDevicesBtn");
const changePasswordForm = document.getElementById("changePasswordForm");
const passwordChangeStatus = document.getElementById("passwordChangeStatus");

function formatSessionDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString([], { dateStyle:"medium", timeStyle:"short" });
}
async function accountRequest(url, options = {}) {
    const response = await fetch(url, {
        credentials:"same-origin", cache:"no-store", ...options,
        headers:{ ...(options.headers || {}), ...(options.body ? {"Content-Type":"application/json"} : {}) }
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || "The request couldn't be completed.");
    return result;
}
async function loadAccountSessions() {
    if (!accountSessionsList) return;
    accountSessionsList.textContent="Loading signed-in devices…";
    try {
        const result=await accountRequest("/api/account/sessions");
        accountSessionsList.replaceChildren();
        if (!result.sessions.length) { accountSessionsList.textContent="No active sessions were found."; return; }
        result.sessions.forEach(session => {
            const card=document.createElement("article"); card.className="account-session-card";
            const details=document.createElement("div"); details.className="account-session-details";
            const title=document.createElement("strong"); title.textContent=session.device || "Unknown device";
            const status=document.createElement("span"); status.className=session.current?"account-session-current":"account-session-other"; status.textContent=session.current?"This device":"Signed in";
            const activity=document.createElement("small"); activity.textContent="Last active: "+formatSessionDate(session.lastActiveAt);
            const created=document.createElement("small"); created.textContent="Signed in: "+formatSessionDate(session.createdAt);
            details.append(title,status,activity,created); card.appendChild(details);
            if(!session.current) {
                const revoke=document.createElement("button"); revoke.type="button"; revoke.className="account-session-revoke"; revoke.textContent="Sign out";
                revoke.addEventListener("click",async()=>{
                    revoke.disabled=true;
                    try { await accountRequest("/api/account/sessions/revoke",{method:"POST",body:JSON.stringify({sessionId:session.id})}); await loadAccountSessions(); }
                    catch(error) { alert(error.message); revoke.disabled=false; }
                });
                card.appendChild(revoke);
            }
            accountSessionsList.appendChild(card);
        });
    } catch(error) { accountSessionsList.textContent=error.message; }
}
refreshSessionsBtn?.addEventListener("click",loadAccountSessions);
signOutOtherDevicesBtn?.addEventListener("click",async()=>{
    if(!confirm("Sign out every other device? This device will stay signed in.")) return;
    signOutOtherDevicesBtn.disabled=true;
    try { const result=await accountRequest("/api/account/sessions/revoke-others",{method:"POST"}); await loadAccountSessions(); alert(`Signed out ${result.count} other device(s).`); }
    catch(error) { alert(error.message); }
    finally { signOutOtherDevicesBtn.disabled=false; }
});
changePasswordForm?.addEventListener("submit",async event=>{
    event.preventDefault();
    const currentPassword=document.getElementById("currentAccountPassword").value;
    const newPassword=document.getElementById("newAccountPassword").value;
    const confirmPassword=document.getElementById("confirmAccountPassword").value;
    if(newPassword!==confirmPassword) { passwordChangeStatus.textContent="The new passwords don't match."; return; }
    if(newPassword.length<8) { passwordChangeStatus.textContent="Use at least 8 characters."; return; }
    const submit=changePasswordForm.querySelector('button[type="submit"]'); submit.disabled=true; passwordChangeStatus.textContent="Updating password…";
    try {
        const result=await accountRequest("/api/account/change-password",{method:"POST",body:JSON.stringify({currentPassword,newPassword})});
        changePasswordForm.reset();
        passwordChangeStatus.textContent=`Password updated. ${result.signedOutDevices} other device(s) signed out.`;
        await loadAccountSessions();
    } catch(error) { passwordChangeStatus.textContent=error.message; }
    finally { submit.disabled=false; }
});

if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
        logoutButton.disabled = true;
        logoutButton.textContent = "Signing out...";
        try {
            const response = await fetch("/api/session/logout", {
                method: "POST",
                credentials: "same-origin"
            });
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.message || "Sign out failed.");
            }
            showSignedOutScreen();
            if (socket.connected) {
                socket.disconnect();
                socket.connect();
            }
        } catch (error) {
            console.error("Sign out error:", error);
            alert("Jetchat couldn't sign you out. Please try again.");
        } finally {
            logoutButton.disabled = false;
            logoutButton.textContent = "Sign Out";
        }
    });
}

loginButton.addEventListener("click", () => {
    const user = usernameInput.value.trim();
    const pass = passwordInput.value.trim();

    if (!user || !pass) {
        return alert("Enter username and password");
    }
    if (!captchaToken) {
        setCaptchaStatus("Complete the security check first.", true);
        return;
    }

    const token = captchaToken;
    loginButton.disabled = true;
    signupButton.disabled = true;
    setCaptchaStatus("Checking verification...");

    socket.emit("login", { username: user, password: pass, captchaToken: token }, async (res) => {
        resetCaptcha(res.success ? "Verification complete." : "Please complete the security check again.");
        if (!res.success) return alert(res.message);

        try {
            const sessionResponse = await fetch("/api/session/establish", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: res.sessionToken })
            });
            const sessionResult = await sessionResponse.json();
            if (!sessionResponse.ok || !sessionResult.success) {
                throw new Error(sessionResult.message || "Could not remember this sign-in.");
            }

            jetchatSettings.showOnline = res.user.show_online !== false;
            saveJetchatSettings();
            startChat(res.user.username);
        } catch (error) {
            console.error("Persistent sign-in setup failed:", error);
            alert("Your password was accepted, but Jetchat couldn't save your sign-in. Please try logging in again.");
        }
    });
});

signupButton.addEventListener("click", () => {
    const user = usernameInput.value.trim();
    const pass = passwordInput.value.trim();

    if (!user || !pass) {
        return alert("Enter username and password");
    }
    if (!captchaToken) {
        setCaptchaStatus("Complete the security check first.", true);
        return;
    }

    const token = captchaToken;
    loginButton.disabled = true;
    signupButton.disabled = true;
    setCaptchaStatus("Checking verification...");

    socket.emit("signup", { username: user, password: pass, captchaToken: token }, (res) => {
        resetCaptcha(res.success ? "Verification complete." : "Please complete the security check again.");
        if (!res.success) return alert(res.message);
        if (authFeedback) {
            authFeedback.textContent = "Account created. You can sign in now.";
            authFeedback.classList.add("is-visible", "is-success");
        }
        passwordInput.value = "";
        loginButton.focus();
    });
});

// =========================
// CHAT NAVIGATION
// =========================
function closeMobileDrawer() {
    document.body.classList.remove("mobile-nav-open");
    const menuButton = document.getElementById("mobileMenuBtn");
    if (menuButton) {
        menuButton.setAttribute("aria-expanded", "false");
        menuButton.setAttribute("aria-label", "Open navigation");
    }
}

function openMobileDrawer() {
    document.body.classList.add("mobile-nav-open");
    const menuButton = document.getElementById("mobileMenuBtn");
    if (menuButton) {
        menuButton.setAttribute("aria-expanded", "true");
        menuButton.setAttribute("aria-label", "Close navigation");
    }
}

const mobileMenuButton = document.getElementById("mobileMenuBtn");
const mobileNavBackdrop = document.getElementById("mobileNavBackdrop");

mobileMenuButton?.addEventListener("click", () => {
    if (document.body.classList.contains("mobile-nav-open")) {
        closeMobileDrawer();
    } else {
        openMobileDrawer();
    }
});
mobileNavBackdrop?.addEventListener("click", closeMobileDrawer);
document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeMobileDrawer();
});

function getChatKey(chat = currentChat) {
    if(chat==="global")return "global";
    if(String(chat).startsWith("group:"))return String(chat);
    return [username,chat].sort().join("|");
}
function getGroupByChat(chat) {
    if(!String(chat).startsWith("group:"))return null;
    return groupConversationCache.find(group=>String(group.id)===String(chat).slice(6))||null;
}
function openConversation(chat) {
    closeMobileDrawer();
    currentChat = chat;
    const group=getGroupByChat(chat);
    document.querySelector(".chat-title h2").textContent =
        chat === "global" ? "Global Chat" : group ? group.name : "DM with " + chat;

    messages.innerHTML = "";
    lastMessageUser = null;
    lastMessageElement = null;
    cancelReply();
    clearUnreadForChat(chat);

    if (messageSearchInput) {
        messageSearchInput.value = "";
    }

    socket.emit("load chat", chat);
    if(chat!=="global"&&!String(chat).startsWith("group:"))loadDMConversations();
    if (window.openJetchatSocial) window.openJetchatSocial("chatroom");
}



// GROUP CONVERSATIONS
const groupListContainer=document.getElementById("groupList");
const groupCreateModal=document.getElementById("groupCreateModal");
const groupCreateStatus=document.getElementById("groupCreateStatus");
function loadGroups(){if(!groupListContainer)return;socket.emit("get groups",result=>{if(!result?.success)return;groupConversationCache=Array.isArray(result.groups)?result.groups:[];renderGroups();});}
function renderGroups(){if(!groupListContainer)return;groupListContainer.replaceChildren();if(!groupConversationCache.length){groupListContainer.textContent="No groups yet";return;}groupConversationCache.forEach(group=>{const button=document.createElement("button");button.type="button";button.className="group-conversation-item";button.classList.toggle("active",currentChat===`group:${group.id}`);const title=document.createElement("strong");title.textContent=group.name;const meta=document.createElement("span");meta.textContent=`${group.member_count} members`;button.append(title,meta);button.addEventListener("click",()=>openConversation(`group:${group.id}`));groupListContainer.appendChild(button);});}
function closeGroupCreateModal(){if(groupCreateModal)groupCreateModal.style.display="none";if(groupCreateStatus)groupCreateStatus.textContent="";}
document.getElementById("createGroupBtn")?.addEventListener("click",()=>{groupCreateModal.style.display="flex";document.getElementById("groupNameInput").focus();});
document.getElementById("closeGroupCreate")?.addEventListener("click",closeGroupCreateModal);document.getElementById("cancelGroupCreate")?.addEventListener("click",closeGroupCreateModal);
document.getElementById("submitGroupCreate")?.addEventListener("click",()=>{const name=document.getElementById("groupNameInput").value.trim();const members=document.getElementById("groupMembersInput").value.split(",").map(v=>v.trim()).filter(Boolean);const button=document.getElementById("submitGroupCreate");if(!name||!members.length){groupCreateStatus.textContent="Enter a group name and at least one friend.";return;}button.disabled=true;groupCreateStatus.textContent="Creating group…";socket.emit("create group",{name,members},result=>{button.disabled=false;if(!result?.success){groupCreateStatus.textContent=result?.message||"Couldn't create group.";return;}document.getElementById("groupNameInput").value="";document.getElementById("groupMembersInput").value="";closeGroupCreateModal();loadGroups();openConversation(`group:${result.group.id}`);});});
socket.on("groups updated",loadGroups);

// =========================
// DM CONVERSATION LIST
// =========================
function formatDMTime(value) {
    if (!value) return "";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return String(value).replace(/\\s+/g, " ").slice(0, 12);
    }

    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
        return date.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    return date.toLocaleDateString([], {
        month: "short",
        day: "numeric"
    });
}

function loadDMConversations() {
    if (!dmListContainer) return;

    socket.emit("get dm conversations", result => {
        if (!result || !result.success) return;

        dmConversationCache = Array.isArray(result.conversations)
            ? result.conversations
            : [];

        renderDMConversations();
    });
}

function renderDMConversations() {
    if (!dmListContainer) return;

    const query = (dmSearchInput?.value || "").trim().toLowerCase();
    const conversations = dmConversationCache.filter(conversation =>
        String(conversation.peer || "").toLowerCase().includes(query) ||
        String(conversation.last_message || "").toLowerCase().includes(query)
    );

    if (dmConversationCount) {
        dmConversationCount.textContent = String(dmConversationCache.length);
    }

    dmListContainer.innerHTML = "";

    if (!conversations.length) {
        dmListContainer.textContent = query
            ? "No matching conversations"
            : "No conversations yet";
        return;
    }

    conversations.forEach(conversation => {
        const peer = String(conversation.peer || "");
        if (!peer) return;

        const item = document.createElement("div");
        item.className = "dm-conversation-item";
        item.dataset.peer = peer;

        if (currentChat === peer) {
            item.classList.add("active");
        }

        const openButton = document.createElement("button");
        openButton.type = "button";
        openButton.className = "dm-conversation-open";

        const details = document.createElement("span");
        details.className = "dm-conversation-details";

        const name = document.createElement("strong");
        name.className = "dm-conversation-name";
        name.textContent = peer;

        const preview = document.createElement("span");
        preview.className = "dm-conversation-preview";
        preview.textContent = conversation.last_message
            ? (conversation.last_sender === username ? "You: " : "") + conversation.last_message
            : "Start a conversation";

        details.append(name, preview);
        openButton.appendChild(details);

        const meta = document.createElement("span");
        meta.className = "dm-conversation-meta";

        const time = document.createElement("span");
        time.className = "dm-conversation-time";
        time.textContent = formatDMTime(conversation.last_message_time);
        meta.appendChild(time);

        const unread = Number(conversation.unread_count || 0);
        if (unread > 0) {
            const badge = document.createElement("span");
            badge.className = "dm-conversation-unread";
            badge.textContent = unread > 99 ? "99+" : String(unread);
            meta.appendChild(badge);
        }

        openButton.appendChild(meta);
        openButton.addEventListener("click", () => openConversation(peer));

        const pinButton = document.createElement("button");
        pinButton.type = "button";
        pinButton.className = "dm-pin-button";
        pinButton.textContent = conversation.pinned ? "★" : "☆";
        pinButton.title = conversation.pinned ? "Unpin conversation" : "Pin conversation";
        pinButton.setAttribute("aria-label", pinButton.title);
        pinButton.addEventListener("click", event => {
            event.stopPropagation();
            socket.emit("set dm pin", {
                peer,
                pinned: !conversation.pinned
            }, result => {
                if (!result || !result.success) {
                    return alert((result && result.message) || "Couldn't update pinned conversation.");
                }
                loadDMConversations();
            });
        });

        item.append(openButton, pinButton);
        dmListContainer.appendChild(item);
    });
}

if (dmSearchInput) {
    dmSearchInput.addEventListener("input", renderDMConversations);
}

function applyMessageSearch() {
    if (!messageSearchInput || !messages) return;

    const query = messageSearchInput.value.trim().toLowerCase();

    messages.querySelectorAll(".message, .system-wrapper").forEach(element => {
        const text = element.querySelector(".text")?.textContent || element.textContent || "";
        element.style.display = !query || text.toLowerCase().includes(query)
            ? ""
            : "none";
    });
}

if (messageSearchInput) {
    messageSearchInput.addEventListener("input", applyMessageSearch);
}

// =========================
// LOAD FRIENDS
// =========================
function loadFriends() {
    const container = document.getElementById("friendsList");

    socket.emit("get friends", (friends) => {
        container.innerHTML = "";

        if (!friends.length) {
            container.textContent = "No friends";
            return;
        }

        friends.forEach(friend => {
            const div = document.createElement("div");

            div.className = "friend-item";
            div.dataset.friend = friend.friend;
            div.style.cursor = "pointer";

            const friendName = document.createElement("span");
            friendName.textContent = friend.friend;
            div.appendChild(friendName);

            div.addEventListener("click", () => {
                openConversation(friend.friend);
            });

            container.appendChild(div);
        });

        updateUnreadCount();
    });
}

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
        chat: currentChat,
        replyTo: replyingTo,
        time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
        })
    });

    cancelReply();

    messageInput.value = "";

    if (jetchatSettings.sound) {
        playSound(900);
    }
});


function renderMessageReactions(messageElement, reactions) {
    if (!messageElement) return;
    let container = messageElement.querySelector(".message-reactions");
    if (!container) {
        container = document.createElement("div");
        container.className = "message-reactions";
        messageElement.appendChild(container);
    }
    container.innerHTML = "";
    (Array.isArray(reactions) ? reactions : []).forEach(reaction => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "reaction-chip";
        chip.textContent = `${reaction.emoji} ${reaction.count}`;
        const users = Array.isArray(reaction.users) ? reaction.users : [];
        chip.title = users.length ? users.join(", ") : "React";
        chip.setAttribute("aria-label", `${reaction.count} reactions: ${reaction.emoji}`);
        chip.classList.toggle("reacted-by-me", users.includes(username));
        chip.addEventListener("click", () => {
            socket.emit("toggle message reaction", {
                messageId: messageElement.dataset.messageId,
                chat: currentChat,
                emoji: reaction.emoji
            });
        });
        container.appendChild(chip);
    });
}

const REACTION_CHOICES = ["👍", "❤️", "😂", "🔥", "🎉", "😮", "😢", "👏", "💯"];

function openReactionPicker(messageElement, trigger) {
    document.querySelectorAll(".reaction-picker").forEach(picker => picker.remove());
    const picker = document.createElement("div");
    picker.className = "reaction-picker";
    picker.setAttribute("role", "group");
    picker.setAttribute("aria-label", "Choose a reaction");
    REACTION_CHOICES.forEach(emoji => {
        const choice = document.createElement("button");
        choice.type = "button";
        choice.textContent = emoji;
        choice.setAttribute("aria-label", `React with ${emoji}`);
        choice.addEventListener("click", () => {
            socket.emit("toggle message reaction", {
                messageId: messageElement.dataset.messageId,
                chat: currentChat,
                emoji
            }, result => {
                if (!result?.success) {
                    showInAppNotification("Reaction failed", result?.message || "Please try again.");
                }
            });
            document.removeEventListener("pointerdown", close);
            picker.remove();
        });
        picker.appendChild(choice);
    });
    messageElement.appendChild(picker);
    picker.querySelector("button")?.focus();
    const close = event => {
        if (!picker.contains(event.target) && event.target !== trigger) {
            picker.remove();
            document.removeEventListener("pointerdown", close);
        }
    };
    setTimeout(() => document.addEventListener("pointerdown", close), 0);
}

socket.on("message reactions updated", update => {
    const expectedChat = getChatKey();
    if (!update || update.chat !== expectedChat) return;
    const target = findMessageElementById(update.messageId);
    if (target) renderMessageReactions(target, update.reactions);
});

function openSavedMessagesVault() {
    const modal = document.getElementById("savedMessagesModal");
    const list = document.getElementById("savedMessagesList");
    if (!modal || !list) return;
    modal.style.display = "flex";
    list.innerHTML = '<div class="saved-empty">Loading your saved messages…</div>';
    socket.emit("get saved messages", result => {
        list.innerHTML = "";
        if (!result?.success) {
            list.textContent = "Couldn't load saved messages.";
            return;
        }
        if (!result.messages.length) {
            list.innerHTML = '<div class="saved-empty">Your vault is empty. Save a message from its message menu.</div>';
            return;
        }
        result.messages.forEach(saved => {
            const card = document.createElement("article");
            card.className = "saved-message-card";
            const meta = document.createElement("div");
            meta.className = "saved-message-meta";
            meta.textContent = `${saved.author_username} · ${saved.chat === "global" ? "Global Chat" : String(saved.chat).startsWith("group:") ? "Group Chat" : "Direct Message"} · ${formatDMTime(saved.saved_at)}`;
            const body = document.createElement("p");
            body.textContent = saved.message_text;
            const actions = document.createElement("div");
            actions.className = "saved-message-actions";
            const open = document.createElement("button");
            open.type = "button";
            open.textContent = "Open conversation";
            open.addEventListener("click", () => {
                modal.style.display = "none";
                const peer = saved.chat === "global" ? "global" :
                    saved.chat.split("|").find(name => name !== username);
                openConversation(peer || "global");
            });
            const remove = document.createElement("button");
            remove.type = "button";
            remove.textContent = "Remove";
            remove.addEventListener("click", () => {
                socket.emit("toggle saved message", {
                    messageId: saved.message_id,
                    chat: saved.chat
                }, response => {
                    if (response?.success) openSavedMessagesVault();
                });
            });
            actions.append(open, remove);
            card.append(meta, body, actions);
            list.appendChild(card);
        });
    });
}

document.getElementById("savedMessagesBtn")?.addEventListener("click", () => {
    closeMobileDrawer();
    openSavedMessagesVault();
});
document.getElementById("closeSavedMessages")?.addEventListener("click", () => {
    document.getElementById("savedMessagesModal").style.display = "none";
});
document.getElementById("savedMessagesModal")?.addEventListener("click", event => {
    if (event.target.id === "savedMessagesModal") event.currentTarget.style.display = "none";
});



// FILE SHARING + VOICE MESSAGES
const chatFileInput=document.getElementById("chatFileInput"),attachFileBtn=document.getElementById("attachFileBtn"),voiceMessageBtn=document.getElementById("voiceMessageBtn");
let voiceRecorder=null,voiceStream=null,voiceChunks=[];
async function uploadChatFile(file,isVoice=false){if(!file||currentChat==="global")return showInAppNotification("Choose a conversation","Files and voice messages are available in DMs and group chats.");if(file.size>12*1024*1024)return showInAppNotification("File too large","The maximum upload size is 12 MB.");const form=new FormData();form.append("file",file);form.append("chat",getChatKey());try{const response=await fetch("/api/chat/upload",{method:"POST",credentials:"same-origin",body:form});const result=await response.json();if(!response.ok||!result.success)throw new Error(result.message||"Upload failed.");socket.emit("chat message",{text:isVoice?"Voice message":"",chat:getChatKey(),attachmentId:result.attachment.id,time:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})});}catch(error){showInAppNotification("Upload failed",error.message);}}
attachFileBtn?.addEventListener("click",()=>{if(currentChat==="global")return showInAppNotification("Choose a conversation","Files can be shared in DMs and group chats.");chatFileInput?.click();});
chatFileInput?.addEventListener("change",async()=>{const file=chatFileInput.files?.[0];if(file)await uploadChatFile(file);chatFileInput.value="";});
voiceMessageBtn?.addEventListener("click",async()=>{if(currentChat==="global")return showInAppNotification("Choose a conversation","Voice messages are available in DMs and group chats.");if(voiceRecorder&&voiceRecorder.state==="recording"){voiceRecorder.stop();voiceMessageBtn.textContent="🎙";voiceMessageBtn.classList.remove("recording");return;}if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined")return showInAppNotification("Recording unavailable","This browser doesn't support voice recording.");try{voiceStream=await navigator.mediaDevices.getUserMedia({audio:true});voiceChunks=[];voiceRecorder=new MediaRecorder(voiceStream);voiceRecorder.addEventListener("dataavailable",event=>{if(event.data.size)voiceChunks.push(event.data);});voiceRecorder.addEventListener("stop",async()=>{const blob=new Blob(voiceChunks,{type:voiceRecorder.mimeType||"audio/webm"});voiceStream?.getTracks().forEach(track=>track.stop());voiceStream=null;if(blob.size)await uploadChatFile(new File([blob],`voice-${Date.now()}.webm`,{type:blob.type||"audio/webm"}),true);},{once:true});voiceRecorder.start();voiceMessageBtn.textContent="■";voiceMessageBtn.classList.add("recording");}catch(error){voiceStream?.getTracks().forEach(track=>track.stop());voiceStream=null;showInAppNotification("Microphone unavailable","Allow microphone access to record a voice message.");}});
document.getElementById("mediaGalleryBtn")?.addEventListener("click",()=>{const modal=document.getElementById("mediaGalleryModal"),list=document.getElementById("mediaGalleryList");if(currentChat==="global"){list.textContent="Open a DM or group chat to view its shared media.";modal.style.display="flex";return;}modal.style.display="flex";list.textContent="Loading shared media…";socket.emit("get chat media",getChatKey(),result=>{list.replaceChildren();if(!result?.success||!result.media?.length){list.textContent="No shared media in this conversation yet.";return;}result.media.forEach(item=>{const row=document.createElement("a");row.className="media-gallery-item";row.href=`/api/chat-media/${encodeURIComponent(item.id)}`;row.target="_blank";row.rel="noopener";const label=document.createElement("span");label.textContent=item.original_name;const meta=document.createElement("small");meta.textContent=`${item.mime_type} · shared by ${item.uploader}`;row.append(label,meta);list.appendChild(row);});});});
document.getElementById("closeMediaGallery")?.addEventListener("click",()=>document.getElementById("mediaGalleryModal").style.display="none");document.getElementById("mediaGalleryModal")?.addEventListener("click",event=>{if(event.target.id==="mediaGalleryModal")event.currentTarget.style.display="none";});

// =========================
// RECEIVE MESSAGES
// =========================
function displayMessage(data) {
    const expectedChat = getChatKey();

    if (!data || data.chat !== expectedChat) {
        return;
    }

    const message = document.createElement("div");

    if (data.system) {
        message.className = "system-wrapper";
        message.innerHTML = `
            <div class="system-message">${escapeHTML(data.text)}</div>
        `;

        messages.appendChild(message);
        scrollChatToBottom(true);

        lastMessageUser = null;
        lastMessageElement = null;
        return;
    }

    message.className = "message";

    if (data.id !== undefined && data.id !== null) {
        message.dataset.messageId = String(data.id);
    }

    const isGrouped =
        data.username === lastMessageUser &&
        lastMessageElement &&
        !lastMessageElement.classList.contains("system-wrapper");

    const isGlobalMessage = data.chat === "global";

    message.innerHTML = `
        ${isGrouped ? "" : `
            <div class="username clickable">${escapeHTML(data.username)}</div>
        `}

        <div class="message-body">
            ${data.replyTo ? `
                <div class="reply-reference" style="border-left:3px solid #5865F2;padding:4px 8px;margin-bottom:6px;background:rgba(88,101,242,0.10);border-radius:4px;font-size:12px;">
                    <strong>Replying to ${escapeHTML(data.replyTo.username || "Unknown")}</strong>
                    <div>${escapeHTML(data.replyTo.text || "Original message unavailable")}</div>
                </div>
            ` : ""}

            <div class="text">${escapeHTML(data.text || "")}</div>
            ${data.attachment_id ? (String(data.attachment_mime || "").startsWith("image/") ? `<a class="message-attachment-image" href="/api/chat-media/${encodeURIComponent(data.attachment_id)}" target="_blank" rel="noopener"><img src="/api/chat-media/${encodeURIComponent(data.attachment_id)}" alt="${escapeHTML(data.attachment_name || "Shared image")}" loading="lazy"></a>` : String(data.attachment_mime || "").startsWith("audio/") ? `<div class="message-audio"><span>Voice message</span><audio controls preload="none" src="/api/chat-media/${encodeURIComponent(data.attachment_id)}"></audio></div>` : `<a class="message-attachment-file" href="/api/chat-media/${encodeURIComponent(data.attachment_id)}">${escapeHTML(data.attachment_name || "Download file")} · ${Math.max(1, Math.round(Number(data.attachment_size || 0) / 1024))} KB</a>`) : ""}
            <div class="time">${escapeHTML(data.time)}</div>
            ${!isGlobalMessage && data.username === username ? `
                <div class="message-status">${data.read_at ? "Read" : data.delivered_at ? "Delivered" : "Sent"}</div>
            ` : ""}
        </div>

        <div class="message-toolbar">
            <button class="react-btn" type="button" aria-label="Add reaction" title="Add reaction">😊</button>
            <button class="save-message-btn" type="button" aria-label="Save message" title="Save message">☆</button>
            <button class="reply-btn" type="button">↩</button>
            ${isGlobalMessage ? `
                <button class="edit-btn" type="button">✏️</button>
                <button class="delete-btn" type="button">🗑️</button>
            ` : ""}
        </div>
    `;

    const usernameElement = message.querySelector(".username");

    if (usernameElement) {
        usernameElement.style.cursor = "pointer";

        usernameElement.onclick = () => {
            console.log("CLICKED:", data.username);
            openProfile(data.username);
        };
    }


    message.querySelector(".react-btn").addEventListener("click", event => {
        event.stopPropagation();
        openReactionPicker(message, event.currentTarget);
    });

    message.querySelector(".save-message-btn").addEventListener("click", event => {
        event.stopPropagation();
        socket.emit("toggle saved message", {
            messageId: data.id,
            chat: currentChat
        }, result => {
            if (!result?.success) {
                return showInAppNotification("Save failed", result?.message || "Couldn't save this message.");
            }
            event.currentTarget.textContent = result.saved ? "★" : "☆";
            event.currentTarget.title = result.saved ? "Saved to your vault" : "Save message";
            showInAppNotification(
                result.saved ? "Saved message" : "Removed from vault",
                result.saved ? "Added to your Saved Messages vault." : "Removed from your vault."
            );
        });
    });

    message.querySelector(".reply-btn").addEventListener("click", () => {
        startReply({
            id: data.id,
            username: data.username,
            text: data.text
        });
    });

    const editButton = message.querySelector(".edit-btn");

    if (editButton) {
        editButton.addEventListener("click", () => {
            if (data.username !== username) {
                return alert("You can only edit your own messages.");
            }

            if (data.id === undefined || data.id === null) {
                return alert("This message has no ID and cannot be edited.");
            }

            const oldText = message.querySelector(".text").textContent;
            const newText = prompt("Edit message:", oldText);

            if (newText === null) return;

            const trimmedText = newText.trim();

            if (!trimmedText || trimmedText === oldText) return;

            socket.emit("edit message", {
                id: data.id,
                newText: trimmedText
            }, (res) => {
                if (!res || !res.success) {
                    alert(res?.message || "Couldn't edit message.");
                }
            });
        });
    }

    const deleteButton = message.querySelector(".delete-btn");

    if (deleteButton) {
        deleteButton.addEventListener("click", () => {
            if (data.username !== username) {
                return alert("You can only delete your own messages.");
            }

            if (data.id === undefined || data.id === null) {
                return alert("This message has no ID and cannot be deleted.");
            }

            if (!confirm("Delete this message?")) return;

            socket.emit("delete message", data.id, (res) => {
                if (!res || !res.success) {
                    alert(res?.message || "Couldn't delete message.");
                }
            });
        });
    }

    messages.appendChild(message);
    renderMessageReactions(message, data.reactions || []);

    const distanceFromBottom = chatContainer
        ? chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight
        : 0;

    if (distanceFromBottom < 140 || data.username === username) {
        scrollChatToBottom(true);
    }

    lastMessageUser = data.username;
    lastMessageElement = message;
}

function updateUnreadCount() {
    unreadCount = Object.values(unreadByChat).reduce(
        (total, count) => total + count,
        0
    );

    if (notificationBadge) {
        notificationBadge.textContent = unreadCount > 99
            ? "99+"
            : String(unreadCount);
        notificationBadge.style.display = unreadCount ? "inline-flex" : "none";
    }

    document.title = unreadCount
        ? `(${unreadCount}) Jetchat`
        : "Jetchat";

    document.querySelectorAll(".friend-item[data-friend]").forEach(item => {
        const chatId = [username, item.dataset.friend].sort().join("|");
        const count = unreadByChat[chatId] || 0;
        let badge = item.querySelector(".friend-unread-badge");

        if (count > 0) {
            if (!badge) {
                badge = document.createElement("span");
                badge.className = "friend-unread-badge";
                item.appendChild(badge);
            }

            badge.textContent = count > 99 ? "99+" : String(count);
        } else if (badge) {
            badge.remove();
        }
    });
}

function clearUnreadForChat(chat) {
    const chatId = getChatKey(chat);

    delete unreadByChat[chatId];
    updateUnreadCount();
}

function showInAppNotification(title, body, chat) {
    if (!notificationContainer) return;

    const toast = document.createElement("button");
    toast.type = "button";
    toast.className = "jetchat-toast";

    const heading = document.createElement("strong");
    heading.textContent = title;

    const preview = document.createElement("span");
    preview.textContent = body;

    toast.append(heading, preview);

    toast.addEventListener("click", () => {
        if (chat === "friends") {
            loadFriendRequests();
        } else {
            openConversation(chat);
        }
        toast.remove();
    });

    notificationContainer.prepend(toast);

    while (notificationContainer.children.length > 4) {
        notificationContainer.lastElementChild.remove();
    }

    window.setTimeout(() => {
        toast.classList.add("toast-dismiss");
        window.setTimeout(() => toast.remove(), 250);
    }, 6500);
}

function notifyIncomingMessage(data) {
    if (!data || data.system || data.username === username) return;

    const chatId = data.chat || "global";
    const expectedChat = getChatKey();
    const isCurrentChat = chatId === expectedChat;
    const isVisible = isTabActive && document.visibilityState === "visible";

    if (isCurrentChat && isVisible) return;

    unreadByChat[chatId] = (unreadByChat[chatId] || 0) + 1;
    updateUnreadCount();

    const group = getGroupByChat(chatId);
    const chatName = chatId === "global"
        ? "Global chat"
        : group ? group.name : data.username;

    showInAppNotification(
        `New message from ${chatName}`,
        String(data.text || "").slice(0, 120),
        chatId === "global" ? "global" : data.username
    );

    if (jetchatSettings.sound) {
        try {
            playSound(680);
        } catch (error) {
            console.warn("Notification sound could not play:", error);
        }
    }

    if (
        jetchatSettings.browserNotifications &&
        "Notification" in window &&
        Notification.permission === "granted"
    ) {
        try {
            new Notification(`New message from ${chatName}`, {
                body: String(data.text || "").slice(0, 140),
                icon: "/logo.png",
                tag: `jetchat-${chatId}`
            });
        } catch (error) {
            console.warn("Browser notification could not be shown:", error);
        }
    }
}

function handleIncomingMessage(data) {
    displayMessage(data);
    notifyIncomingMessage(data);

    if(data&&!data.system&&data.chat&&data.chat!=="global"){if(String(data.chat).startsWith("group:"))loadGroups();else loadDMConversations();}

    applyMessageSearch();

    if (
        data &&
        !data.system &&
        currentChat !== "global" && !String(currentChat).startsWith("group:") &&
        data.username === currentChat &&
        data.chat === getChatKey() &&
        jetchatSettings.readReceipts &&
        isTabActive &&
        document.visibilityState === "visible"
    ) {
        socket.emit("mark chat read", currentChat, () => loadDMConversations());
    }
}

document.addEventListener("visibilitychange", () => {
    isTabActive = document.visibilityState === "visible";

    if (isTabActive) {
        clearUnreadForChat(currentChat);

        if (
            currentChat !== "global" && !String(currentChat).startsWith("group:") &&
            jetchatSettings.readReceipts
        ) {
            socket.emit("mark chat read", currentChat, () => loadDMConversations());
        }
    }
});

window.addEventListener("focus", () => {
    isTabActive = true;
    clearUnreadForChat(currentChat);

    if (currentChat !== "global" && !String(currentChat).startsWith("group:") && jetchatSettings.readReceipts) {
        socket.emit("mark chat read", currentChat, () => loadDMConversations());
    }
});

window.addEventListener("blur", () => {
    isTabActive = false;
});

socket.on("chat message", handleIncomingMessage);
socket.on("chat message received", handleIncomingMessage);

function updateVisibleMessageStatuses(data, status) {
    if (!data || !Array.isArray(data.ids)) return;

    const expectedChat = getChatKey();

    if (data.chat !== expectedChat) return;

    data.ids.forEach(id => {
        const message = findMessageElementById(id);
        const statusElement = message?.querySelector(".message-status");

        if (statusElement) {
            statusElement.textContent = status;
        }
    });
}

socket.on("messages delivered", data => {
    updateVisibleMessageStatuses(data, "Delivered");
});

socket.on("messages read", data => {
    if (jetchatSettings.readReceipts) {
        updateVisibleMessageStatuses(data, "Read");
    }
});

// =========================
// SOCKET EVENTS: EDIT / DELETE
// =========================
socket.on("chat message edited", (data) => {
    const message = findMessageElementById(data.id);
    if (!message) return;

    const textElement = message.querySelector(".text");
    if (textElement) {
        textElement.textContent = data.newText;
    }

    message.dataset.edited = "true";
});

socket.on("chat message deleted", (data) => {
    const message = findMessageElementById(data.id);
    if (message) {
        message.remove();
    }
});

// =========================
// TYPING
// =========================
messageInput.addEventListener("input", () => {
    if (!typingSent) {
        socket.emit("typing", username);
        typingSent = true;

        setTimeout(() => {
            typingSent = false;
        }, 1000);
    }
});

socket.on("typing users", (users) => {
    typingUsers = new Set(users);

    const list = [...typingUsers];

    typingIndicator.textContent =
        list.length ? `${list.join(", ")} is typing...` : "";

    clearTimeout(typingTimeout);

    typingTimeout = setTimeout(() => {
        typingIndicator.textContent = "";
    }, 2000);
});

// =========================
// ACCOUNT-LEVEL PRESENCE
// =========================
socket.on("presence update", (presence) => {
    const online = Array.isArray(presence?.users)
        ? presence.users
        : [];

    onlineUsernames = new Set(online);
    onlineCount.textContent = `• ${online.length} online`;

    if (!onlineUsersContainer) return;

    onlineUsersContainer.innerHTML = "";

    if (online.length === 0) {
        onlineUsersContainer.textContent = "Nobody online";
        return;
    }

    online.forEach(onlineUsername => {
        const item = document.createElement("div");
        item.className = "user clickable";
        item.setAttribute("role", "button");
        item.setAttribute("tabindex", "0");
        item.innerHTML = `
            <span class="dot"></span>
            <span>${escapeHTML(onlineUsername)}</span>
        `;

        item.addEventListener("click", () => openProfile(onlineUsername));
        item.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openProfile(onlineUsername);
            }
        });

        onlineUsersContainer.appendChild(item);
    });
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

    clearUnreadForChat(currentChat);
    applyMessageSearch();
    loadDMConversations();

    if (
        currentChat !== "global" && !String(currentChat).startsWith("group:") &&
        jetchatSettings.readReceipts &&
        document.visibilityState === "visible"
    ) {
        socket.emit("mark chat read", currentChat, () => loadDMConversations());
    }

    scrollChatToBottom(false);
});

// =========================
// PROFILE SYSTEM
// =========================
function openProfile(targetUsername) {
    socket.emit("get profile", targetUsername, (res) => {
        if (!res.success) {
            return alert("Couldn't load profile.");
        }

        profileUsername.textContent = res.profile.username;
        profileBio.dataset.raw = res.profile.bio || "";
        profileBio.textContent = res.profile.bio || "No bio yet.";
        const customStatus = res.profile.custom_status || "";
        profileCustomStatus.dataset.status = customStatus;
        profileCustomStatus.textContent = customStatus || "No custom status";
        profileJoinDate.textContent =
            new Date(res.profile.join_date).toLocaleDateString();

        const profileStatus = document.getElementById("profileStatus");

        if (res.profile.show_online === false) {
            profileStatus.textContent = "Status hidden";
        } else if (onlineUsernames.has(res.profile.username)) {
            profileStatus.textContent = "Online now";
        } else if (res.profile.last_seen) {
            const lastSeenDate = new Date(res.profile.last_seen);
            const elapsedSeconds = Math.max(
                0,
                Math.floor((Date.now() - lastSeenDate.getTime()) / 1000)
            );

            let elapsed;
            if (elapsedSeconds < 60) {
                elapsed = "just now";
            } else if (elapsedSeconds < 3600) {
                elapsed = `${Math.floor(elapsedSeconds / 60)} minute(s) ago`;
            } else if (elapsedSeconds < 86400) {
                elapsed = `${Math.floor(elapsedSeconds / 3600)} hour(s) ago`;
            } else {
                elapsed = `${Math.floor(elapsedSeconds / 86400)} day(s) ago`;
            }

            profileStatus.textContent = `Last seen ${elapsed}`;
        } else {
            profileStatus.textContent = "Last seen unknown";
        }

        currentProfileColor = res.profile.profile_color || "#5865f2";
        profileBanner.style.background = currentProfileColor;

        profileAvatar.src =
            res.profile.avatar || "/default-avatar.png";

        if (res.profile.username === username) {
            addFriendBtn.style.display = "none";
            editProfileBtn.style.display = "block";
        } else {
            addFriendBtn.style.display = "block";
            editProfileBtn.style.display = "none";
        }

        profileModal.style.display = "flex";
    });
}

closeProfile.addEventListener("click", () => {
    profileModal.style.display = "none";
});

/* =========================
   SETTINGS + THEME SYSTEM
========================= */

const settingsBtn = document.getElementById("settingsBtn");
const settingsPanel = document.getElementById("settingsPanel");
const closeSettings = document.getElementById("closeSettings");

const themeSelect = document.getElementById("themeSelect");
const accentSelect = document.getElementById("accentSelect");
const chatBackgroundSelect = document.getElementById("chatBackgroundSelect");

const fontSizeSetting = document.getElementById("fontSizeSetting");
const fontSizeValue = document.getElementById("fontSizeValue");

const compactModeToggle = document.getElementById("compactModeToggle");
const timestampsToggle = document.getElementById("timestampsToggle");
const enterToSendToggle = document.getElementById("enterToSendToggle");
const soundToggle = document.getElementById("soundToggle");
const browserNotificationsToggle = document.getElementById("browserNotificationsToggle");

const showOnlineToggle = document.getElementById("showOnlineToggle");
const readReceiptsToggle = document.getElementById("readReceiptsToggle");
const typingStatusToggle = document.getElementById("typingStatusToggle");

const reducedMotionToggle = document.getElementById("reducedMotionToggle");
const highContrastToggle = document.getElementById("highContrastToggle");
const wideSpacingToggle = document.getElementById("wideSpacingToggle");
const alwaysShowActionsToggle = document.getElementById("alwaysShowActionsToggle");
const strongFocusToggle = document.getElementById("strongFocusToggle");

const resetSettings = document.getElementById("resetSettings");

const SETTINGS_DEFAULTS = {
    theme: "dark",
    accent: "#5865f2",
    chatBackground: "default",
    fontSize: 15,
    compact: false,
    timestamps: true,
    enterToSend: true,
    sound: true,
    browserNotifications: false,
    showOnline: true,
    readReceipts: true,
    typingStatus: true,
    reducedMotion: false,
    highContrast: false,
    wideSpacing: false,
    alwaysShowActions: false,
    strongFocus: true
};

let jetchatSettings = { ...SETTINGS_DEFAULTS };

try {
    const savedSettings = JSON.parse(
        localStorage.getItem("jetchatSettings") || "{}"
    );

    jetchatSettings = {
        ...SETTINGS_DEFAULTS,
        ...savedSettings
    };
} catch (error) {
    console.warn("Could not load Jetchat settings:", error);
}

function getEffectiveTheme() {
    if (jetchatSettings.theme === "system") {
        return window.matchMedia &&
            window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light";
    }

    return jetchatSettings.theme;
}

function applyJetchatSettings() {
    const root = document.documentElement;
    const body = document.body;
    const theme = getEffectiveTheme();

    body.classList.toggle("dark-mode", theme === "dark");
    body.classList.toggle("light-mode", theme === "light");

    body.classList.toggle(
        "compact-chat",
        !!jetchatSettings.compact
    );

    body.classList.toggle(
        "hide-timestamps",
        !jetchatSettings.timestamps
    );

    body.classList.toggle(
        "reduced-motion",
        !!jetchatSettings.reducedMotion
    );

    body.classList.toggle(
        "high-contrast",
        !!jetchatSettings.highContrast
    );
    body.classList.toggle("wide-spacing", !!jetchatSettings.wideSpacing);
    body.classList.toggle("always-show-actions", !!jetchatSettings.alwaysShowActions);
    body.classList.toggle("strong-focus", !!jetchatSettings.strongFocus);

    root.style.setProperty(
        "--jetchat-accent",
        jetchatSettings.accent
    );

    root.style.setProperty(
        "--jetchat-message-size",
        `${jetchatSettings.fontSize}px`
    );

    body.dataset.chatBackground =
        jetchatSettings.chatBackground;

    if (themeSelect) {
        themeSelect.value = jetchatSettings.theme;
    }

    if (accentSelect) {
        accentSelect.value = jetchatSettings.accent;
    }

    if (chatBackgroundSelect) {
        chatBackgroundSelect.value =
            jetchatSettings.chatBackground;
    }

    if (fontSizeSetting) {
        fontSizeSetting.value = jetchatSettings.fontSize;
    }

    if (fontSizeValue) {
        fontSizeValue.textContent =
            `${jetchatSettings.fontSize}px`;
    }

    if (compactModeToggle) {
        compactModeToggle.checked = !!jetchatSettings.compact;
    }

    if (timestampsToggle) {
        timestampsToggle.checked = !!jetchatSettings.timestamps;
    }

    if (enterToSendToggle) {
        enterToSendToggle.checked =
            !!jetchatSettings.enterToSend;
    }

    if (soundToggle) {
        soundToggle.checked = !!jetchatSettings.sound;
    }

    if (browserNotificationsToggle) {
        browserNotificationsToggle.checked =
            !!jetchatSettings.browserNotifications;
    }

    if (showOnlineToggle) {
        showOnlineToggle.checked =
            !!jetchatSettings.showOnline;
    }

    if (readReceiptsToggle) {
        readReceiptsToggle.checked =
            !!jetchatSettings.readReceipts;
    }

    if (typingStatusToggle) {
        typingStatusToggle.checked =
            !!jetchatSettings.typingStatus;
    }

    if (reducedMotionToggle) {
        reducedMotionToggle.checked =
            !!jetchatSettings.reducedMotion;
    }

    if (highContrastToggle) {
        highContrastToggle.checked =
            !!jetchatSettings.highContrast;
    }
}

function saveJetchatSettings() {
    try {
        localStorage.setItem(
            "jetchatSettings",
            JSON.stringify(jetchatSettings)
        );
    } catch (error) {
        console.warn("Could not save Jetchat settings:", error);
    }

    applyJetchatSettings();
}

function openSettings() {
    if (!settingsPanel) return;

    loadAccountSessions();
    settingsPanel.style.display = "flex";
    settingsPanel.setAttribute("aria-hidden", "false");

    requestAnimationFrame(() => {
        settingsPanel.classList.add("open");
    });
}

function hideSettings() {
    if (!settingsPanel) return;

    settingsPanel.classList.remove("open");
    settingsPanel.setAttribute("aria-hidden", "true");

    window.setTimeout(() => {
        if (!settingsPanel.classList.contains("open")) {
            settingsPanel.style.display = "none";
        }
    }, 280);
}

if (settingsBtn && settingsPanel) {
    settingsBtn.addEventListener("click", event => {
        event.stopPropagation();

        if (settingsPanel.classList.contains("open")) {
            hideSettings();
        } else {
            openSettings();
        }
    });
}

if (closeSettings) {
    closeSettings.addEventListener("click", hideSettings);
}

document.addEventListener("keydown", event => {
    if (
        event.key === "Escape" &&
        settingsPanel?.classList.contains("open")
    ) {
        hideSettings();
    }
});

document.addEventListener("click", event => {
    if (
        settingsPanel?.classList.contains("open") &&
        !settingsPanel.contains(event.target) &&
        !settingsBtn?.contains(event.target)
    ) {
        hideSettings();
    }
});

const settingInputs = [
    [themeSelect, "theme"],
    [accentSelect, "accent"],
    [chatBackgroundSelect, "chatBackground"],

    [
        fontSizeSetting,
        "fontSize",
        value => Math.min(20, Math.max(12, Number(value)))
    ],

    [compactModeToggle, "compact", null, true],
    [timestampsToggle, "timestamps", null, true],
    [enterToSendToggle, "enterToSend", null, true],
    [soundToggle, "sound", null, true],
    [browserNotificationsToggle, "browserNotifications", null, true],

    [showOnlineToggle, "showOnline", null, true],
    [readReceiptsToggle, "readReceipts", null, true],
    [typingStatusToggle, "typingStatus", null, true],

    [reducedMotionToggle, "reducedMotion", null, true],
    [highContrastToggle, "highContrast", null, true],
    [wideSpacingToggle, "wideSpacing", null, true],
    [alwaysShowActionsToggle, "alwaysShowActions", null, true],
    [strongFocusToggle, "strongFocus", null, true]
];

settingInputs.forEach(([element, key, convert, isCheckbox]) => {
    if (!element) return;

    const updateSetting = () => {
        jetchatSettings[key] = convert
            ? convert(element.value)
            : isCheckbox
                ? element.checked
                : element.value;

        saveJetchatSettings();

        if (key === "showOnline" && username) {
            socket.emit("set presence visibility", jetchatSettings.showOnline);
        }
    };

    element.addEventListener("input", updateSetting);
    element.addEventListener("change", updateSetting);
});

if (browserNotificationsToggle) {
    browserNotificationsToggle.addEventListener(
        "change",
        async () => {
            if (!browserNotificationsToggle.checked) {
                jetchatSettings.browserNotifications = false;
                saveJetchatSettings();
                return;
            }

            if (!("Notification" in window)) {
                jetchatSettings.browserNotifications = false;
                saveJetchatSettings();

                alert(
                    "Browser notifications are not supported by this browser."
                );

                return;
            }

            if (Notification.permission === "default") {
                const permission =
                    await Notification.requestPermission();

                if (permission !== "granted") {
                    jetchatSettings.browserNotifications = false;
                    saveJetchatSettings();

                    alert(
                        "Browser notifications were not allowed."
                    );
                }
            } else if (Notification.permission === "denied") {
                jetchatSettings.browserNotifications = false;
                saveJetchatSettings();

                alert(
                    "Notifications are blocked in your browser settings."
                );
            }
        }
    );
}

if (resetSettings) {
    resetSettings.addEventListener("click", () => {
        jetchatSettings = { ...SETTINGS_DEFAULTS };
        saveJetchatSettings();
    });
}

applyJetchatSettings();

if (window.matchMedia) {
    const systemTheme = window.matchMedia(
        "(prefers-color-scheme: dark)"
    );

    systemTheme.addEventListener?.("change", () => {
        if (jetchatSettings.theme === "system") {
            applyJetchatSettings();
        }
    });
}
// =========================
// EDIT PROFILE
// =========================
const editProfileModal = document.getElementById("editProfileModal");
const closeEditProfile = document.getElementById("closeEditProfile");

const editAvatarPreview = document.getElementById("editAvatarPreview");
const editUsername = document.getElementById("editUsername");
const editBio = document.getElementById("editBio");
const editCustomStatus = document.getElementById("editCustomStatus");
const editBannerColor = document.getElementById("editBannerColor");
const saveProfileBtn = document.getElementById("saveProfileBtn");
const changeAvatarBtn = document.getElementById("changeAvatarBtn");

editProfileBtn.addEventListener("click", () => {
    editAvatarPreview.src = profileAvatar.src;
    editUsername.value = profileUsername.textContent;
    editBio.value = profileBio.dataset.raw || (profileBio.textContent === "No bio yet." ? "" : profileBio.textContent);
    editCustomStatus.value = profileCustomStatus.dataset.status || "";
    editBannerColor.value = currentProfileColor;

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
            editAvatarPreview.src = data.avatar;
            showInAppNotification("Avatar updated", "Your new photo is saved.");
        });
    } catch (err) {
        console.error(err);
        alert("Upload failed.");
    }
});

saveProfileBtn.addEventListener("click", () => {
    socket.emit("update profile", {
        username: editUsername.value.trim(),
        bio: editBio.value.trim(),
        customStatus: editCustomStatus.value.trim(),
        profileColor: editBannerColor.value
    }, (res) => {
        if (!res.success) {
            return alert(res.message);
        }

        username = editUsername.value.trim();
        profileUsername.textContent = username;
        profileBio.textContent = editBio.value.trim() || "No bio yet.";
        profileBio.dataset.raw = editBio.value.trim();
        profileCustomStatus.dataset.status = editCustomStatus.value.trim();
        profileCustomStatus.textContent = editCustomStatus.value.trim() || "No custom status";
        currentProfileColor = editBannerColor.value;
        profileBanner.style.background = currentProfileColor;

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

        addFriendBtn.textContent = "Request sent";
        addFriendBtn.disabled = true;
        addFriendBtn.classList.add("is-request-sent");
    });
});

// =========================
// LOAD FRIEND REQUESTS
// =========================
function loadFriendRequests() {
    const container = document.getElementById("friendRequests");

    socket.emit("get friend requests", (requests) => {
        container.innerHTML = "";

        if (!requests.length) {
            container.textContent = "No requests";
            return;
        }

        requests.forEach(request => {
            const div = document.createElement("div");

            div.innerHTML = `
                ${escapeHTML(request.sender)}
                <button class="acceptFriendBtn" type="button">
                    Accept
                </button>
            `;

            const button = div.querySelector(".acceptFriendBtn");

            button.addEventListener("click", () => {
                socket.emit("accept friend request", request.sender, (res) => {
                    if (!res.success) {
                        return alert("Couldn't accept request.");
                    }

                    loadFriendRequests();
                    loadFriends();
                });
            });

            container.appendChild(div);
        });
    });
}

// =========================
// FRIEND DISCOVERY SEARCH
// =========================
let friendSearchTimer = null;
let friendSearchRequest = 0;

function setSidebarTab(tabName) {
    document.querySelectorAll("[data-sidebar-tab]").forEach(button => {
        const active = button.dataset.sidebarTab === tabName;
        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", active ? "true" : "false");
    });
    document.querySelectorAll("[data-sidebar-panel]").forEach(panel => {
        const active = panel.dataset.sidebarPanel === tabName;
        panel.classList.toggle("active", active);
        panel.hidden = !active;
    });
}

document.querySelectorAll("[data-sidebar-tab]").forEach(button => {
    button.addEventListener("click", () => setSidebarTab(button.dataset.sidebarTab));
});

function renderFriendSearchResults(users) {
    if (!friendSearchResults) return;
    friendSearchResults.innerHTML = "";
    if (!users.length) {
        const empty = document.createElement("p");
        empty.className = "sidebar-empty-note";
        empty.textContent = "No users found.";
        friendSearchResults.appendChild(empty);
        return;
    }

    users.forEach(person => {
        const row = document.createElement("div");
        row.className = "discover-user";
        const avatar = document.createElement("img");
        avatar.className = "discover-avatar";
        avatar.src = person.avatar || "/default-avatar.png";
        avatar.alt = "";
        const details = document.createElement("div");
        details.className = "discover-user-details";
        const name = document.createElement("button");
        name.type = "button";
        name.className = "discover-username";
        name.textContent = person.username;
        name.addEventListener("click", () => openProfile(person.username));
        const bio = document.createElement("span");
        bio.className = "discover-user-bio";
        bio.textContent = person.bio || "No bio";
        details.append(name, bio);

        const action = document.createElement("button");
        action.type = "button";
        action.className = "discover-add-button";
        if (person.relationship === "friend") {
            action.textContent = "Friends";
            action.disabled = true;
        } else if (person.relationship === "sent") {
            action.textContent = "Requested";
            action.disabled = true;
        } else if (person.relationship === "received") {
            action.textContent = "Accept";
            action.addEventListener("click", () => {
                socket.emit("accept friend request", person.username, result => {
                    if (!result?.success) return showInAppNotification("Couldn't accept request", "Please try again.");
                    searchFriendUsers(friendSearchInput.value);
                    loadFriendRequests();
                    loadFriends();
                });
            });
        } else {
            action.textContent = "Add";
            action.addEventListener("click", () => {
                action.disabled = true;
                socket.emit("send friend request", person.username, result => {
                    if (!result?.success) {
                        action.disabled = false;
                        action.textContent = "Add";
                        showInAppNotification("Couldn't send request", result?.message || "Please try again.");
                        return;
                    }
                    action.textContent = "Requested";
                    action.classList.add("is-request-sent");
                });
            });
        }

        row.append(avatar, details, action);
        friendSearchResults.appendChild(row);
    });
}

function searchFriendUsers(value) {
    if (!friendSearchResults) return;
    const query = String(value || "").trim();
    if (query.length < 2) {
        friendSearchResults.innerHTML = '<p class="sidebar-empty-note">Type at least 2 characters to search.</p>';
        return;
    }
    const requestId = ++friendSearchRequest;
    friendSearchResults.innerHTML = '<p class="sidebar-empty-note">Searching...</p>';
    socket.emit("search users", query, result => {
        if (requestId !== friendSearchRequest) return;
        if (!result?.success) {
            friendSearchResults.innerHTML = '<p class="sidebar-empty-note">Search is unavailable right now.</p>';
            return;
        }
        renderFriendSearchResults(result.users || []);
    });
}

if (friendSearchInput) {
    friendSearchInput.addEventListener("input", () => {
        clearTimeout(friendSearchTimer);
        friendSearchTimer = setTimeout(() => searchFriendUsers(friendSearchInput.value), 220);
    });
}

// =========================
// LIVE FRIEND UPDATES
// =========================
socket.on("friends updated", () => {
    loadFriendRequests();
    loadFriends();
});

socket.on("new friend request", data => {
    loadFriendRequests();

    const sender = data?.sender || "Someone";
    showInAppNotification(
        "New friend request",
        `${sender} sent you a friend request.`,
        "friends"
    );

    if (jetchatSettings.sound) {
        try {
            playSound(560);
        } catch (error) {
            console.warn("Notification sound could not play:", error);
        }
    }

    if (
        jetchatSettings.browserNotifications &&
        "Notification" in window &&
        Notification.permission === "granted"
    ) {
        try {
            new Notification("New friend request", {
                body: `${sender} sent you a friend request.`,
                icon: "/logo.png",
                tag: "jetchat-friend-request"
            });
        } catch (error) {
            console.warn("Friend request notification could not be shown:", error);
        }
    }
});

// =========================
// GLOBAL CHAT BUTTON
// =========================
globalChatBtn.addEventListener("click", () => {
    openConversation("global");
});

// =========================
// WHAT'S NEW UPDATE SYSTEM
// =========================

const updateModal = document.getElementById("updateModal");
const updateTitle = document.getElementById("updateTitle");
const updateVersion = document.getElementById("updateVersion");
const updateDate = document.getElementById("updateDate");
const updateItems = document.getElementById("updateItems");

const updateOk = document.getElementById("updateOk");
const updateClose = document.getElementById("updateClose");

let currentUpdateId = null;
let dismissingUpdate = false;

function loadUpdateNotice() {
    socket.emit("get current update", (res) => {
        if (!res || !res.success || !res.update) return;

        const update = res.update;

        currentUpdateId = update.id;

        updateTitle.textContent = update.title;
        updateVersion.textContent = "Version " + update.version;
        updateDate.textContent = update.date;

        updateItems.innerHTML = "";

        update.items.forEach(item => {
            const li = document.createElement("li");
            li.textContent = item;
            updateItems.appendChild(li);
        });

        updateModal.style.display = "flex";
    });
}

function dismissCurrentUpdate() {
    if (!currentUpdateId || dismissingUpdate) return;

    dismissingUpdate = true;

    updateOk.disabled = true;
    updateClose.disabled = true;

    socket.emit("dismiss update", currentUpdateId, (res) => {
        dismissingUpdate = false;

        updateOk.disabled = false;
        updateClose.disabled = false;

        if (!res || !res.success) {
            alert("Couldn't save your update preference. Please try again.");
            return;
        }

        updateModal.style.display = "none";
        currentUpdateId = null;
    });
}

if (updateOk) {
    updateOk.addEventListener("click", dismissCurrentUpdate);
}

if (updateClose) {
    updateClose.addEventListener("click", dismissCurrentUpdate);
}


// =========================
// KEYBOARD NAVIGATION SHORTCUTS
// =========================
document.addEventListener("keydown", event => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "k") {
        event.preventDefault();
        if (dmSearchInput) dmSearchInput.focus();
    } else if (key === "/") {
        event.preventDefault();
        messageInput?.focus();
    }
});
document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    const savedModal = document.getElementById("savedMessagesModal");
    if (savedModal?.style.display === "flex") savedModal.style.display = "none";
});

window.setInterval(() => {
    if (socket.connected && username) socket.emit("session activity");
}, 5 * 60 * 1000);
