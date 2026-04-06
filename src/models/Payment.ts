const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema(
  {
    booking_id: { type: String, required: true, index: true },
    user_id: { type: String, required: true, index: true },
    owner_id: { type: String, default: null, index: true },
    field_id: { type: String, default: null, index: true },
    provider: { type: String, default: null, index: true },
    method: { type: String, required: true },
    card_token: { type: String, default: null },
    status: { type: String, enum: ['initiated', 'pending', 'paid', 'failed', 'cancelled'], default: 'pending', index: true },
    amount: { type: Number, default: 0 },
    currency: { type: String, default: 'EGP' },
    provider_refs: { type: mongoose.Schema.Types.Mixed, default: null },
    transaction_id: { type: String, default: null },
    initiated_at: { type: Date, default: Date.now },
    paid_at: { type: Date, default: null },
    failed_at: { type: Date, default: null }
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

PaymentSchema.index({ provider: 1, transaction_id: 1 });

PaymentSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Payment', PaymentSchema);

export {};
