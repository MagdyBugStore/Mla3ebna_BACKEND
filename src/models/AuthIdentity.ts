const mongoose = require('mongoose');

const AuthIdentitySchema = new mongoose.Schema(
  {
    user_id: { type: String, required: true, index: true },
    provider: { type: String, enum: ['google', 'apple', 'otp'], required: true, index: true },
    provider_user_id: { type: String, default: null },
    phone: { type: String, default: null },
    email: { type: String, default: null },
    verified_at: { type: Date, default: null }
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

AuthIdentitySchema.index(
  { provider: 1, provider_user_id: 1 },
  { unique: true, partialFilterExpression: { provider_user_id: { $type: 'string' } } }
);

AuthIdentitySchema.index({ provider: 1, phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: 'string' } } });

AuthIdentitySchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('AuthIdentity', AuthIdentitySchema);

export {};
