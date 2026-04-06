const mongoose = require('mongoose');

const RefreshTokenSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, unique: true, index: true },
    user_id: { type: String, required: true, index: true },
    revoked_at: { type: Date, default: null },
    expires_at: { type: Date, required: true }
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

RefreshTokenSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('RefreshToken', RefreshTokenSchema);

export {};
