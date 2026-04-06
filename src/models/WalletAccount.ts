const mongoose = require('mongoose');

const WalletAccountSchema = new mongoose.Schema(
  {
    owner_id: { type: String, required: true, unique: true, index: true },
    currency: { type: String, default: 'EGP' },
    available_balance: { type: Number, default: 0 },
    pending_balance: { type: Number, default: 0 }
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

WalletAccountSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('WalletAccount', WalletAccountSchema);

export {};
