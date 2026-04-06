const mongoose = require('mongoose');

const FcmTokenSchema = new mongoose.Schema(
  {
    token: { type: String, required: true },
    platform: { type: String, default: null },
    created_at: { type: Date, default: Date.now },
    last_seen_at: { type: Date, default: null }
  },
  { _id: false }
);

const UserSchema = new mongoose.Schema(
  {
    phone: { type: String, default: null, unique: true, sparse: true, index: true },
    role: { type: String, enum: ['player', 'owner', 'admin'], default: 'player', index: true },
    first_name: { type: String, default: null },
    last_name: { type: String, default: null },
    email: { type: String, default: null },
    avatar_url: { type: String, default: null },
    favorites: { type: [String], default: [] },
    fcm_token: { type: String, default: null },
    fcm_tokens: { type: [FcmTokenSchema], default: [] },
    profile_completed_at: { type: Date, default: null },
    default_city: { type: String, default: null }
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

UserSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('User', UserSchema);

export {};
