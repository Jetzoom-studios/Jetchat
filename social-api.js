const express = require("express");
const multer = require("multer");
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const router = express.Router();
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
    isMe: Boolean(row.is_me)
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

module.exports = function createSocialRouter(getRequestSession) {
  const auth = requireSession(getRequestSession);

  router.use(async (req, res, next) => {
    try { await ensureSchema(); next(); }
    catch (error) {
      console.error("Social schema error:", error.message);
      res.status(500).json({ success: false, message: "Social features are temporarily unavailable." });
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
      const user = await pool.query("SELECT username, COALESCE(avatar,'') AS avatar, COALESCE(bio,'') AS bio, join_date FROM users WHERE LOWER(username)=LOWER($1) LIMIT 1", [target]);
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
      const exists = await pool.query("SELECT 1 FROM social_posts WHERE id=$1", [req.params.id]);
      if (!exists.rowCount) return res.status(404).json({ success: false, message: "Post not found." });
      const removed = await pool.query("DELETE FROM social_likes WHERE post_id=$1 AND username=$2 RETURNING post_id", [req.params.id, req.socialUser.username]);
      let liked = false;
      if (!removed.rowCount) {
        await pool.query("INSERT INTO social_likes (post_id,username) VALUES ($1,$2) ON CONFLICT DO NOTHING", [req.params.id, req.socialUser.username]);
        liked = true;
      }
      const count = await pool.query("SELECT COUNT(*)::INT AS count FROM social_likes WHERE post_id=$1", [req.params.id]);
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
      const post = await pool.query("SELECT id FROM social_posts WHERE id=$1", [req.params.id]);
      if (!post.rowCount) return res.status(404).json({ success: false, message: "Post not found." });
      const result = await pool.query("INSERT INTO social_comments (post_id,username,body) VALUES ($1,$2,$3) RETURNING id,username,body,created_at", [req.params.id, req.socialUser.username, body]);
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
      }
      const count = await pool.query("SELECT COUNT(*)::INT AS count FROM social_follows WHERE following=$1", [actual]);
      res.json({ success: true, following, followers: count.rows[0].count });
    } catch (error) { console.error("Social follow error:", error.message); res.status(500).json({ success: false, message: "Couldn't update your follow." }); }
  });

  return router;
};
