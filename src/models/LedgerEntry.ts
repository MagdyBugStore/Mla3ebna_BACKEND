const mongoose = require('mongoose');

const LedgerEntrySchema = new mongoose.Schema(
  {
    account_id: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: ['booking_revenue', 'platform_fee', 'payout', 'refund_debit', 'adjustment'],
      required: true,
      index: true
    },
    direction: { type: String, enum: ['credit', 'debit'], required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'EGP' },
    booking_id: { type: String, default: null, index: true },
    payment_id: { type: String, default: null, index: true },
    refund_id: { type: String, default: null, index: true },
    occurred_at: { type: Date, default: Date.now, index: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: null }
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

LedgerEntrySchema.index({ account_id: 1, occurred_at: -1 });

LedgerEntrySchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('LedgerEntry', LedgerEntrySchema);

export {};
