const express = require("express");
const multer = require("multer");
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const router = express.Router();
const storyUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter(req, file, cb) {
    const allowed = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4", "video/webm", "video/quicktime"]);
    if (!allowed.has(file.mimetype)) return cb(new Error("Stories support JPG, PNG, GIF, WebP, MP4, WebM and MOV."));
    cb(null, true);
  }
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter(req, file, cb) {
    const allowed = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4", "video/webm", "video/quicktime"]);
    if (!allowed.has(file.mimetype)) return cb(new Error("Use JPG, PNG, GIF, WebP, MP4, WebM or MOV media."));
    cb(null, true);
  }
});

let schemaPromise;
function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS social_posts (
        id BIGSERIAL PRIMARY KEY,
        username TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        image_data BYTEA,
        image_type TEXT,
        image_name TEXT,
        video_data BYTEA,
        video_type TEXT,
        video_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS video_data BYTEA;
      ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS video_type TEXT;
      ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS video_name TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT NOT NULL DEFAULT '';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_accent TEXT NOT NULL DEFAULT '#8d70ff';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_banner_style TEXT NOT NULL DEFAULT 'aurora';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_card_style TEXT NOT NULL DEFAULT 'glass';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_color TEXT NOT NULL DEFAULT '#5865f2';
      CREATE INDEX IF NOT EXISTS social_posts_created_idx ON social_posts(created_at DESC);
      CREATE INDEX IF NOT EXISTS social_posts_user_idx ON social_posts(username, created_at DESC);
      CREATE TABLE IF NOT EXISTS social_follows (
        follower TEXT NOT NULL,
        following TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (follower, following),
        CHECK (follower <> following)
      );
      CREATE INDEX IF NOT EXISTS social_follows_following_idx ON social_follows(following);
      CREATE TABLE IF NOT EXISTS social_likes (
        post_id BIGINT NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
        username TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (post_id, username)
      );
      CREATE TABLE IF NOT EXISTS social_comments (
        id BIGSERIAL PRIMARY KEY,
        post_id BIGINT NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
        username TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS social_comments_post_idx ON social_comments(post_id, created_at);
      CREATE TABLE IF NOT EXISTS social_stories (
        id BIGSERIAL PRIMARY KEY,
        username TEXT NOT NULL,
        caption TEXT NOT NULL DEFAULT '',
        media_data BYTEA NOT NULL,
        media_type TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
      );
      CREATE INDEX IF NOT EXISTS social_stories_expiry_idx ON social_stories(expires_at DESC);
      CREATE INDEX IF NOT EXISTS social_stories_user_expiry_idx ON social_stories(username, expires_at DESC);
      CREATE TABLE IF NOT EXISTS social_story_views (
        story_id BIGINT NOT NULL REFERENCES social_stories(id) ON DELETE CASCADE,
        viewer TEXT NOT NULL,
        viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (story_id, viewer)
      );
      CREATE TABLE IF NOT EXISTS social_notifications (
        id BIGSERIAL PRIMARY KEY,
        recipient TEXT NOT NULL,
        actor TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('like','comment','follow','story_reply')),
        message TEXT NOT NULL,
        target_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        read_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS social_notifications_recipient_idx ON social_notifications(recipient, created_at DESC);

      CREATE TABLE IF NOT EXISTS social_reposts (
        post_id BIGINT NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
        username TEXT NOT NULL,
        quote TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (post_id, username)
      );
      CREATE TABLE IF NOT EXISTS social_clubs (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        owner TEXT NOT NULL,
        visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS social_club_members (
        club_id BIGINT NOT NULL REFERENCES social_clubs(id) ON DELETE CASCADE,
        username TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','moderator','member')),
        joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (club_id, username)
      );
      CREATE TABLE IF NOT EXISTS social_club_posts (
        id BIGSERIAL PRIMARY KEY,
        club_id BIGINT NOT NULL REFERENCES social_clubs(id) ON DELETE CASCADE,
        username TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS social_pulse_responses (
        id BIGSERIAL PRIMARY KEY,
        prompt_date DATE NOT NULL,
        username TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (prompt_date, username)
      );
      CREATE TABLE IF NOT EXISTS social_relays (
        id BIGSERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        starter TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        is_open BOOLEAN NOT NULL DEFAULT TRUE
      );
      CREATE TABLE IF NOT EXISTS social_relay_entries (
        id BIGSERIAL PRIMARY KEY,
        relay_id BIGINT NOT NULL REFERENCES social_relays(id) ON DELETE CASCADE,
        username TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS social_club_posts_idx ON social_club_posts(club_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS social_pulse_date_idx ON social_pulse_responses(prompt_date, created_at DESC);
      CREATE INDEX IF NOT EXISTS social_relay_entries_idx ON social_relay_entries(relay_id, created_at ASC);

    `).catch(error => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

function safePost(row) {
  return {
    id: String(row.id),
    username: row.username,
    body: row.body,
    hasImage: Boolean(row.image_type),
    imageType: row.image_type || null,
    hasVideo: Boolean(row.video_type),
    videoType: row.video_type || null,
    createdAt: row.created_at,
    likeCount: Number(row.like_count || 0),
    commentCount: Number(row.comment_count || 0),
    likedByMe: Boolean(row.liked_by_me),
    following: Boolean(row.following),
    isMe: Boolean(row.is_me),
    repostCount: Number(row.repost_count || 0),
    repostedByMe: Boolean(row.reposted_by_me)
  };
}

async function listPosts(viewer, mode, username) {
  await ensureSchema();
  const params = [viewer];
  let where = "";
  if (mode === "reels") {
    where = "WHERE p.video_type IS NOT NULL";
  } else if (mode === "home") {
    where = "WHERE (p.username = $1 OR EXISTS (SELECT 1 FROM social_follows f WHERE f.follower = $1 AND f.following = p.username))";
  } else if (mode === "profile") {
    params.push(username);
    where = "WHERE p.username = $2";
  }
  const result = await pool.query(`
    SELECT p.id,p.username,p.body,p.image_type,p.video_type,p.created_at,
      (SELECT COUNT(*) FROM social_likes l WHERE l.post_id=p.id)::INT AS like_count,
      (SELECT COUNT(*) FROM social_comments c WHERE c.post_id=p.id)::INT AS comment_count,
      (SELECT COUNT(*) FROM social_reposts r WHERE r.post_id=p.id)::INT AS repost_count,
      EXISTS(SELECT 1 FROM social_reposts r WHERE r.post_id=p.id AND r.username=$1) AS reposted_by_me,
      EXISTS(SELECT 1 FROM social_likes l WHERE l.post_id=p.id AND l.username=$1) AS liked_by_me,
      EXISTS(SELECT 1 FROM social_follows f WHERE f.follower=$1 AND f.following=p.username) AS following,
      (p.username = $1) AS is_me
    FROM social_posts p
    ${where}
    ORDER BY p.created_at DESC
    LIMIT 60
  `, params);
  return result.rows.map(safePost);
}

function requireSession(getRequestSession) {
  return async (req, res, next) => {
    try {
      const session = await getRequestSession(req);
      if (!session) return res.status(401).json({ success: false, message: "Please sign in again." });
      req.socialUser = session.user;
      next();
    } catch (error) {
      console.error("Social session error:", error.message);
      res.status(500).json({ success: false, message: "Could not verify your session." });
    }
  };
}

module.exports = function createSocialRouter(getRequestSession, io, isAcceptedFriend) {
  const auth = requireSession(getRequestSession);
  async function createNotification(recipient, actor, type, message, targetId = null) {
    if (!recipient || !actor || recipient.toLowerCase() === actor.toLowerCase()) return;
    const result = await pool.query(
      "INSERT INTO social_notifications (recipient,actor,type,message,target_id) VALUES ($1,$2,$3,$4,$5) RETURNING id,recipient,actor,type,message,target_id,created_at,read_at",
      [recipient, actor, type, String(message).slice(0, 240), targetId == null ? null : String(targetId)]
    );
    if (io) io.to("user:" + recipient).emit("social notification", result.rows[0]);
  }

  router.use(async (req, res, next) => {
    try { await ensureSchema(); next(); }
    catch (error) {
      console.error("Social schema error:", error.message);
      res.status(500).json({ success: false, message: "Social features are temporarily unavailable." });
    }
  });



  router.get("/notifications", auth, async (req, res) => {
    try {
      const result = await pool.query("SELECT id,actor,type,message,target_id,created_at,read_at FROM social_notifications WHERE recipient=$1 ORDER BY created_at DESC LIMIT 100", [req.socialUser.username]);
      const unread = await pool.query("SELECT COUNT(*)::INT AS count FROM social_notifications WHERE recipient=$1 AND read_at IS NULL", [req.socialUser.username]);
      res.set("Cache-Control", "no-store");
      res.json({ success: true, notifications: result.rows, unread: Number(unread.rows[0].count || 0) });
    } catch (error) { console.error("Load notifications error:", error.message); res.status(500).json({ success: false, message: "Couldn't load notifications." }); }
  });

  router.post("/notifications/:id/read", auth, async (req, res) => {
    try {
      if (!/^[1-9][0-9]*$/.test(req.params.id)) return res.status(400).json({ success: false });
      await pool.query("UPDATE social_notifications SET read_at=NOW() WHERE id=$1 AND recipient=$2 AND read_at IS NULL", [req.params.id, req.socialUser.username]);
      res.json({ success: true });
    } catch (error) { console.error("Mark notification read error:", error.message); res.status(500).json({ success: false, message: "Couldn't update that notification." }); }
  });

  router.post("/notifications/read-all", auth, async (req, res) => {
    try {
      await pool.query("UPDATE social_notifications SET read_at=NOW() WHERE recipient=$1 AND read_at IS NULL", [req.socialUser.username]);
      res.json({ success: true });
    } catch (error) { console.error("Mark all notifications read error:", error.message); res.status(500).json({ success: false, message: "Couldn't update notifications." }); }
  });

  router.delete("/notifications", auth, async (req, res) => {
    try {
      await pool.query("DELETE FROM social_notifications WHERE recipient=$1", [req.socialUser.username]);
      res.json({ success: true });
    } catch (error) { console.error("Clear notifications error:", error.message); res.status(500).json({ success: false, message: "Couldn't clear notifications." }); }
  });

  router.post("/stories/:id/reply", auth, async (req, res) => {
    try {
      if (!/^[1-9][0-9]*$/.test(req.params.id)) return res.status(400).json({ success: false, message: "Invalid Story." });
      const body = String(req.body.body || "").trim().slice(0, 1000);
      if (!body) return res.status(400).json({ success: false, message: "Write a reply first." });
      const story = await pool.query("SELECT username FROM social_stories WHERE id=$1 AND expires_at>NOW()", [req.params.id]);
      if (!story.rowCount) return res.status(404).json({ success: false, message: "This Story has expired." });
      const owner = story.rows[0].username;
      if (owner === req.socialUser.username) return res.status(400).json({ success: false, message: "You can't reply to your own Story." });
      if (typeof isAcceptedFriend !== "function" || !(await isAcceptedFriend(req.socialUser.username, owner))) {
        return res.status(403).json({ success: false, message: "You can only reply to Stories from friends. Add each other as friends first." });
      }
      await createNotification(owner, req.socialUser.username, "story_reply", "replied to your Story: " + body, req.params.id);
      res.json({ success: true, recipient: owner, storyId: String(req.params.id) });
    } catch (error) { console.error("Story reply notification error:", error.message); res.status(500).json({ success: false, message: "Couldn't send your Story reply." }); }
  });

  // Stories are available for 24 hours and are only served to signed-in users.
  router.get("/stories", auth, async (req, res) => {
    try {
      // Remove expired records and their view rows; stories are temporary, not archived posts.
      await pool.query("DELETE FROM social_stories WHERE expires_at <= NOW()");
      const result = await pool.query(`
        SELECT s.id,s.username,s.caption,s.media_type,s.created_at,s.expires_at,
          (SELECT COUNT(*) FROM social_story_views v WHERE v.story_id=s.id)::INT AS view_count,
          EXISTS(SELECT 1 FROM social_story_views v WHERE v.story_id=s.id AND v.viewer=$1) AS viewed_by_me
        FROM social_stories s
        WHERE s.expires_at > NOW()
        ORDER BY s.created_at ASC
        LIMIT 300
      `, [req.socialUser.username]);
      res.set("Cache-Control", "no-store");
      res.json({ success: true, stories: result.rows.map(row => ({
        id: String(row.id), username: row.username, caption: row.caption,
        mediaType: row.media_type, createdAt: row.created_at, expiresAt: row.expires_at,
        viewCount: Number(row.view_count || 0), viewedByMe: Boolean(row.viewed_by_me),
        isMe: row.username === req.socialUser.username
      })) });
    } catch (error) {
      console.error("Load stories error:", error.message);
      res.status(500).json({ success: false, message: "Couldn't load stories." });
    }
  });

  router.post("/stories", auth, (req, res, next) => storyUpload.single("media")(req, res, error => {
    if (error) return res.status(400).json({ success: false, message: error.message || "Story upload failed." });
    next();
  }), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ success: false, message: "Choose a photo or video for your story." });
      const caption = String(req.body.caption || "").trim().slice(0, 180);
      const result = await pool.query(
        "INSERT INTO social_stories (username,caption,media_data,media_type) VALUES ($1,$2,$3,$4) RETURNING id,username,caption,media_type,created_at,expires_at",
        [req.socialUser.username, caption, req.file.buffer, req.file.mimetype]
      );
      const row = result.rows[0];
      res.status(201).json({ success: true, story: {
        id: String(row.id), username: row.username, caption: row.caption,
        mediaType: row.media_type, createdAt: row.created_at, expiresAt: row.expires_at,
        viewCount: 0, viewedByMe: false, isMe: true
      } });
    } catch (error) {
      console.error("Create story error:", error.message);
      res.status(500).json({ success: false, message: "Couldn't publish your story." });
    }
  });

  router.get("/stories/:id/media", auth, async (req, res) => {
    try {
      if (!/^[1-9][0-9]*$/.test(req.params.id)) return res.sendStatus(404);
      const result = await pool.query("SELECT media_data,media_type FROM social_stories WHERE id=$1 AND expires_at>NOW() LIMIT 1", [req.params.id]);
      if (!result.rows.length) return res.sendStatus(404);
      res.set("Cache-Control", "private, no-store");
      res.set("X-Content-Type-Options", "nosniff");
      res.type(result.rows[0].media_type);
      res.send(result.rows[0].media_data);
    } catch (error) {
      console.error("Story media error:", error.message);
      res.sendStatus(500);
    }
  });

  router.post("/stories/:id/view", auth, async (req, res) => {
    try {
      if (!/^[1-9][0-9]*$/.test(req.params.id)) return res.status(400).json({ success: false });
      const story = await pool.query("SELECT username FROM social_stories WHERE id=$1 AND expires_at>NOW()", [req.params.id]);
      if (!story.rowCount) return res.status(404).json({ success: false, message: "This story has expired." });
      if (story.rows[0].username !== req.socialUser.username) {
        await pool.query("INSERT INTO social_story_views (story_id,viewer) VALUES ($1,$2) ON CONFLICT (story_id,viewer) DO NOTHING", [req.params.id, req.socialUser.username]);
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Story view error:", error.message);
      res.status(500).json({ success: false, message: "Couldn't record this view." });
    }
  });

  router.get("/stories/:id/views", auth, async (req, res) => {
    try {
      if (!/^[1-9][0-9]*$/.test(req.params.id)) return res.status(400).json({ success: false });
      const story = await pool.query("SELECT username FROM social_stories WHERE id=$1 AND expires_at>NOW()", [req.params.id]);
      if (!story.rowCount) return res.status(404).json({ success: false, message: "This story has expired." });
      if (story.rows[0].username !== req.socialUser.username) return res.status(403).json({ success: false, message: "Only the story owner can see its viewers." });
      const result = await pool.query("SELECT viewer,viewed_at FROM social_story_views WHERE story_id=$1 ORDER BY viewed_at DESC", [req.params.id]);
      res.set("Cache-Control", "no-store");
      res.json({ success: true, views: result.rows });
    } catch (error) {
      console.error("Story viewers error:", error.message);
      res.status(500).json({ success: false, message: "Couldn't load story viewers." });
    }
  });

  router.get("/feed", auth, async (req, res) => {
    try { res.set("Cache-Control", "no-store"); res.json({ success: true, posts: await listPosts(req.socialUser.username, "home") }); }
    catch (error) { console.error("Social feed error:", error.message); res.status(500).json({ success: false, message: "Couldn't load your feed." }); }
  });

  router.get("/explore", auth, async (req, res) => {
    try { res.set("Cache-Control", "no-store"); res.json({ success: true, posts: await listPosts(req.socialUser.username, "explore") }); }
    catch (error) { console.error("Social explore error:", error.message); res.status(500).json({ success: false, message: "Couldn't load Explore." }); }
  });

  router.get("/reels", auth, async (req, res) => {
    try {
      res.set("Cache-Control", "no-store");
      res.json({ success: true, posts: await listPosts(req.socialUser.username, "reels") });
    } catch (error) {
      console.error("Load reels error:", error.message);
      res.status(500).json({ success: false, message: "Couldn't load Reels." });
    }
  });

  router.get("/profile/:username", auth, async (req, res) => {
    try {
      const target = String(req.params.username || "").trim();
      if (!/^[a-zA-Z0-9_]{2,20}$/.test(target)) return res.status(400).json({ success: false, message: "Invalid username." });
      const user = await pool.query(`SELECT username, COALESCE(avatar,'') AS avatar, COALESCE(bio,'') AS bio, join_date,
        COALESCE(display_name,'') AS display_name, COALESCE(profile_color,'#5865f2') AS profile_color,
        COALESCE(profile_accent,'#8d70ff') AS profile_accent,
        COALESCE(profile_banner_style,'aurora') AS profile_banner_style,
        COALESCE(profile_card_style,'glass') AS profile_card_style
        FROM users WHERE LOWER(username)=LOWER($1) LIMIT 1`, [target]);
      if (!user.rows.length) return res.status(404).json({ success: false, message: "User not found." });
      const actualName = user.rows[0].username;
      const [posts, counts] = await Promise.all([
        listPosts(req.socialUser.username, "profile", actualName),
        pool.query(`SELECT
          (SELECT COUNT(*) FROM social_follows WHERE following=$1)::INT AS followers,
          (SELECT COUNT(*) FROM social_follows WHERE follower=$1)::INT AS following,
          EXISTS(SELECT 1 FROM social_follows WHERE follower=$2 AND following=$1) AS is_following`, [actualName, req.socialUser.username])
      ]);
      res.set("Cache-Control", "no-store");
      res.json({ success: true, profile: { ...user.rows[0], ...counts.rows[0], isMe: actualName === req.socialUser.username }, posts });
    } catch (error) { console.error("Social profile error:", error.message); res.status(500).json({ success: false, message: "Couldn't load this profile." }); }
  });

  router.post("/posts", auth, (req, res, next) => upload.fields([{ name: "image", maxCount: 1 }, { name: "video", maxCount: 1 }])(req, res, error => {
    if (error) return res.status(400).json({ success: false, message: error.message || "Media upload failed." });
    next();
  }), async (req, res) => {
    try {
      const body = String(req.body.body || "").trim();
      const image = req.files?.image?.[0] || null;
      const video = req.files?.video?.[0] || null;
      if (image && video) return res.status(400).json({ success: false, message: "Choose either a photo or a video." });
      if (!body && !image && !video) return res.status(400).json({ success: false, message: "Write something or add media." });
      if (body.length > 2000) return res.status(400).json({ success: false, message: "Posts must be 2,000 characters or fewer." });
      const result = await pool.query(
        "INSERT INTO social_posts (username,body,image_data,image_type,image_name,video_data,video_type,video_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,username,body,image_type,video_type,created_at",
        [req.socialUser.username, body, image ? image.buffer : null, image ? image.mimetype : null, image ? String(image.originalname).slice(0,180) : null, video ? video.buffer : null, video ? video.mimetype : null, video ? String(video.originalname).slice(0,180) : null]
      );
      const row = result.rows[0];
      res.status(201).json({ success: true, post: { id: String(row.id), username: row.username, body: row.body, hasImage: Boolean(row.image_type), imageType: row.image_type, hasVideo: Boolean(row.video_type), videoType: row.video_type, createdAt: row.created_at, likeCount: 0, commentCount: 0, likedByMe: false } });
    } catch (error) { console.error("Create social post error:", error.message); res.status(500).json({ success: false, message: "Couldn't publish your post." }); }
  });

  router.get("/images/:id", auth, async (req, res) => {
    try {
      if (!/^[1-9][0-9]*$/.test(req.params.id)) return res.sendStatus(404);
      const result = await pool.query("SELECT image_data,image_type FROM social_posts WHERE id=$1 LIMIT 1", [req.params.id]);
      if (!result.rows.length || !result.rows[0].image_data) return res.sendStatus(404);
      res.set("Cache-Control", "private, max-age=300");
      res.set("X-Content-Type-Options", "nosniff");
      res.type(result.rows[0].image_type);
      res.send(result.rows[0].image_data);
    } catch (error) { console.error("Social image error:", error.message); res.sendStatus(500); }
  });

  router.get("/videos/:id", auth, async (req, res) => {
    try {
      if (!/^[1-9][0-9]*$/.test(req.params.id)) return res.sendStatus(404);
      const result = await pool.query("SELECT video_data,video_type FROM social_posts WHERE id=$1 LIMIT 1", [req.params.id]);
      if (!result.rows.length || !result.rows[0].video_data) return res.sendStatus(404);
      res.set("Cache-Control", "private, max-age=300");
      res.set("X-Content-Type-Options", "nosniff");
      res.type(result.rows[0].video_type);
      res.send(result.rows[0].video_data);
    } catch (error) { console.error("Social video error:", error.message); res.sendStatus(500); }
  });

  router.post("/posts/:id/like", auth, async (req, res) => {
    try {
      if (!/^[1-9][0-9]*$/.test(req.params.id)) return res.status(400).json({ success: false });
      const exists = await pool.query("SELECT username FROM social_posts WHERE id=$1", [req.params.id]);
      if (!exists.rowCount) return res.status(404).json({ success: false, message: "Post not found." });
      const removed = await pool.query("DELETE FROM social_likes WHERE post_id=$1 AND username=$2 RETURNING post_id", [req.params.id, req.socialUser.username]);
      let liked = false;
      if (!removed.rowCount) {
        await pool.query("INSERT INTO social_likes (post_id,username) VALUES ($1,$2) ON CONFLICT DO NOTHING", [req.params.id, req.socialUser.username]);
        liked = true;
      }
      const count = await pool.query("SELECT COUNT(*)::INT AS count FROM social_likes WHERE post_id=$1", [req.params.id]);
      if (liked) await createNotification(exists.rows[0].username, req.socialUser.username, "like", "liked your post", req.params.id);
      res.json({ success: true, liked, count: count.rows[0].count });
    } catch (error) { console.error("Social like error:", error.message); res.status(500).json({ success: false, message: "Couldn't update your like." }); }
  });

  router.get("/posts/:id/comments", auth, async (req, res) => {
    try {
      if (!/^[1-9][0-9]*$/.test(req.params.id)) return res.status(400).json({ success: false, message: "Invalid post." });
      const result = await pool.query("SELECT id,username,body,created_at FROM social_comments WHERE post_id=$1 ORDER BY created_at ASC LIMIT 100", [req.params.id]);
      res.set("Cache-Control", "no-store");
      res.json({ success: true, comments: result.rows });
    } catch (error) { console.error("Social comments error:", error.message); res.status(500).json({ success: false, message: "Couldn't load comments." }); }
  });

  router.post("/posts/:id/comments", auth, async (req, res) => {
    try {
      const body = String(req.body.body || "").trim();
      if (!/^[1-9][0-9]*$/.test(req.params.id) || !body || body.length > 500) return res.status(400).json({ success: false, message: "Comments must be 1–500 characters." });
      const post = await pool.query("SELECT id,username FROM social_posts WHERE id=$1", [req.params.id]);
      if (!post.rowCount) return res.status(404).json({ success: false, message: "Post not found." });
      const result = await pool.query("INSERT INTO social_comments (post_id,username,body) VALUES ($1,$2,$3) RETURNING id,username,body,created_at", [req.params.id, req.socialUser.username, body]);
      await createNotification(post.rows[0].username, req.socialUser.username, "comment", "commented on your post: " + body, req.params.id);
      res.status(201).json({ success: true, comment: result.rows[0] });
    } catch (error) { console.error("Create social comment error:", error.message); res.status(500).json({ success: false, message: "Couldn't post your comment." }); }
  });

  router.post("/users/:username/follow", auth, async (req, res) => {
    try {
      const target = String(req.params.username || "");
      if (!/^[a-zA-Z0-9_]{2,20}$/.test(target) || target.toLowerCase() === req.socialUser.username.toLowerCase()) return res.status(400).json({ success: false, message: "You can't follow this account." });
      const user = await pool.query("SELECT username FROM users WHERE LOWER(username)=LOWER($1) LIMIT 1", [target]);
      if (!user.rowCount) return res.status(404).json({ success: false, message: "User not found." });
      const actual = user.rows[0].username;
      const removed = await pool.query("DELETE FROM social_follows WHERE follower=$1 AND following=$2 RETURNING following", [req.socialUser.username, actual]);
      let following = false;
      if (!removed.rowCount) {
        await pool.query("INSERT INTO social_follows (follower,following) VALUES ($1,$2) ON CONFLICT DO NOTHING", [req.socialUser.username, actual]);
        following = true;
        await createNotification(actual, req.socialUser.username, "follow", "started following you");
      }
      const count = await pool.query("SELECT COUNT(*)::INT AS count FROM social_follows WHERE following=$1", [actual]);
      res.json({ success: true, following, followers: count.rows[0].count });
    } catch (error) { console.error("Social follow error:", error.message); res.status(500).json({ success: false, message: "Couldn't update your follow." }); }
  });


  // X-inspired reposts and quote posts.
  router.post("/posts/:id/repost", auth, async (req, res) => {
    try {
      if (!/^[1-9][0-9]*$/.test(req.params.id)) return res.status(400).json({success:false,message:"Invalid post."});
      const quote = String(req.body.quote || "").trim().slice(0,280);
      const exists = await pool.query("SELECT id FROM social_posts WHERE id=$1", [req.params.id]);
      if (!exists.rowCount) return res.status(404).json({success:false,message:"Post not found."});
      const removed = await pool.query("DELETE FROM social_reposts WHERE post_id=$1 AND username=$2 RETURNING post_id", [req.params.id,req.socialUser.username]);
      let reposted = false;
      if (!removed.rowCount) {
        await pool.query("INSERT INTO social_reposts(post_id,username,quote) VALUES($1,$2,$3) ON CONFLICT(post_id,username) DO UPDATE SET quote=EXCLUDED.quote,created_at=NOW()", [req.params.id,req.socialUser.username,quote]);
        reposted = true;
      }
      const count = await pool.query("SELECT COUNT(*)::INT AS count FROM social_reposts WHERE post_id=$1",[req.params.id]);
      res.json({success:true,reposted,count:count.rows[0].count});
    } catch(error) { console.error("Repost error:",error.message); res.status(500).json({success:false,message:"Couldn't repost this post."}); }
  });

  // Trending hashtags are calculated from recent public posts.
  router.get("/trending", auth, async (req,res) => {
    try {
      const result = await pool.query(`
        SELECT lower(match[1]) AS tag, COUNT(*)::INT AS posts
        FROM social_posts p
        CROSS JOIN LATERAL regexp_matches(p.body, '#([a-zA-Z0-9_]{2,30})', 'g') AS matches(match)
        WHERE p.created_at > NOW() - INTERVAL '7 days'
        GROUP BY lower(match[1]) ORDER BY posts DESC, tag ASC LIMIT 20
      `);
      res.set("Cache-Control","no-store");
      res.json({success:true,trends:result.rows});
    } catch(error) { console.error("Trending error:",error.message); res.status(500).json({success:false,message:"Couldn't load trends."}); }
  });

  // Clubs: public discovery and private invite-only membership.
  router.get("/clubs", auth, async (req,res) => {
    try {
      const result=await pool.query(`
        SELECT c.id,c.name,c.description,c.owner,c.visibility,c.created_at,
          COUNT(m.username)::INT AS member_count,
          EXISTS(SELECT 1 FROM social_club_members mine WHERE mine.club_id=c.id AND mine.username=$1) AS joined,
          COALESCE((SELECT mine.role FROM social_club_members mine WHERE mine.club_id=c.id AND mine.username=$1),'') AS my_role
        FROM social_clubs c LEFT JOIN social_club_members m ON m.club_id=c.id
        WHERE c.visibility='public' OR EXISTS(SELECT 1 FROM social_club_members mine WHERE mine.club_id=c.id AND mine.username=$1)
        GROUP BY c.id ORDER BY member_count DESC,c.created_at DESC LIMIT 100
      `,[req.socialUser.username]);
      res.json({success:true,clubs:result.rows});
    } catch(error) { console.error("Clubs list error:",error.message); res.status(500).json({success:false,message:"Couldn't load Clubs."}); }
  });
  router.post("/clubs", auth, async (req,res) => {
    const name=String(req.body.name||"").trim().slice(0,40), description=String(req.body.description||"").trim().slice(0,240);
    const visibility=req.body.visibility==="private"?"private":"public";
    if(name.length<3) return res.status(400).json({success:false,message:"Club names need at least 3 characters."});
    const client=await pool.connect();
    try {
      await client.query("BEGIN");
      const created=await client.query("INSERT INTO social_clubs(name,description,owner,visibility) VALUES($1,$2,$3,$4) RETURNING id,name,description,owner,visibility,created_at",[name,description,req.socialUser.username,visibility]);
      await client.query("INSERT INTO social_club_members(club_id,username,role) VALUES($1,$2,'owner')",[created.rows[0].id,req.socialUser.username]);
      await client.query("COMMIT");
      res.status(201).json({success:true,club:{...created.rows[0],member_count:1,joined:true}});
    } catch(error) { await client.query("ROLLBACK"); console.error("Create club error:",error.message); res.status(500).json({success:false,message:"Couldn't create this Club."}); }
    finally { client.release(); }
  });
  router.post("/clubs/:id/join", auth, async (req,res) => {
    try {
      if(!/^[1-9][0-9]*$/.test(req.params.id)) return res.status(400).json({success:false,message:"Invalid Club."});
      const club=await pool.query("SELECT id,visibility FROM social_clubs WHERE id=$1",[req.params.id]);
      if(!club.rowCount) return res.status(404).json({success:false,message:"Club not found."});
      if(club.rows[0].visibility==="private") return res.status(403).json({success:false,message:"This Club is invite-only."});
      await pool.query("INSERT INTO social_club_members(club_id,username) VALUES($1,$2) ON CONFLICT DO NOTHING",[req.params.id,req.socialUser.username]);
      res.json({success:true,joined:true});
    } catch(error) { console.error("Join club error:",error.message); res.status(500).json({success:false,message:"Couldn't join this Club."}); }
  });
  router.post("/clubs/:id/invite", auth, async (req,res) => {
    try {
      if(!/^[1-9][0-9]*$/.test(req.params.id)) return res.status(400).json({success:false,message:"Invalid Club."});
      const target=String(req.body.username||"").trim();
      if(!/^[a-zA-Z0-9_]{2,20}$/.test(target)) return res.status(400).json({success:false,message:"Enter a valid username."});
      const role=await pool.query("SELECT role FROM social_club_members WHERE club_id=$1 AND username=$2",[req.params.id,req.socialUser.username]);
      if(!role.rowCount||!["owner","moderator"].includes(role.rows[0].role)) return res.status(403).json({success:false,message:"Only Club owners and moderators can invite members."});
      const user=await pool.query("SELECT username FROM users WHERE LOWER(username)=LOWER($1)",[target]);
      if(!user.rowCount) return res.status(404).json({success:false,message:"That user doesn't exist."});
      await pool.query("INSERT INTO social_club_members(club_id,username) VALUES($1,$2) ON CONFLICT DO NOTHING",[req.params.id,user.rows[0].username]);
      res.json({success:true,username:user.rows[0].username});
    } catch(error) { console.error("Club invite error:",error.message); res.status(500).json({success:false,message:"Couldn't invite this member."}); }
  });
  router.get("/clubs/:id/posts", auth, async (req,res) => {
    try {
      if(!/^[1-9][0-9]*$/.test(req.params.id)) return res.status(400).json({success:false,message:"Invalid Club."});
      const access=await pool.query("SELECT c.visibility,EXISTS(SELECT 1 FROM social_club_members m WHERE m.club_id=c.id AND m.username=$2) AS joined FROM social_clubs c WHERE c.id=$1",[req.params.id,req.socialUser.username]);
      if(!access.rowCount) return res.status(404).json({success:false,message:"Club not found."});
      if(access.rows[0].visibility==="private"&&!access.rows[0].joined) return res.status(403).json({success:false,message:"Join this Club to view its posts."});
      const posts=await pool.query("SELECT id,username,body,created_at FROM social_club_posts WHERE club_id=$1 ORDER BY created_at DESC LIMIT 100",[req.params.id]);
      res.json({success:true,posts:posts.rows});
    } catch(error) { console.error("Club posts error:",error.message); res.status(500).json({success:false,message:"Couldn't load Club posts."}); }
  });
  router.post("/clubs/:id/posts", auth, async (req,res) => {
    try {
      const body=String(req.body.body||"").trim();
      if(!/^[1-9][0-9]*$/.test(req.params.id)||!body||body.length>1000) return res.status(400).json({success:false,message:"Club posts must be 1–1,000 characters."});
      const member=await pool.query("SELECT 1 FROM social_club_members WHERE club_id=$1 AND username=$2",[req.params.id,req.socialUser.username]);
      if(!member.rowCount) return res.status(403).json({success:false,message:"Join this Club before posting."});
      const post=await pool.query("INSERT INTO social_club_posts(club_id,username,body) VALUES($1,$2,$3) RETURNING id,username,body,created_at",[req.params.id,req.socialUser.username,body]);
      res.status(201).json({success:true,post:post.rows[0]});
    } catch(error) { console.error("Create Club post error:",error.message); res.status(500).json({success:false,message:"Couldn't publish to this Club."}); }
  });

  // A shared daily prompt, one response per account per day.
  router.get("/pulse", auth, async (req,res) => {
    try {
      const promptDate=(await pool.query("SELECT CURRENT_DATE::TEXT AS day")).rows[0].day;
      const prompts=["What is one thing everyone should try at least once?","What would make your community better this week?","What is a skill you wish you could learn instantly?","What is a small win you had recently?","If you could build one new app feature, what would it be?","What topic could you talk about for hours?","What is something people misunderstand about your generation?"];
      const dayNumber=Math.floor(new Date(promptDate+"T00:00:00Z").getTime()/86400000);
      const prompt=prompts[((dayNumber%prompts.length)+prompts.length)%prompts.length];
      const [responses,mine]=await Promise.all([
        pool.query("SELECT username,body,created_at FROM social_pulse_responses WHERE prompt_date=$1 ORDER BY created_at DESC LIMIT 100",[promptDate]),
        pool.query("SELECT 1 FROM social_pulse_responses WHERE prompt_date=$1 AND username=$2",[promptDate,req.socialUser.username])
      ]);
      res.json({success:true,date:promptDate,prompt,responded:Boolean(mine.rowCount),responses:responses.rows});
    } catch(error) { console.error("Pulse load error:",error.message); res.status(500).json({success:false,message:"Couldn't load today's Pulse."}); }
  });
  router.post("/pulse", auth, async (req,res) => {
    try {
      const body=String(req.body.body||"").trim().slice(0,280);
      if(!body) return res.status(400).json({success:false,message:"Write a response first."});
      const result=await pool.query("INSERT INTO social_pulse_responses(prompt_date,username,body) VALUES(CURRENT_DATE,$1,$2) ON CONFLICT(prompt_date,username) DO NOTHING RETURNING id",[req.socialUser.username,body]);
      if(!result.rowCount) return res.status(409).json({success:false,message:"You've already answered today's Pulse."});
      res.status(201).json({success:true});
    } catch(error) { console.error("Pulse response error:",error.message); res.status(500).json({success:false,message:"Couldn't submit your Pulse."}); }
  });

  // Relay: a community-built chain where each contribution continues the creation.
  router.get("/relay", auth, async (req,res) => {
    try {
      const relays=await pool.query(`
        SELECT r.id,r.title,r.starter,r.created_at,r.is_open,COUNT(e.id)::INT AS entries,
          (SELECT body FROM social_relay_entries WHERE relay_id=r.id ORDER BY created_at DESC,id DESC LIMIT 1) AS latest
        FROM social_relays r LEFT JOIN social_relay_entries e ON e.relay_id=r.id
        GROUP BY r.id ORDER BY r.is_open DESC,r.created_at DESC LIMIT 50
      `);
      res.json({success:true,relays:relays.rows});
    } catch(error) { console.error("Relay list error:",error.message); res.status(500).json({success:false,message:"Couldn't load Relay."}); }
  });
  router.post("/relay", auth, async (req,res) => {
    try {
      const title=String(req.body.title||"").trim().slice(0,100), first=String(req.body.first||"").trim().slice(0,280);
      if(title.length<3||!first) return res.status(400).json({success:false,message:"Add a title and the first contribution."});
      const client=await pool.connect();
      try {
        await client.query("BEGIN");
        const relay=await client.query("INSERT INTO social_relays(title,starter) VALUES($1,$2) RETURNING id,title,starter,created_at,is_open",[title,req.socialUser.username]);
        await client.query("INSERT INTO social_relay_entries(relay_id,username,body) VALUES($1,$2,$3)",[relay.rows[0].id,req.socialUser.username,first]);
        await client.query("COMMIT");
        res.status(201).json({success:true,relay:relay.rows[0]});
      } catch(error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    } catch(error) { console.error("Create Relay error:",error.message); res.status(500).json({success:false,message:"Couldn't start this Relay."}); }
  });
  router.get("/relay/:id", auth, async (req,res) => {
    try {
      if(!/^[1-9][0-9]*$/.test(req.params.id)) return res.status(400).json({success:false,message:"Invalid Relay."});
      const [relay,entries]=await Promise.all([
        pool.query("SELECT id,title,starter,created_at,is_open FROM social_relays WHERE id=$1",[req.params.id]),
        pool.query("SELECT username,body,created_at FROM social_relay_entries WHERE relay_id=$1 ORDER BY created_at ASC,id ASC",[req.params.id])
      ]);
      if(!relay.rowCount) return res.status(404).json({success:false,message:"Relay not found."});
      res.json({success:true,relay:relay.rows[0],entries:entries.rows});
    } catch(error) { console.error("Relay detail error:",error.message); res.status(500).json({success:false,message:"Couldn't open this Relay."}); }
  });
  router.post("/relay/:id/entries", auth, async (req,res) => {
    try {
      const body=String(req.body.body||"").trim().slice(0,280);
      if(!/^[1-9][0-9]*$/.test(req.params.id)||!body) return res.status(400).json({success:false,message:"Write a contribution first."});
      const relay=await pool.query("SELECT is_open FROM social_relays WHERE id=$1",[req.params.id]);
      if(!relay.rowCount) return res.status(404).json({success:false,message:"Relay not found."});
      if(!relay.rows[0].is_open) return res.status(409).json({success:false,message:"This Relay is closed."});
      const result=await pool.query("INSERT INTO social_relay_entries(relay_id,username,body) VALUES($1,$2,$3) RETURNING username,body,created_at",[req.params.id,req.socialUser.username,body]);
      res.status(201).json({success:true,entry:result.rows[0]});
    } catch(error) { console.error("Relay contribution error:",error.message); res.status(500).json({success:false,message:"Couldn't add your contribution."}); }
  });

  return router;
};
