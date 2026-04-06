const mongoose = require('mongoose');

const PayoutSchema = new mongoose.Schema(
  {
    owner_id: { type: String, required: true, index: true },
    account_id: { type: String, required: true, index: true },
    status: { type: String, enum: ['requested', 'processing', 'paid', 'failed'], default: 'requested', index: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'EGP' },
    method: { type: String, enum: ['bank_transfer', 'wallet', 'cash'], required: true },
    provider_ref: { type: String, default: null, index: true },
    paid_at: { type: Date, default: null }
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

PayoutSchema.index({ owner_id: 1, created_at: -1 });

PayoutSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Payout', PayoutSchema);

export {};
