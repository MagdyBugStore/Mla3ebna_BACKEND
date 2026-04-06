const mongoose = require('mongoose');

const RefundSchema = new mongoose.Schema(
  {
    booking_id: { type: String, required: true, index: true },
    payment_id: { type: String, required: true, index: true },
    status: { type: String, enum: ['requested', 'processing', 'succeeded', 'failed'], default: 'requested', index: true },
    amount: { type: Number, required: true },
    reason: { type: String, default: null },
    requested_by: { type: String, default: null, index: true },
    requested_at: { type: Date, default: Date.now, index: true },
    completed_at: { type: Date, default: null },
    provider_refund_id: { type: String, default: null, index: true }
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

RefundSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Refund', RefundSchema);

export {};
