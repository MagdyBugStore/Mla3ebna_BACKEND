const mongoose = require('mongoose');

const ReviewSchema = new mongoose.Schema(
  {
    booking_id: { type: String, default: null, index: true },
    field_id: { type: String, required: true, index: true },
    user_id: { type: String, required: true, index: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: null }
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

ReviewSchema.index(
  { booking_id: 1, user_id: 1 },
  { unique: true, partialFilterExpression: { booking_id: { $type: 'string' } } }
);

ReviewSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Review', ReviewSchema);

export {};
