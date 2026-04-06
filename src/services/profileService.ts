const User = require('../models/User');
const Notification = require('../models/Notification');

async function getProfile(userId) {
  const user = await User.findById(userId);
  if (!user) return null;
  return user;
}

async function updateProfile(userId, { first_name, last_name, email }) {
  const user = await User.findById(userId);
  if (!user) return null;
  if (first_name !== undefined) user.first_name = first_name;
  if (last_name !== undefined) user.last_name = last_name;
  if (email !== undefined) user.email = email;
  await user.save();
  return user;
}

async function updateAvatar(userId, avatar_url) {
  const user = await User.findById(userId);
  if (!user) return null;
  user.avatar_url = avatar_url;
  await user.save();
  return user;
}

async function listNotifications(userId, { page, limit }) {
  const total = await Notification.countDocuments({ user_id: userId });
  const data = await Notification.find({ user_id: userId })
    .sort({ created_at: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
  return {
    data: data.map((n) => ({
      id: n._id.toString(),
      user_id: n.user_id,
      type: n.type || null,
      title: n.title,
      body: n.body,
      data: n.data || null,
      read_at: n.read_at,
      created_at: n.created_at
    })),
    meta: { page, limit, total }
  };
}

async function readAllNotifications(userId) {
  await Notification.updateMany({ user_id: userId, read_at: null }, { read_at: new Date() });
  return { success: true };
}

async function updateFcmToken(userId, token) {
  const user = await User.findById(userId);
  if (!user) return null;
  user.fcm_token = token;
  user.fcm_tokens = Array.isArray(user.fcm_tokens) ? user.fcm_tokens : [];
  const existing = user.fcm_tokens.find((t) => t && t.token === token) || null;
  if (existing) {
    existing.last_seen_at = new Date();
  } else {
    user.fcm_tokens.push({ token, platform: null, created_at: new Date(), last_seen_at: new Date() });
  }
  await user.save();
  return user;
}

module.exports = { getProfile, updateProfile, updateAvatar, listNotifications, readAllNotifications, updateFcmToken };

export {};
