(() => {
  "use strict";
  const api = "/api/social";
  let currentView = "home";
  let busy = false;
  const app = document.getElementById("app");
  if (!app) return;

  const overlay = document.createElement("section");
  overlay.id = "socialExperience";
  overlay.className = "social-experience";
  overlay.hidden = true;
  overlay.innerHTML = `
    <aside class="social-rail">
      <div class="social-brand"><span class="social-brand-mark">J</span><span>Jetchat</span></div>
      <button class="social-nav active" data-view="home"><span>⌂</span> Home</button>
      <button class="social-nav" data-view="explore"><span>⌕</span> Explore</button>
      <button class="social-nav" data-view="create"><span>＋</span> Create post</button>
      <div class="social-rail-spacer"></div>
      <button class="social-nav social-return" data-view="chats"><span>▤</span> Back to chats</button>
      <div class="social-rail-footer">Your world. Your people.</div>
    </aside>
    <main class="social-main">
      <header class="social-top">
        <div><p class="social-eyebrow">THE SOCIAL SIDE OF JETCHAT</p><h1 id="socialHeading">Your feed</h1></div>
        <button class="social-create-top" data-view="create">＋ Create</button>
      </header>
      <div class="social-content">
        <section class="social-feed-column">
          <div id="socialStoriesHint" class="social-welcome"><div><strong>Welcome to Jetchat Social</strong><p>Share a moment, discover people and see what your circle is up to.</p></div><span>✦</span></div>
          <div id="socialFeed" class="social-feed" aria-live="polite"><div class="social-loading">Loading your feed…</div></div>
        </section>
        <aside class="social-side-panel">
          <div class="social-side-card"><span class="social-side-icon">✦</span><h3>Make it yours</h3><p>Follow people whose posts you want to see. Your Home feed will fill up as your circle grows.</p><button data-view="explore">Discover people →</button></div>
          <div class="social-side-note">Jetchat Social · 3.6.4</div>
        </aside>
      </div>
    </main>
    <div id="socialModal" class="social-modal" hidden>
      <form id="socialCreateForm" class="social-modal-card">
        <div class="social-modal-head"><div><p class="social-eyebrow">SHARE SOMETHING</p><h2>Create a post</h2></div><button type="button" class="social-modal-close" aria-label="Close">×</button></div>
        <textarea id="socialPostBody" maxlength="2000" placeholder="What's happening?" rows="5"></textarea>
        <label class="social-image-picker">＋ Add a photo <input id="socialPostImage" type="file" accept="image/jpeg,image/png,image/gif,image/webp"></label>
        <p id="socialImageName" class="social-image-name">No photo selected · 8 MB maximum</p>
        <p id="socialCreateStatus" class="social-status" role="status"></p>
        <div class="social-modal-actions"><button type="button" class="social-cancel">Cancel</button><button type="submit" class="social-publish">Publish post</button></div>
      </form>
    </div>
  `;
  app.appendChild(overlay);

  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "social-launcher";
  launcher.textContent = "✦ Explore Jetchat";
  launcher.addEventListener("click", () => openView("home"));
  const sidebar = document.getElementById("mobileSidebar");
  if (sidebar) {
    const logo = sidebar.querySelector(".logo");
    if (logo) logo.insertAdjacentElement("afterend", launcher);
  }

  const feed = overlay.querySelector("#socialFeed");
  const heading = overlay.querySelector("#socialHeading");
  const modal = overlay.querySelector("#socialModal");
  const createForm = overlay.querySelector("#socialCreateForm");
  const status = overlay.querySelector("#socialCreateStatus");
  const imageInput = overlay.querySelector("#socialPostImage");

  function openView(view) {
    if (view === "chats") {
      overlay.hidden = true;
      return;
    }
    overlay.hidden = false;
    currentView = view;
    overlay.querySelectorAll(".social-nav").forEach(button => button.classList.toggle("active", button.dataset.view === view));
    if (view === "create") { modal.hidden = false; return; }
    modal.hidden = true;
    heading.textContent = view === "explore" ? "Explore" : "Your feed";
    const storiesHint = overlay.querySelector("#socialStoriesHint");
    if (storiesHint) storiesHint.hidden = view === "explore";
    loadPosts(view);
  }

  async function request(path, options = {}) {
    const response = await fetch(api + path, { credentials: "same-origin", cache: "no-store", ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) throw new Error(data.message || "Something went wrong.");
    return data;
  }

  function timeAgo(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) return "Just now";
    if (seconds < 3600) return Math.floor(seconds / 60) + "m";
    if (seconds < 86400) return Math.floor(seconds / 3600) + "h";
    if (seconds < 604800) return Math.floor(seconds / 86400) + "d";
    return date.toLocaleDateString();
  }

  function makeButton(label, className, action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.addEventListener("click", event => action(event));
    return button;
  }

  function renderPost(post) {
    const card = document.createElement("article");
    card.className = "social-post";
    card.dataset.postId = post.id;

    const head = document.createElement("header");
    head.className = "social-post-head";
    const avatar = document.createElement("div");
    avatar.className = "social-post-avatar";
    avatar.textContent = String(post.username || "?").slice(0, 1).toUpperCase();
    const identity = document.createElement("div");
    identity.className = "social-post-identity";
    const author = makeButton("@" + post.username, "social-author", () => openProfile(post.username));
    const time = document.createElement("span");
    time.textContent = timeAgo(post.createdAt);
    identity.append(author, time);
    head.append(avatar, identity);
    if (!post.following && !post.isMe) {
      head.append(makeButton("＋ Follow", "social-follow-small", () => toggleFollow(post.username, card)));
    }
    card.append(head);

    if (post.body) {
      const body = document.createElement("p");
      body.className = "social-post-body";
      body.textContent = post.body;
      card.append(body);
    }
    if (post.hasImage) {
      const image = document.createElement("img");
      image.className = "social-post-image";
      image.loading = "lazy";
      image.alt = "Photo shared by " + post.username;
      image.src = api + "/images/" + encodeURIComponent(post.id);
      card.append(image);
    }

    const actions = document.createElement("div");
    actions.className = "social-post-actions";
    const like = makeButton((post.likedByMe ? "♥" : "♡") + "  " + post.likeCount, "social-like" + (post.likedByMe ? " liked" : ""), () => toggleLike(post, like));
    const comments = makeButton("▱  " + post.commentCount + " comments", "social-comment-toggle", () => showComments(post.id, card));
    actions.append(like, comments);
    card.append(actions);

    const commentArea = document.createElement("div");
    commentArea.className = "social-comments";
    commentArea.hidden = true;
    card.append(commentArea);
    return card;
  }

  async function loadPosts(view) {
    feed.innerHTML = '<div class="social-loading">Loading posts…</div>';
    try {
      const data = await request(view === "explore" ? "/explore" : "/feed");
      feed.replaceChildren();
      if (!data.posts.length) {
        const empty = document.createElement("div");
        empty.className = "social-empty";
        empty.innerHTML = '<div class="social-empty-symbol">✦</div><h2>' + (view === "explore" ? "It's quiet out here" : "Your feed is waiting") + '</h2><p>' + (view === "explore" ? "Be the first to share something with the Jetchat community." : "Follow people or publish your first post to get things started.") + '</p>';
        empty.append(makeButton("＋ Create a post", "social-publish", () => openView("create")));
        feed.append(empty);
        return;
      }
      data.posts.forEach(post => feed.append(renderPost(post)));
    } catch (error) {
      feed.innerHTML = "";
      const message = document.createElement("p");
      message.className = "social-error";
      message.textContent = error.message;
      feed.append(message, makeButton("Try again", "social-retry", () => loadPosts(view)));
    }
  }

  async function toggleLike(post, button) {
    button.disabled = true;
    try {
      const data = await request("/posts/" + encodeURIComponent(post.id) + "/like", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      post.likedByMe = data.liked;
      post.likeCount = data.count;
      button.textContent = (data.liked ? "♥" : "♡") + "  " + data.count;
      button.classList.toggle("liked", data.liked);
    } catch (error) { button.title = error.message; }
    finally { button.disabled = false; }
  }

  async function toggleFollow(target, card) {
    const button = card.querySelector(".social-follow-small");
    if (button) button.disabled = true;
    try {
      const data = await request("/users/" + encodeURIComponent(target) + "/follow", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (button) {
        button.textContent = data.following ? "Following" : "＋ Follow";
        button.classList.toggle("is-following", data.following);
      }
    } catch (error) { if (button) button.title = error.message; }
    finally { if (button) button.disabled = false; }
  }

  async function showComments(postId, card) {
    const area = card.querySelector(".social-comments");
    area.hidden = !area.hidden;
    if (area.hidden) return;
    area.innerHTML = '<div class="social-loading">Loading comments…</div>';
    try {
      const data = await request("/posts/" + encodeURIComponent(postId) + "/comments");
      area.replaceChildren();
      data.comments.forEach(comment => {
        const line = document.createElement("p");
        const name = document.createElement("strong");
        name.textContent = "@" + comment.username + " ";
        const body = document.createTextNode(comment.body);
        line.append(name, body);
        area.append(line);
      });
      const form = document.createElement("form");
      form.className = "social-comment-form";
      const input = document.createElement("input");
      input.maxLength = 500;
      input.placeholder = "Write a comment…";
      input.required = true;
      const submit = document.createElement("button");
      submit.textContent = "Send";
      submit.type = "submit";
      form.append(input, submit);
      form.addEventListener("submit", async event => {
        event.preventDefault();
        submit.disabled = true;
        try {
          await request("/posts/" + encodeURIComponent(postId) + "/comments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: input.value }) });
          area.hidden = true;
          showComments(postId, card);
        } catch (error) { input.setCustomValidity(error.message); input.reportValidity(); }
        finally { submit.disabled = false; }
      });
      area.append(form);
    } catch (error) { area.textContent = error.message; }
  }

  async function openProfile(target) {
    try {
      const data = await request("/profile/" + encodeURIComponent(target));
      const profile = data.profile;
      const panel = document.createElement("section");
      panel.className = "social-profile-view";
      const top = document.createElement("div");
      top.className = "social-profile-top";
      const close = makeButton("← Back", "social-back", () => panel.remove());
      const avatar = document.createElement("div");
      avatar.className = "social-profile-avatar";
      avatar.textContent = profile.username.slice(0, 1).toUpperCase();
      const details = document.createElement("div");
      details.className = "social-profile-details";
      const name = document.createElement("h2");
      name.textContent = "@" + profile.username;
      const bio = document.createElement("p");
      bio.textContent = profile.bio || "No bio yet.";
      const stats = document.createElement("p");
      stats.textContent = profile.followers + " followers · " + profile.following + " following";
      details.append(name, bio, stats);
      top.append(close, avatar, details);
      if (!profile.isMe) top.append(makeButton(profile.is_following ? "Following" : "＋ Follow", "social-profile-follow", async event => {
        const result = await request("/users/" + encodeURIComponent(profile.username) + "/follow", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        event.currentTarget.textContent = result.following ? "Following" : "＋ Follow";
      }));
      panel.append(top);
      const title = document.createElement("h3");
      title.className = "social-profile-posts-title";
      title.textContent = "Posts";
      panel.append(title);
      const posts = document.createElement("div");
      posts.className = "social-feed";
      data.posts.forEach(post => posts.append(renderPost(post)));
      if (!data.posts.length) posts.textContent = "No posts yet.";
      panel.append(posts);
      overlay.append(panel);
    } catch (error) { window.alert(error.message); }
  }

  function closeModal() { modal.hidden = true; createForm.reset(); status.textContent = ""; overlay.querySelector("#socialImageName").textContent = "No photo selected · 8 MB maximum"; }
  function openCreate() { modal.hidden = false; overlay.querySelector("#socialPostBody").focus(); }
  overlay.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => button.dataset.view === "create" ? openCreate() : openView(button.dataset.view)));
  overlay.querySelector(".social-modal-close").addEventListener("click", closeModal);
  overlay.querySelector(".social-cancel").addEventListener("click", closeModal);
  imageInput.addEventListener("change", () => {
    const file = imageInput.files[0];
    overlay.querySelector("#socialImageName").textContent = file ? file.name + " · " + (file.size / 1024 / 1024).toFixed(1) + " MB" : "No photo selected · 8 MB maximum";
  });
  createForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy) return;
    const file = imageInput.files[0];
    if (file && file.size > 8 * 1024 * 1024) { status.textContent = "Choose an image smaller than 8 MB."; return; }
    busy = true;
    status.textContent = "Publishing…";
    const button = overlay.querySelector(".social-publish");
    button.disabled = true;
    try {
      const form = new FormData();
      form.append("body", overlay.querySelector("#socialPostBody").value);
      if (file) form.append("image", file);
      await request("/posts", { method: "POST", body: form });
      closeModal();
      overlay.querySelector(".social-content").innerHTML = '<section class="social-feed-column"><div class="social-welcome"><div><strong>Your post is live.</strong><p>It is now part of the Jetchat community.</p></div><span>✦</span></div><div id="socialFeed" class="social-feed"></div></section><aside class="social-side-panel"><div class="social-side-card"><span class="social-side-icon">✦</span><h3>Keep sharing</h3><p>Discover people and build your circle.</p><button data-view="explore">Discover people →</button></div></aside>';
      overlay.querySelector('[data-view="explore"]').addEventListener("click", () => openView("explore"));
      loadPosts(currentView === "explore" ? "explore" : "home");
    } catch (error) { status.textContent = error.message; }
    finally { busy = false; button.disabled = false; }
  });

  window.addEventListener("keydown", event => { if (event.key === "Escape" && !overlay.hidden) { if (!modal.hidden) closeModal(); else openView("chats"); } });
  window.openJetchatSocial = openView;
})();