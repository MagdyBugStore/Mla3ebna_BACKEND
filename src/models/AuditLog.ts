const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema(
  {
    actor_id: { type: String, default: null, index: true },
    action: { type: String, required: true, index: true },
    entity_type: { type: String, required: true, index: true },
    entity_id: { type: String, required: true, index: true },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null }
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

AuditLogSchema.index({ entity_type: 1, entity_id: 1, created_at: -1 });

AuditLogSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('AuditLog', AuditLogSchema);

export {};
