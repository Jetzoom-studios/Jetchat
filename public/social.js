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
      <button class="social-nav" data-view="reels"><span>▶</span> Reels</button>
      <button class="social-nav" data-view="clubs"><span>◈</span> Clubs</button>
      <button class="social-nav" data-view="pulse"><span>✦</span> Pulse</button>
      <button class="social-nav" data-view="relay"><span>⤴</span> Relay</button>
      <button class="social-nav" data-view="trending"><span>#</span> Trending</button>
      <button class="social-nav" data-view="create"><span>＋</span> Create</button>
      <button class="social-nav" data-view="chats"><span>▤</span> Chat</button>
      <div class="social-rail-spacer"></div>
      <div class="social-rail-footer">Your world. Your people.</div>
    </aside>
    <main class="social-main">
      <header class="social-top">
        <div><p class="social-eyebrow">THE SOCIAL SIDE OF JETCHAT</p><h1 id="socialHeading">Your feed</h1></div>
        <div class="social-top-actions">
          <button id="socialProfileButton" class="social-profile-top-button" type="button"><span class="social-profile-top-avatar">●</span><span>My Profile</span></button>
          <button id="socialNotificationsButton" class="social-notifications-button" type="button" aria-label="Notifications" aria-expanded="false">♧<span id="socialNotificationBadge" hidden>0</span></button>
          <button class="social-create-top" data-view="create">＋ Create</button>
        </div>
      </header>
      <section id="socialFeaturePage" class="social-feature-page" hidden></section>
      <div class="social-content">
        <section class="social-feed-column">
          <section id="socialStoriesBar" class="social-stories-bar" aria-label="Stories">
            <button id="socialAddStory" class="social-story-add" type="button"><span class="social-story-avatar">＋</span><span>Your story</span></button>
            <div id="socialStoryPeople" class="social-story-people"></div>
          </section>
          <div id="socialStoriesHint" class="social-welcome"><div><strong>Welcome to Jetchat Social</strong><p>Share a moment, discover people and see what your circle is up to.</p></div><span>✦</span></div>
          <div id="socialFeed" class="social-feed" aria-live="polite"><div class="social-loading">Loading your feed…</div></div>
        </section>
        <aside class="social-side-panel">
          <div class="social-side-card"><span class="social-side-icon">✦</span><h3>Make it yours</h3><p>Follow people whose posts you want to see. Your Home feed will fill up as your circle grows.</p><button data-view="explore">Discover people →</button></div>
          <div class="social-side-note">Jetchat Social · 3.8.0</div>
        </aside>
      </div>
    </main>
    <section id="socialChatHub" class="social-chat-hub" hidden aria-label="Chats">
      <header class="social-chat-heading"><div><p class="social-eyebrow">YOUR CONVERSATIONS</p><h1>Chat</h1></div><span class="social-chat-count" id="socialChatCount">Your people, all in one place</span></header>
      <div class="social-chat-hub-content">
        <section class="social-add-friends-card"><h2>Add friends</h2><p>Find people and start a conversation.</p><div id="socialFriendSearchMount"></div><div id="socialFriendResultsMount"></div></section>
        <div id="socialGlobalChatMount" class="social-global-chat"><span class="social-global-icon">◎</span><span class="social-global-copy"><strong>Global Chat</strong><small>Join the community conversation</small></span><span class="social-chat-arrow">›</span></div>
        <section class="social-chat-list-card"><div class="social-chat-list-heading"><h2>Recent conversations</h2><span id="socialDmCount"></span></div><div id="socialDmSearchMount"></div><div id="socialDmListMount"></div></section>
        <section class="social-chat-list-card social-groups-card"><div class="social-chat-list-heading"><h2>Group chats</h2><div id="socialCreateGroupMount"></div></div><div id="socialGroupListMount"></div></section>
      </div>
    </section>
    <section id="socialChatRoom" class="social-chat-room" hidden aria-label="Chat workspace">
      <aside class="social-chat-room-sidebar">
        <header class="social-chat-room-sidebar-head"><div><p class="social-eyebrow">YOUR SPACE</p><h2>Inbox</h2></div><span id="socialInboxCount"></span></header>
        <nav class="social-chat-tabs" role="tablist" aria-label="Conversation filters">
          <button type="button" class="active" data-chat-tab="all" role="tab" aria-selected="true">All</button>
          <button type="button" data-chat-tab="unread" role="tab" aria-selected="false">Unread</button>
          <button type="button" data-chat-tab="groups" role="tab" aria-selected="false">Groups</button>
          <button type="button" data-chat-tab="friends" role="tab" aria-selected="false">Friends</button>
        </nav>
        <section class="social-chat-room-section" data-chat-section="global"><div class="social-chat-section-label">COMMUNITY</div><div id="socialChatGlobalMount"></div></section>
        <section class="social-chat-room-section" data-chat-section="dm"><div class="social-chat-section-label">DIRECT MESSAGES <span id="socialInboxDmCount"></span></div><div id="socialChatDmSearchMount"></div><div id="socialChatDmListMount"></div></section>
        <section class="social-chat-room-section" data-chat-section="groups"><div class="social-chat-section-label">GROUPS <span id="socialChatCreateGroupMount"></span></div><div id="socialChatGroupListMount"></div></section>
        <section class="social-chat-room-section" data-chat-section="friends" hidden><div class="social-chat-section-label">FRIEND REQUESTS</div><div id="socialChatFriendRequestsMount"></div><div class="social-chat-section-label social-friends-label">YOUR FRIENDS</div><div id="socialChatFriendsMount"></div><div id="socialChatFriendSearchMount"></div><div id="socialChatFriendResultsMount"></div></section>
      </aside>
      <div class="social-chat-room-main">
        <nav class="social-chat-room-tabs" aria-label="Chat workspace tabs">
          <button type="button" class="active" data-room-tab="messages">Messages</button>
          <button type="button" data-room-tab="media">Shared media</button>
        </nav>
        <div id="socialChatRoomMain"></div>
      </div>
    </section>

    <div id="socialModal" class="social-modal" hidden>
      <form id="socialCreateForm" class="social-modal-card">
        <div class="social-modal-head"><div><p class="social-eyebrow">SHARE SOMETHING</p><h2>Create a post</h2></div><button type="button" class="social-modal-close" aria-label="Close">×</button></div>
        <textarea id="socialPostBody" maxlength="2000" placeholder="What's happening?" rows="5"></textarea>
        <label class="social-image-picker">＋ Add photo or video <input id="socialPostImage" type="file" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime"></label>
        <p id="socialImageName" class="social-image-name">Photos up to 8 MB · Videos up to 25 MB (MP4, WebM, MOV)</p>
        <p id="socialCreateStatus" class="social-status" role="status"></p>
        <div class="social-modal-actions"><button type="button" class="social-cancel">Cancel</button><button type="submit" class="social-publish">Publish post</button></div>
      </form>
    </div>
  `;
  app.appendChild(overlay);
  const notificationPanel = document.createElement("section");
  notificationPanel.className = "social-notification-panel";
  notificationPanel.hidden = true;
  notificationPanel.innerHTML = '<header><div><p class="social-eyebrow">YOUR ACTIVITY</p><h2>Notifications</h2></div><button type="button" class="social-notification-close" aria-label="Close">×</button></header><div class="social-notification-tools"><button type="button" id="socialMarkAllRead">Mark all read</button><button type="button" id="socialClearNotifications">Clear all</button></div><div id="socialNotificationList" aria-live="polite"><p class="social-loading">Loading activity…</p></div>';
  overlay.appendChild(notificationPanel);

  const sidebar = document.getElementById("mobileSidebar");
  const chatHub = overlay.querySelector("#socialChatHub");
  const chatRoom = overlay.querySelector("#socialChatRoom");
  const socialMain = overlay.querySelector(".social-main");
  const mount = (elementId, targetId) => {
    const element = document.getElementById(elementId);
    const target = overlay.querySelector("#" + targetId);
    if (element && target && element.parentElement !== target) target.appendChild(element);
  };
  // Reuse the real chat controls and live-rendered lists; no duplicate chat state.
  mount("globalChatBtn", "socialChatGlobalMount");
  mount("dmSearchInput", "socialChatDmSearchMount");
  mount("dmList", "socialChatDmListMount");
  mount("createGroupBtn", "socialChatCreateGroupMount");
  mount("groupList", "socialChatGroupListMount");
  mount("friendRequests", "socialChatFriendRequestsMount");
  mount("friendsList", "socialChatFriendsMount");
  mount("friendSearchInput", "socialChatFriendSearchMount");
  mount("friendSearchResults", "socialChatFriendResultsMount");
  const legacyMain = app.querySelector(".main");
  const chatRoomMain = overlay.querySelector("#socialChatRoomMain");
  if (legacyMain && chatRoomMain) chatRoomMain.appendChild(legacyMain);
  if (sidebar) sidebar.hidden = true;
  const chatReturnButton = document.createElement("button");
  chatReturnButton.type = "button";
  chatReturnButton.className = "social-chat-return-button";
  chatReturnButton.textContent = "← Chat list";
  chatReturnButton.addEventListener("click", () => openView("chats"));
  const appTopbar = app.querySelector(".topbar");
  if (appTopbar) appTopbar.insertBefore(chatReturnButton, appTopbar.firstChild);

  const chatHubCount = overlay.querySelector("#socialChatCount");
  const dmCount = overlay.querySelector("#socialDmCount");
  const updateChatCounts = () => {
    if (dmCount) dmCount.textContent = document.getElementById("dmConversationCount")?.textContent || "";
    if (chatHubCount) chatHubCount.textContent = "Your conversations, always in reach";
  };
  const countObserver = new MutationObserver(updateChatCounts);
  const countNode = document.getElementById("dmConversationCount");
  if (countNode) countObserver.observe(countNode, { childList: true, characterData: true, subtree: true });
  updateChatCounts();

  const feed = overlay.querySelector("#socialFeed");
  const featurePage = overlay.querySelector("#socialFeaturePage");
  const socialContent = overlay.querySelector(".social-content");
  const heading = overlay.querySelector("#socialHeading");
  const modal = overlay.querySelector("#socialModal");
  const createForm = overlay.querySelector("#socialCreateForm");
  const status = overlay.querySelector("#socialCreateStatus");
  const imageInput = overlay.querySelector("#socialPostImage");
  const profileButton = overlay.querySelector("#socialProfileButton");
  profileButton?.addEventListener("click", () => {
    if (typeof window.openJetchatOwnProfile === "function") window.openJetchatOwnProfile();
  });
  const notificationButton = overlay.querySelector("#socialNotificationsButton");
  const notificationBadge = overlay.querySelector("#socialNotificationBadge");
  const notificationList = notificationPanel.querySelector("#socialNotificationList");
  let notificationItems = [];

  let storyGroups = [];
  let activeStoryGroup = [];
  let activeStoryIndex = 0;
  let storyTimer = null;
  const storyComposer = document.createElement("div");
  storyComposer.className = "social-story-composer";
  storyComposer.hidden = true;
  storyComposer.innerHTML = '<form class="social-story-composer-card"><div class="social-story-composer-head"><div><p class="social-eyebrow">A MOMENT THAT LASTS 24 HOURS</p><h2>Add to your story</h2></div><button type="button" class="social-story-close" aria-label="Close">×</button></div><label class="social-image-picker">＋ Choose photo or video <input id="socialStoryFile" type="file" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime" required></label><p class="social-image-name" id="socialStoryFileName">Photos and videos · 25 MB maximum</p><textarea id="socialStoryCaption" maxlength="180" placeholder="Add a caption…" rows="3"></textarea><p class="social-status" id="socialStoryStatus" role="status"></p><div class="social-modal-actions"><button type="button" class="social-cancel social-story-cancel">Cancel</button><button type="submit" class="social-publish">Share story</button></div></form>';
  overlay.appendChild(storyComposer);
  const storyViewer = document.createElement("div");
  storyViewer.className = "social-story-viewer";
  storyViewer.hidden = true;
  storyViewer.innerHTML = '<div class="social-story-viewer-card"><div class="social-story-progress" id="socialStoryProgress"></div><header><strong id="socialStoryAuthor"></strong><span id="socialStoryAge"></span><button type="button" id="socialStoryViewerClose" aria-label="Close">×</button></header><div class="social-story-stage" id="socialStoryStage"></div><footer><button type="button" id="socialStoryPrevious">‹</button><span id="socialStoryCaptionView"></span><button type="button" id="socialStoryNext">›</button></footer><form id="socialStoryReplyForm" class="social-story-reply-form"><input id="socialStoryReplyInput" maxlength="1000" placeholder="Reply to this Story…" autocomplete="off" required><button type="submit">Send</button></form><button type="button" id="socialStoryViews" class="social-story-views" hidden>View viewers</button><div id="socialStoryViewerList" class="social-story-viewer-list" hidden></div></div>';
  overlay.appendChild(storyViewer);
  const storyBar = overlay.querySelector("#socialStoriesBar");
  const storyPeople = overlay.querySelector("#socialStoryPeople");
  const storyFile = overlay.querySelector("#socialStoryFile");
  const storyCaption = overlay.querySelector("#socialStoryCaption");
  const storyStatus = overlay.querySelector("#socialStoryStatus");
  const storyComposerForm = storyComposer.querySelector("form");
  const storyReplyForm = storyViewer.querySelector("#socialStoryReplyForm");
  const storyReplyInput = storyViewer.querySelector("#socialStoryReplyInput");
  const storyViewerStage = storyViewer.querySelector("#socialStoryStage");
  const closeStoryComposer = () => { storyComposer.hidden = true; storyComposerForm.reset(); storyStatus.textContent = ""; storyComposer.querySelector("#socialStoryFileName").textContent = "Photos and videos · 25 MB maximum"; };
  function groupStories(stories) {
    const groups = new Map();
    stories.forEach(story => {
      if (!groups.has(story.username)) groups.set(story.username, []);
      groups.get(story.username).push(story);
    });
    return [...groups.entries()].map(([username, items]) => ({ username, stories: items.sort((a,b) => new Date(a.createdAt)-new Date(b.createdAt)), viewed: items.every(item => item.viewedByMe), isMe: items[0].isMe }))
      .sort((a,b) => Number(b.isMe)-Number(a.isMe) || Number(a.viewed)-Number(b.viewed) || new Date(b.stories[b.stories.length-1].createdAt)-new Date(a.stories[a.stories.length-1].createdAt));
  }
  async function loadStories() {
    try {
      const data = await request("/stories");
      storyGroups = groupStories(data.stories || []);
      storyPeople.replaceChildren();
      storyGroups.forEach((group, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "social-story-person" + (group.viewed ? " viewed" : "");
        const avatar = document.createElement("span");
        avatar.className = "social-story-avatar";
        avatar.textContent = group.username.slice(0,1).toUpperCase();
        const name = document.createElement("span");
        name.textContent = group.isMe ? "Your story" : group.username;
        button.append(avatar, name);
        button.addEventListener("click", () => openStoryGroup(index));
        storyPeople.append(button);
      });
      storyBar.hidden = currentView !== "home";
    } catch (error) {
      storyBar.title = error.message;
    }
  }
  async function openStoryGroup(groupIndex) {
    const group = storyGroups[groupIndex];
    if (!group) return;
    activeStoryGroup = group.stories;
    activeStoryIndex = 0;
    storyViewer.hidden = false;
    await renderActiveStory();
  }
  async function renderActiveStory() {
    if (storyTimer) clearTimeout(storyTimer);
    const story = activeStoryGroup[activeStoryIndex];
    if (!story) { storyViewer.hidden = true; loadStories(); return; }
    storyViewer.querySelector("#socialStoryAuthor").textContent = "@" + story.username;
    storyViewer.querySelector("#socialStoryAge").textContent = timeAgo(story.createdAt);
    storyViewer.querySelector("#socialStoryCaptionView").textContent = story.caption || "";
    storyViewer.querySelector("#socialStoryProgress").innerHTML = activeStoryGroup.map((item,index) => '<span class="' + (index < activeStoryIndex ? "done" : index === activeStoryIndex ? "current" : "") + '"></span>').join("");
    storyViewerStage.replaceChildren();
    const media = document.createElement(story.mediaType.startsWith("video/") ? "video" : "img");
    media.className = "social-story-media";
    media.src = api + "/stories/" + encodeURIComponent(story.id) + "/media";
    if (media.tagName === "VIDEO") { media.controls = true; media.autoplay = true; media.playsInline = true; media.muted = false; }
    else media.alt = "Story shared by " + story.username;
    storyViewerStage.append(media);
    const viewsButton = storyViewer.querySelector("#socialStoryViews");
    const viewers = storyViewer.querySelector("#socialStoryViewerList");
    viewsButton.hidden = !story.isMe;
    viewers.hidden = true;
    viewers.replaceChildren();
    if (story.isMe) viewsButton.textContent = "View viewers · " + (story.viewCount || 0);
    try { await request("/stories/" + encodeURIComponent(story.id) + "/view", { method: "POST" }); } catch {}
    storyReplyForm.hidden = story.isMe;
    storyReplyInput.value = "";
    if (media.tagName === "VIDEO") {
      media.addEventListener("ended", nextStory, { once: true });
    } else {
      storyTimer = setTimeout(nextStory, 5000);
    }
  }
  storyReplyForm.addEventListener("submit", async event => {
    event.preventDefault();
    const story = activeStoryGroup[activeStoryIndex];
    const body = storyReplyInput.value.trim();
    if (!story || !body) return;
    const submit = storyReplyForm.querySelector("button");
    submit.disabled = true;
    try {
      const result = await request("/stories/" + encodeURIComponent(story.id) + "/reply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
      if (window.jetchatSocket) window.jetchatSocket.emit("chat message", { text: "↪ Story reply: " + body, chat: result.recipient, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) });
      storyReplyInput.value = "";
      storyReplyInput.placeholder = "Reply sent";
    } catch (error) { storyReplyInput.setCustomValidity(error.message); storyReplyInput.reportValidity(); }
    finally { submit.disabled = false; }
  });
  function nextStory() { if (activeStoryIndex < activeStoryGroup.length-1) { activeStoryIndex++; renderActiveStory(); } else { storyViewer.hidden = true; loadStories(); } }
  function previousStory() { if (activeStoryIndex > 0) { activeStoryIndex--; renderActiveStory(); } }
  storyViewer.querySelector("#socialStoryViewerClose").addEventListener("click", () => { if(storyTimer)clearTimeout(storyTimer); storyViewer.hidden = true; loadStories(); });
  storyViewer.querySelector("#socialStoryNext").addEventListener("click", nextStory);
  storyViewer.querySelector("#socialStoryPrevious").addEventListener("click", previousStory);
  storyViewer.querySelector("#socialStoryViews").addEventListener("click", async () => {
    const story = activeStoryGroup[activeStoryIndex];
    const list = storyViewer.querySelector("#socialStoryViewerList");
    list.hidden = !list.hidden;
    if (list.hidden) return;
    try {
      const data = await request("/stories/" + encodeURIComponent(story.id) + "/views");
      list.replaceChildren();
      if (!data.views.length) { list.textContent = "No views yet."; return; }
      data.views.forEach(view => { const line = document.createElement("p"); line.textContent = "@" + view.viewer; list.append(line); });
    } catch (error) { list.textContent = error.message; }
  });
  overlay.querySelector("#socialAddStory").addEventListener("click", () => { storyComposer.hidden = false; storyFile.focus(); });
  storyComposer.querySelector(".social-story-close").addEventListener("click", closeStoryComposer);
  storyComposer.querySelector(".social-story-cancel").addEventListener("click", closeStoryComposer);
  storyFile.addEventListener("change", () => { const file=storyFile.files[0]; storyComposer.querySelector("#socialStoryFileName").textContent=file ? file.name+" · "+(file.size/1024/1024).toFixed(1)+" MB" : "Photos and videos · 25 MB maximum"; });
  storyComposerForm.addEventListener("submit", async event => {
    event.preventDefault();
    const file = storyFile.files[0];
    if (!file) { storyStatus.textContent = "Choose a photo or video first."; return; }
    if (file.size > 25*1024*1024) { storyStatus.textContent = "Choose a file smaller than 25 MB."; return; }
    const submit = storyComposerForm.querySelector('[type="submit"]');
    submit.disabled = true; storyStatus.textContent = "Sharing…";
    try {
      const form = new FormData(); form.append("media", file); form.append("caption", storyCaption.value);
      await request("/stories", { method:"POST", body:form });
      closeStoryComposer(); await loadStories();
    } catch(error) { storyStatus.textContent = error.message; }
    finally { submit.disabled = false; }
  });


  function featureHeading(kicker,title,description) {
    const header=document.createElement("div"); header.className="social-feature-heading";
    const small=document.createElement("p"); small.className="social-eyebrow"; small.textContent=kicker;
    const h=document.createElement("h2"); h.textContent=title;
    const p=document.createElement("p"); p.textContent=description;
    header.append(small,h,p); return header;
  }
  function featureCard(className="social-feature-card") { const node=document.createElement("article"); node.className=className; return node; }
  function featureButton(label,action,className="social-feature-button") { return makeButton(label,className,action); }
  function renderFeatureError(container,error,retry) { const p=document.createElement("p"); p.className="social-error"; p.textContent=error.message; container.append(p,featureButton("Try again",retry)); }

  async function loadClubs() {
    featurePage.replaceChildren(featureHeading("FIND YOUR PEOPLE","Clubs","Communities built around the things you love."));
    const create=featureCard(); create.innerHTML='<h3>Start a Club</h3><form class="social-feature-form" id="clubCreateForm"><input name="name" maxlength="40" minlength="3" placeholder="Club name" required><textarea name="description" maxlength="240" placeholder="What is this Club about?"></textarea><select name="visibility"><option value="public">Public · anyone can join</option><option value="private">Private · invite-only</option></select><button class="social-feature-button" type="submit">Create Club</button><p class="social-status" role="status"></p></form>';
    featurePage.append(create);
    create.querySelector("form").addEventListener("submit",async event=>{
      event.preventDefault(); const form=event.currentTarget,button=form.querySelector("button"),status=form.querySelector(".social-status");
      button.disabled=true; status.textContent="Creating…";
      try { await request("/clubs",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:form.elements.name.value,description:form.elements.description.value,visibility:form.elements.visibility.value})}); loadClubs(); }
      catch(error){status.textContent=error.message;} finally{button.disabled=false;}
    });
    const list=featureCard(); list.innerHTML="<h3>Discover Clubs</h3><p class='social-feature-muted'>Join a public community or revisit one you've joined.</p><div class='social-feature-list' id='clubList'>Loading Clubs…</div>"; featurePage.append(list);
    try {
      const data=await request("/clubs"); const target=list.querySelector("#clubList"); target.replaceChildren();
      if(!data.clubs.length){target.textContent="No Clubs yet. Create the first one.";}
      data.clubs.forEach(club=>{
        const item=featureCard("social-feature-list-item"); const info=document.createElement("div");
        const title=document.createElement("h4"); title.textContent=club.name;
        const desc=document.createElement("p"); desc.textContent=club.description||"A Jetchat community.";
        const meta=document.createElement("small"); meta.textContent=club.member_count+" members · "+club.visibility+" · by @"+club.owner;
        info.append(title,desc,meta); item.append(info);
        if(club.joined) item.append(featureButton("Open",()=>openClub(club)));
        else item.append(featureButton("Join Club",async event=>{const button=event.currentTarget;button.disabled=true;try{await request("/clubs/"+club.id+"/join",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});loadClubs();}catch(error){button.title=error.message;button.disabled=false;}}));
        target.append(item);
      });
    } catch(error){list.querySelector("#clubList").textContent=error.message;}
  }
  async function openClub(club) {
    featurePage.replaceChildren(featureButton("← All Clubs",loadClubs,"social-back"),featureHeading("CLUB SPACE",club.name,club.description||"A place for members to share."));
    if(["owner","moderator"].includes(club.my_role)){const invite=featureCard();invite.innerHTML='<h3>Invite a member</h3><form class="social-feature-form"><input name="username" maxlength="20" placeholder="Jetchat username" required><button class="social-feature-button" type="submit">Invite</button><p class="social-status" role="status"></p></form>';featurePage.append(invite);invite.querySelector("form").addEventListener("submit",async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector("button"),status=form.querySelector(".social-status");button.disabled=true;try{const result=await request("/clubs/"+club.id+"/invite",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:form.elements.username.value})});status.textContent="@"+result.username+" added to the Club.";form.reset();}catch(error){status.textContent=error.message;}finally{button.disabled=false;}});}
    const formCard=featureCard(); formCard.innerHTML='<form class="social-feature-form"><textarea name="body" maxlength="1000" placeholder="Share something with this Club…" required></textarea><button class="social-feature-button" type="submit">Publish to Club</button><p class="social-status" role="status"></p></form>'; featurePage.append(formCard);
    formCard.querySelector("form").addEventListener("submit",async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector("button"),status=form.querySelector(".social-status");button.disabled=true;try{await request("/clubs/"+club.id+"/posts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({body:form.elements.body.value})});form.reset();status.textContent="Posted!";loadClubPosts(club);}catch(error){status.textContent=error.message;}finally{button.disabled=false;}});
    const posts=featureCard();posts.innerHTML="<h3>Club discussions</h3><div class='social-feature-list'>Loading…</div>";featurePage.append(posts);loadClubPosts(club,posts);
  }
  async function loadClubPosts(club,card) {
    const target=card||featurePage.querySelector(".social-feature-card:last-child")?.querySelector(".social-feature-list");if(!target)return;
    try{const data=await request("/clubs/"+club.id+"/posts");target.replaceChildren();if(!data.posts.length){target.textContent="No posts yet. Start the conversation." ;return;}
      data.posts.forEach(post=>{const item=featureCard("social-feature-list-item");const author=document.createElement("strong");author.textContent="@"+post.username;const body=document.createElement("p");body.textContent=post.body;const time=document.createElement("small");time.textContent=timeAgo(post.created_at);item.append(author,body,time);target.append(item);});
    }catch(error){target.textContent=error.message;}
  }
  async function loadPulse() {
    featurePage.replaceChildren(featureHeading("ONE QUESTION. EVERYONE'S VOICE.","Jetchat Pulse","A shared daily question. One response per account each day."));
    const card=featureCard();card.innerHTML="<div class='social-loading'>Loading today's Pulse…</div>";featurePage.append(card);
    try{const data=await request("/pulse");card.replaceChildren();const date=document.createElement("small");date.textContent=new Date(data.date+"T00:00:00").toLocaleDateString(undefined,{dateStyle:"full"});const prompt=document.createElement("h3");prompt.textContent=data.prompt;card.append(date,prompt);
      if(!data.responded){const form=document.createElement("form");form.className="social-feature-form";form.innerHTML='<textarea name="body" maxlength="280" placeholder="Your answer…" required></textarea><button class="social-feature-button" type="submit">Send my Pulse</button><p class="social-status" role="status"></p>';card.append(form);form.addEventListener("submit",async event=>{event.preventDefault();const button=form.querySelector("button"),status=form.querySelector(".social-status");button.disabled=true;try{await request("/pulse",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({body:form.elements.body.value})});loadPulse();}catch(error){status.textContent=error.message;}finally{button.disabled=false;}});}
      else{const done=document.createElement("p");done.className="social-feature-muted";done.textContent="You've added your voice today. Come back for the next question.";card.append(done);}
      const responses=featureCard();const title=document.createElement("h3");title.textContent="Today's answers · "+data.responses.length;responses.append(title);data.responses.forEach(row=>{const line=document.createElement("p");const strong=document.createElement("strong");strong.textContent="@"+row.username+" ";line.append(strong,document.createTextNode(row.body));responses.append(line);});if(!data.responses.length){const empty=document.createElement("p");empty.textContent="Be the first to answer.";responses.append(empty);}featurePage.append(responses);
    }catch(error){renderFeatureError(card,error,loadPulse);}
  }
  async function loadTrending() {
    featurePage.replaceChildren(featureHeading("WHAT'S MOVING","Trending","Hashtags appearing most often in posts from the last seven days."));
    const card=featureCard();card.innerHTML="<div class='social-loading'>Finding what's trending…</div>";featurePage.append(card);
    try{const data=await request("/trending");card.replaceChildren();if(!data.trends.length){card.textContent="No trending hashtags yet. Add a hashtag to a post and start a conversation.";return;}
      data.trends.forEach((trend,index)=>{const row=featureCard("social-trend-row");const rank=document.createElement("span");rank.textContent="#"+(index+1);const tag=featureButton("#"+trend.tag,()=>{openView("create");document.getElementById("socialPostBody").value="#"+trend.tag+" ";},"social-trend-tag");const count=document.createElement("small");count.textContent=trend.posts+" posts · 7 days";row.append(rank,tag,count);card.append(row);});
    }catch(error){renderFeatureError(card,error,loadTrending);}
  }
  async function loadRelay() {
    featurePage.replaceChildren(featureHeading("MAKE SOMETHING TOGETHER","Relay","A chain of contributions. Every person adds the next piece."));
    const create=featureCard();create.innerHTML='<h3>Start a Relay</h3><form class="social-feature-form" id="relayCreateForm"><input name="title" maxlength="100" placeholder="Give your Relay a title" required><textarea name="first" maxlength="280" placeholder="Write the opening contribution…" required></textarea><button class="social-feature-button" type="submit">Start the chain</button><p class="social-status" role="status"></p></form>';featurePage.append(create);
    create.querySelector("form").addEventListener("submit",async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector("button"),status=form.querySelector(".social-status");button.disabled=true;try{await request("/relay",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:form.elements.title.value,first:form.elements.first.value})});loadRelay();}catch(error){status.textContent=error.message;}finally{button.disabled=false;}});
    const list=featureCard();list.innerHTML="<h3>Open Relays</h3><div class='social-feature-list'>Loading…</div>";featurePage.append(list);
    try{const data=await request("/relay");const target=list.querySelector(".social-feature-list");target.replaceChildren();if(!data.relays.length){target.textContent="No Relays yet. Start the first one.";return;}
      data.relays.forEach(relay=>{const row=featureCard("social-feature-list-item");const info=document.createElement("div");const title=document.createElement("h4");title.textContent=relay.title;const meta=document.createElement("small");meta.textContent=relay.entries+" contributions · started by @"+relay.starter;const latest=document.createElement("p");latest.textContent=relay.latest||"Be the first to add to the chain.";info.append(title,meta,latest);row.append(info,featureButton("Continue",()=>openRelay(relay)));target.append(row);});
    }catch(error){target.textContent=error.message;}
  }
  async function openRelay(relay) {
    featurePage.replaceChildren(featureButton("← All Relays",loadRelay,"social-back"),featureHeading("COMMUNITY CREATION",relay.title,"Add the next contribution to the chain."));
    const card=featureCard();card.innerHTML="<div class='social-loading'>Loading Relay…</div>";featurePage.append(card);
    try{const data=await request("/relay/"+relay.id);card.replaceChildren();data.entries.forEach((entry,index)=>{const row=featureCard("social-relay-entry");const n=document.createElement("small");n.textContent="PART "+(index+1)+" · @"+entry.username;const body=document.createElement("p");body.textContent=entry.body;row.append(n,body);card.append(row);});
      if(data.relay.is_open){const form=document.createElement("form");form.className="social-feature-form";form.innerHTML='<textarea name="body" maxlength="280" placeholder="Continue the creation…" required></textarea><button class="social-feature-button" type="submit">Add my part</button><p class="social-status" role="status"></p>';card.append(form);form.addEventListener("submit",async event=>{event.preventDefault();const button=form.querySelector("button"),status=form.querySelector(".social-status");button.disabled=true;try{await request("/relay/"+relay.id+"/entries",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({body:form.elements.body.value})});openRelay(relay);}catch(error){status.textContent=error.message;}finally{button.disabled=false;}});}
    }catch(error){renderFeatureError(card,error,()=>openRelay(relay));}
  }

  function openView(view) {
    if (view === "chats") view = "chatroom";
    const featureViews = ["clubs","pulse","relay","trending"];
    if(featureViews.includes(view)){
      overlay.hidden=false;currentView=view;socialMain.hidden=false;chatHub.hidden=true;chatRoom.hidden=true;modal.hidden=true;
      featurePage.hidden=false;socialContent.hidden=true;storyBar.hidden=true;heading.textContent=view==="clubs"?"Clubs":view==="pulse"?"Pulse":view==="relay"?"Relay":"Trending";
      overlay.querySelectorAll(".social-nav").forEach(button=>button.classList.toggle("active",button.dataset.view===view));
      if(view==="clubs")loadClubs();else if(view==="pulse")loadPulse();else if(view==="relay")loadRelay();else loadTrending();
      loadNotifications();return;
    }
    featurePage.hidden=true;socialContent.hidden=false;
    overlay.hidden = false;
    currentView = view;
    overlay.querySelectorAll(".social-nav").forEach(button => button.classList.toggle("active", button.dataset.view === view || (view === "chatroom" && button.dataset.view === "chats") || (view === "home" && button.dataset.view === "home")));
    if (socialMain) socialMain.hidden = view === "chatroom";
    if (storyBar) storyBar.hidden = view !== "home";
    if (chatHub) chatHub.hidden = true;
    if (chatRoom) chatRoom.hidden = view !== "chatroom";
    if (view === "chatroom") { modal.hidden = true; notificationPanel.hidden = true; updateChatCounts(); setChatFilter("all"); return; }
    if (view === "create") { modal.hidden = false; socialMain.hidden = false; chatHub.hidden = true; return; }
    modal.hidden = true;
    heading.textContent = view === "explore" ? "Explore" : view === "reels" ? "Reels" : "Your feed";
    const storiesHint = overlay.querySelector("#socialStoriesHint");
    if (storiesHint) storiesHint.hidden = view === "explore" || view === "reels";
    loadPosts(view);
    if (view === "home") loadStories();
    loadNotifications();
  }

  async function request(path, options = {}) {
    const response = await fetch(api + path, { credentials: "same-origin", cache: "no-store", ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) throw new Error(data.message || "Something went wrong.");
    return data;
  }

  function setNotificationCount(count) {
    const value = Math.max(0, Number(count) || 0);
    notificationBadge.textContent = value > 99 ? "99+" : String(value);
    notificationBadge.hidden = value === 0;
  }
  function renderNotifications() {
    notificationList.replaceChildren();
    if (!notificationItems.length) {
      const empty = document.createElement("p");
      empty.className = "social-notification-empty";
      empty.textContent = "You're all caught up.";
      notificationList.append(empty);
      return;
    }
    notificationItems.forEach(item => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "social-notification-item" + (item.read_at ? " is-read" : " is-unread");
      const mark = document.createElement("span");
      mark.className = "social-notification-icon";
      mark.textContent = item.type === "like" ? "♥" : item.type === "comment" ? "▱" : item.type === "follow" ? "＋" : "↩";
      const copy = document.createElement("span");
      copy.className = "social-notification-copy";
      const message = document.createElement("strong");
      message.textContent = "@" + item.actor + " " + item.message;
      const time = document.createElement("small");
      time.textContent = timeAgo(item.created_at);
      copy.append(message, time);
      row.append(mark, copy);
      row.addEventListener("click", async () => {
        if (!item.read_at) {
          try { await request("/notifications/" + encodeURIComponent(item.id) + "/read", { method: "POST" }); item.read_at = new Date().toISOString(); setNotificationCount(notificationItems.filter(value => !value.read_at).length); row.classList.remove("is-unread"); row.classList.add("is-read"); } catch {}
        }
        if (item.type === "story_reply") {
          openView("chatroom");
          if (typeof window.openConversation === "function") window.openConversation(item.actor);
        } else if (item.type === "like" || item.type === "comment") openView("home");
        notificationPanel.hidden = true;
        notificationButton.setAttribute("aria-expanded", "false");
      });
      notificationList.append(row);
    });
  }
  async function loadNotifications() {
    try {
      const data = await request("/notifications");
      notificationItems = data.notifications || [];
      setNotificationCount(data.unread);
      renderNotifications();
    } catch (error) {
      notificationList.textContent = error.message;
    }
  }
  notificationButton.addEventListener("click", () => {
    notificationPanel.hidden = !notificationPanel.hidden;
    notificationButton.setAttribute("aria-expanded", String(!notificationPanel.hidden));
    if (!notificationPanel.hidden) loadNotifications();
  });
  notificationPanel.querySelector(".social-notification-close").addEventListener("click", () => {
    notificationPanel.hidden = true;
    notificationButton.setAttribute("aria-expanded", "false");
  });
  notificationPanel.querySelector("#socialMarkAllRead").addEventListener("click", async () => {
    try { await request("/notifications/read-all", { method: "POST" }); notificationItems.forEach(item => item.read_at = item.read_at || new Date().toISOString()); setNotificationCount(0); renderNotifications(); } catch {}
  });
  notificationPanel.querySelector("#socialClearNotifications").addEventListener("click", async () => {
    try { await request("/notifications", { method: "DELETE" }); notificationItems = []; setNotificationCount(0); renderNotifications(); } catch {}
  });
  if (window.jetchatSocket) {
    window.jetchatSocket.on("social notification", notification => {
      notificationItems.unshift(notification);
      notificationItems = notificationItems.slice(0, 100);
      setNotificationCount(notificationItems.filter(item => !item.read_at).length);
      if (!notificationPanel.hidden) renderNotifications();
    });
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) loadNotifications(); });

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
    if (post.hasVideo) {
      const video = document.createElement("video");
      video.className = "social-post-video";
      video.controls = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.autoplay = true;
      video.muted = true;
      video.loop = true;
      video.poster = "";
      video.src = api + "/videos/" + encodeURIComponent(post.id);
      video.setAttribute("aria-label", "Video shared by " + post.username);
      card.classList.add("social-video-post");
      card.append(video);
    } else if (post.hasImage) {
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
    const repost = makeButton("↻ " + (post.repostCount||0) + " Repost", "social-repost" + (post.repostedByMe?" is-reposted":""), async () => { const quote=window.prompt("Add a comment to create a quote post. Leave blank for a simple repost:",""); if(quote===null)return; repost.disabled=true; try{if(quote.trim()){await request("/posts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({body:"↪ @"+post.username+": "+String(post.body||"").slice(0,500)+"\\n\\n"+quote.trim().slice(0,280)})});repost.textContent="↪ Quoted";repost.classList.add("is-reposted");}else{const result=await request("/posts/"+encodeURIComponent(post.id)+"/repost",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});post.repostedByMe=result.reposted;post.repostCount=result.count;repost.textContent="↻ "+result.count+" Repost";repost.classList.toggle("is-reposted",result.reposted);}}catch(error){repost.title=error.message;}finally{repost.disabled=false;} });
    actions.append(like, comments, repost);
    card.append(actions);

    const commentArea = document.createElement("div");
    commentArea.className = "social-comments";
    commentArea.hidden = true;
    card.append(commentArea);
    return card;
  }

  async function loadPosts(view) {
    feed.classList.toggle("social-reels-feed", view === "reels");
    feed.innerHTML = '<div class="social-loading">Loading posts…</div>';
    try {
      const data = await request(view === "explore" ? "/explore" : view === "reels" ? "/reels" : "/feed");
      feed.replaceChildren();
      if (!data.posts.length) {
        const empty = document.createElement("div");
        empty.className = "social-empty";
        empty.innerHTML = '<div class="social-empty-symbol">✦</div><h2>' + (view === "explore" ? "It's quiet out here" : view === "reels" ? "No Reels yet" : "Your feed is waiting") + '</h2><p>' + (view === "explore" ? "Be the first to share something with the Jetchat community." : view === "reels" ? "Be the first to share a short video. Create a post and choose a video." : "Follow people or publish your first post to get things started.") + '</p>';
        empty.append(makeButton("＋ Create a post", "social-publish", () => openView("create")));
        feed.append(empty);
        return;
      }
      data.posts.forEach(post => feed.append(renderPost(post)));
      if (view === "reels") {
        const videos = [...feed.querySelectorAll("video")];
        if ("IntersectionObserver" in window) {
          const observer = new IntersectionObserver(entries => entries.forEach(entry => {
            const video = entry.target;
            if (entry.isIntersecting && entry.intersectionRatio >= 0.65) video.play().catch(() => {});
            else video.pause();
          }), { threshold: [0, 0.65, 1] });
          videos.forEach(video => observer.observe(video));
        } else {
          videos.forEach(video => video.play().catch(() => {}));
        }
      }
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
      if (profile.avatar) {
        const image = document.createElement("img");
        image.src = profile.avatar;
        image.alt = "";
        avatar.append(image);
      } else avatar.textContent = profile.username.slice(0, 1).toUpperCase();
      const details = document.createElement("div");
      details.className = "social-profile-details";
      const name = document.createElement("h2");
      name.textContent = profile.display_name || profile.username;
      const handle = document.createElement("span");
      handle.className = "social-profile-handle";
      handle.textContent = "@" + profile.username;
      const bio = document.createElement("p");
      bio.textContent = profile.bio || "No bio yet.";
      const stats = document.createElement("p");
      stats.textContent = profile.followers + " followers · " + profile.following + " following";
      details.append(name, handle, bio, stats);
      top.append(close, avatar, details);
      panel.dataset.cardStyle = profile.profile_card_style || "glass";
      panel.style.setProperty("--profile-accent", profile.profile_accent || "#8d70ff");
      panel.style.setProperty("--profile-banner-color", profile.profile_color || "#5865f2");
      panel.dataset.bannerStyle = profile.profile_banner_style || "aurora";
      const banner = document.createElement("div");
      banner.className = "social-profile-banner";
      panel.prepend(banner);
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
  const chatFilterButtons = [...overlay.querySelectorAll("[data-chat-tab]")];
  const chatSections = [...overlay.querySelectorAll("[data-chat-section]")];
  function setChatFilter(filter) {
    chatFilterButtons.forEach(button => {
      const active = button.dataset.chatTab === filter;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    chatSections.forEach(section => {
      const kind = section.dataset.chatSection;
      let visible = filter === "all" || (filter === "groups" && kind === "groups") || (filter === "friends" && kind === "friends");
      if (filter === "unread") visible = kind === "dm";
      section.hidden = !visible;
    });
    if (filter === "unread") {
      const list = overlay.querySelector("#socialChatDmListMount");
      if (list) [...list.children].forEach(item => item.hidden = !item.querySelector(".dm-conversation-unread"));
    } else {
      const list = overlay.querySelector("#socialChatDmListMount");
      if (list) [...list.children].forEach(item => item.hidden = false);
    }
  }
  chatFilterButtons.forEach(button => button.addEventListener("click", () => setChatFilter(button.dataset.chatTab)));
  overlay.querySelectorAll("[data-room-tab]").forEach(button => button.addEventListener("click", () => {
    overlay.querySelectorAll("[data-room-tab]").forEach(tab => tab.classList.toggle("active", tab === button));
    if (button.dataset.roomTab === "media") document.getElementById("mediaGalleryBtn")?.click();
  }));
  overlay.querySelector("#socialChatDmListMount")?.addEventListener("click", () => {
    const list = overlay.querySelector("#socialChatDmListMount");
    if (list) [...list.children].forEach(item => item.hidden = false);
  });
  overlay.querySelector(".social-modal-close").addEventListener("click", closeModal);
  overlay.querySelector(".social-cancel").addEventListener("click", closeModal);
  imageInput.addEventListener("change", () => {
    const file = imageInput.files[0];
    overlay.querySelector("#socialImageName").textContent = file ? file.name + " · " + (file.size / 1024 / 1024).toFixed(1) + " MB" : "Photos up to 8 MB · Videos up to 25 MB";
  });
  createForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy) return;
    const file = imageInput.files[0];
    const isVideo = file && file.type.startsWith("video/");
    const maxBytes = isVideo ? 25 * 1024 * 1024 : 8 * 1024 * 1024;
    if (file && file.size > maxBytes) { status.textContent = isVideo ? "Choose a video smaller than 25 MB." : "Choose an image smaller than 8 MB."; return; }
    busy = true;
    status.textContent = "Publishing…";
    const button = overlay.querySelector(".social-publish");
    button.disabled = true;
    try {
      const form = new FormData();
      form.append("body", overlay.querySelector("#socialPostBody").value);
      if (file) form.append(isVideo ? "video" : "image", file);
      await request("/posts", { method: "POST", body: form });
      closeModal();
      currentView = "home";
      heading.textContent = "Your feed";
      const storiesHint = overlay.querySelector("#socialStoriesHint");
      if (storiesHint) storiesHint.hidden = false;
      loadPosts("home");
    } catch (error) { status.textContent = error.message; }
    finally { busy = false; button.disabled = false; }
  });

  window.addEventListener("keydown", event => {
    if (event.key === "Escape" && !overlay.hidden) {
      if (!storyViewer.hidden) { if(storyTimer)clearTimeout(storyTimer); storyViewer.hidden = true; }
      else if (!notificationPanel.hidden) { notificationPanel.hidden = true; notificationButton.setAttribute("aria-expanded", "false"); }
      else if (!storyComposer.hidden) closeStoryComposer();
      else if (!modal.hidden) closeModal();
      else openView("chats");
    } else if (!storyViewer.hidden && event.key === "ArrowRight") nextStory();
    else if (!storyViewer.hidden && event.key === "ArrowLeft") previousStory();
  });
  window.openJetchatSocial = openView;
  // Social is the signed-in landing screen; chat opens only after choosing a conversation.
})();