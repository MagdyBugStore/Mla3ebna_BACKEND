const mongoose = require('mongoose');

const PaymentEventSchema = new mongoose.Schema(
  {
    provider: { type: String, required: true, index: true },
    event_id: { type: String, required: true },
    type: { type: String, default: null, index: true },
    signature_valid: { type: Boolean, default: false },
    received_at: { type: Date, default: Date.now, index: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: null },
    processed_at: { type: Date, default: null },
    processing_result: { type: String, enum: ['ok', 'ignored', 'error'], default: null, index: true },
    booking_id: { type: String, default: null, index: true },
    payment_id: { type: String, default: null, index: true }
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

PaymentEventSchema.index({ provider: 1, event_id: 1 }, { unique: true });

PaymentEventSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('PaymentEvent', PaymentEventSchema);

export {};
