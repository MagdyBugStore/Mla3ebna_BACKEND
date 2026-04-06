const mongoose = require('mongoose');

const BookingPriceSchema = new mongoose.Schema(
  {
    subtotal: { type: Number, default: 0 },
    fees: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    currency: { type: String, default: 'EGP' }
  },
  { _id: false }
);

const BookingCancelSchema = new mongoose.Schema(
  {
    cancelled_at: { type: Date, default: null },
    cancelled_by: { type: String, default: null },
    policy: { type: String, enum: ['gt_24h', 'lt_24h'], default: null },
    refund_amount: { type: Number, default: 0 }
  },
  { _id: false }
);

const BookingSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['pending_payment', 'confirmed', 'cancelled', 'completed', 'no_show'],
      default: 'confirmed',
      index: true
    },
    payment_status: {
      type: String,
      enum: ['unpaid', 'pending', 'paid', 'failed', 'refunded', 'partially_refunded'],
      default: 'unpaid',
      index: true
    },
    user_id: { type: String, required: true, index: true },
    owner_id: { type: String, default: null, index: true },
    field_id: { type: String, required: true, index: true },
    date: { type: String, required: true, index: true },
    start_time: { type: String, required: true },
    end_time: { type: String, required: true },
    total_price: { type: Number, required: true },
    payment_method: { type: String, required: true },
    price: { type: BookingPriceSchema, default: () => ({}) },
    cancel: { type: BookingCancelSchema, default: () => ({}) },
    attended_at: { type: Date, default: null },
    review_id: { type: String, default: null, index: true }
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

BookingSchema.index({ field_id: 1, date: 1, start_time: 1, end_time: 1, status: 1 });
BookingSchema.index({ user_id: 1, status: 1, date: 1 });
BookingSchema.index({ owner_id: 1, status: 1, date: 1 });

BookingSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Booking', BookingSchema);

export {};
