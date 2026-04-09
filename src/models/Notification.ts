const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema(
  {
    user_id: { type: String, required: true, index: true },
    type: { type: String, required: true, default: 'generic', index: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    data: { type: mongoose.Schema.Types.Mixed, default: null },
    read_at: { type: Date, default: null }
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

NotificationSchema.index({ user_id: 1, read_at: 1, created_at: -1 });

NotificationSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Notification', NotificationSchema);

export {};
