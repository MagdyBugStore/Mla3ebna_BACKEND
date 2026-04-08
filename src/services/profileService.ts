const User = require('../models/User');
const Notification = require('../models/Notification');
const Booking = require('../models/Booking');
const AuthIdentity = require('../models/AuthIdentity');

async function getProfile(userId) {
  const user = await User.findById(userId);
  if (!user) return null;
  return user;
}

async function getProfileView(userId) {
  const user = await User.findById(userId).lean();
  if (!user) return null;

  const total_bookings = await Booking.countDocuments({
    user_id: userId,
    status: { $nin: ['cancelled_by_player', 'cancelled_by_owner'] }
  });
  const favorites_count = Array.isArray(user.favorites) ? user.favorites.length : 0;

  const identities = await AuthIdentity.find({ user_id: userId }).select({ provider: 1 }).lean();
  const connected_providers = Array.from(new Set((identities || []).map((i) => String(i.provider)).filter(Boolean))).filter((p) => p !== 'otp');

  return {
    id: user._id.toString(),
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    avatar_url: user.avatar_url,
    role: user.role,
    stats: { total_bookings, favorites_count },
    connected_providers
  };
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
      is_read: Boolean(n.read_at),
      created_at: n.created_at
    })),
    meta: { page, total }
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

module.exports = { getProfile, getProfileView, updateProfile, updateAvatar, listNotifications, readAllNotifications, updateFcmToken };

export {};
