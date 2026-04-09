const mongoose = require('mongoose');

const ScheduleDaySchema = new mongoose.Schema(
  {
    day_of_week: { type: Number, default: null },
    is_open: { type: Boolean, default: null },
    day: { type: String, default: null },
    enabled: { type: Boolean, default: null },
    open_time: { type: String, default: '08:00' },
    close_time: { type: String, default: '24:00' }
  },
  { _id: false }
);

const PhotoSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    url: { type: String, required: true }
  },
  { _id: false }
);

const FieldReviewSchema = new mongoose.Schema(
  {
    submitted_at: { type: Date, default: null },
    reviewed_at: { type: Date, default: null },
    reviewed_by: { type: String, default: null },
    reject_reason: { type: String, default: null }
  },
  { _id: false }
);

const RatingStatsSchema = new mongoose.Schema(
  {
    avg: { type: Number, default: 0 },
    count: { type: Number, default: 0 }
  },
  { _id: false }
);

const PricingRuleSchema = new mongoose.Schema(
  {
    days: { type: [Number], default: [] },
    start: { type: String, required: true },
    end: { type: String, required: true },
    price_per_hour: { type: Number, required: true }
  },
  { _id: false }
);

const ClosureSchema = new mongoose.Schema(
  {
    date: { type: String, required: true, index: true },
    reason: { type: String, default: null },
    created_by: { type: String, default: null },
    created_at: { type: Date, default: Date.now }
  },
  { _id: false }
);

const FieldSchema = new mongoose.Schema(
  {
    owner_id: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['draft', 'pending_review', 'pending', 'active', 'rejected', 'suspended', 'deleted'],
      default: 'pending',
      index: true
    },
    name: { type: String, required: true },
    phone: { type: String, default: null },
    city: { type: String, default: null },
    area: { type: String, default: null },
    address: { type: String, default: null },
    lat: { type: Number, required: true, index: true },
    lng: { type: Number, required: true, index: true },
    sport: { type: String, default: null, index: true },
    surface: { type: String, default: null },
    size: { type: String, default: null },
    price_per_hour: { type: Number, default: 0 },
    peak_price_per_hour: { type: Number, default: 0 },
    pricing_rules: { type: [PricingRuleSchema], default: [] },
    amenities: { type: [String], default: [] },
    is_covered: { type: Boolean, default: false },
    cover_image_url: { type: String, default: null },
    photos: { type: [PhotoSchema], default: [] },
    schedule: { type: [ScheduleDaySchema], default: [] },
    closures: { type: [ClosureSchema], default: [] },
    review: { type: FieldReviewSchema, default: () => ({}) },
    rating_stats: { type: RatingStatsSchema, default: () => ({}) }
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

FieldSchema.index({ status: 1, city: 1 });

FieldSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Field', FieldSchema);

export {};
