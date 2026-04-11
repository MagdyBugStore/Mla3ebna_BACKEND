const express = require('express');
const { requireAuth, requireRole, optionalAuth } = require('../middleware/auth');
const authController = require('../controllers/authController');
const fieldsController = require('../controllers/fieldsController');
const bookingsController = require('../controllers/bookingsController');
const paymentsController = require('../controllers/paymentsController');
const profileController = require('../controllers/profileController');
const ownerController = require('../controllers/ownerController');
const adminController = require('../controllers/adminController');
const { upload } = require('../config/upload');

function buildV1Router() {
  const v1 = express.Router();

  v1.post('/auth/social', authController.social);
  v1.post('/auth/oauth', authController.social);
  v1.post('/auth/complete-profile', requireAuth, authController.completeProfile);
  v1.post('/auth/refresh', authController.refresh);
  v1.post('/auth/logout', requireAuth, authController.logout);
  v1.put('/auth/fcm-token', requireAuth, authController.fcmToken);
  v1.post('/auth/simple-google', authController.simpleGoogle);

  v1.get('/fields', requireAuth, fieldsController.list);
  v1.get('/fields/favorites', requireAuth, fieldsController.favoritesList);
  v1.get('/fields/:id', requireAuth, fieldsController.getById);
  v1.get('/fields/:id/reviews', requireAuth, fieldsController.listReviews);
  v1.get('/fields/:id/slots', requireAuth, fieldsController.slots);
  v1.post('/fields/:id/favorites', requireAuth, fieldsController.favoritesAdd);
  v1.delete('/fields/:id/favorites', requireAuth, fieldsController.favoritesRemove);

  v1.post('/bookings', requireAuth, bookingsController.create);
  v1.get('/bookings', requireAuth, bookingsController.list);
  v1.get('/bookings/:id', requireAuth, bookingsController.getById);
  v1.delete('/bookings/:id', requireAuth, bookingsController.cancel);
  v1.post('/bookings/:id/review', requireAuth, bookingsController.review);

  v1.get('/payments/methods', requireAuth, paymentsController.methods);
  v1.post('/payments/initiate', requireAuth, paymentsController.initiate);
  v1.post('/payments/verify', requireAuth, paymentsController.verify);

  v1.post('/webhooks/paymob', paymentsController.paymobWebhook);

  v1.get('/profile', requireAuth, profileController.get);
  v1.put('/profile', requireAuth, profileController.update);
  v1.put('/profile/avatar', requireAuth, upload.single('file'), profileController.avatar);
  v1.get('/profile/notifications', requireAuth, profileController.notifications);
  v1.put('/profile/notifications/read-all', requireAuth, profileController.notificationsReadAll);
  v1.put('/profile/fcm-token', requireAuth, profileController.fcmToken);

  v1.post('/owner/fields', requireAuth, requireRole('owner'), ownerController.createField);
  v1.get('/owner/fields/me', requireAuth, requireRole('owner'), ownerController.getMyField);
  v1.put('/owner/fields/:id', requireAuth, requireRole('owner'), ownerController.updateField);
  v1.put('/owner/fields/:id/specs', requireAuth, requireRole('owner'), ownerController.specs);
  v1.post('/owner/fields/:id/photos', requireAuth, requireRole('owner'), upload.array('files', 10), ownerController.photos);
  v1.put('/owner/fields/:id/photos', requireAuth, requireRole('owner'), upload.array('files', 10), ownerController.photos);
  v1.delete('/owner/fields/:id/photos/:photoId', requireAuth, requireRole('owner'), ownerController.deletePhoto);
  v1.put('/owner/fields/:id/pricing', requireAuth, requireRole('owner'), ownerController.pricing);
  v1.put('/owner/fields/:id/schedule', requireAuth, requireRole('owner'), ownerController.schedule);
  v1.put('/owner/fields/:id/submit-for-review', requireAuth, requireRole('owner'), ownerController.submitForReview);
  v1.get('/owner/fields/:id', requireAuth, requireRole('owner'), ownerController.getField);

  v1.get('/owner/bookings', requireAuth, requireRole('owner'), ownerController.listBookings);
  v1.get('/owner/bookings/:id', requireAuth, requireRole('owner'), ownerController.getBooking);
  v1.put('/owner/bookings/:id/confirm-attendance', requireAuth, requireRole('owner'), ownerController.confirmBooking);
  v1.put('/owner/bookings/:id/confirm', requireAuth, requireRole('owner'), ownerController.confirmBooking);
  v1.delete('/owner/bookings/:id', requireAuth, requireRole('owner'), ownerController.cancelBooking);

  v1.get('/owner/stats', requireAuth, requireRole('owner'), ownerController.stats);
  v1.get('/owner/stats/revenue', requireAuth, requireRole('owner'), ownerController.revenue);

  v1.get('/owner/notifications', requireAuth, requireRole('owner'), ownerController.notifications);
  v1.put('/owner/notifications/read-all', requireAuth, requireRole('owner'), ownerController.notificationsReadAll);

  v1.get('/owner/wallet', requireAuth, requireRole('owner'), ownerController.wallet);
  v1.get('/owner/ledger', requireAuth, requireRole('owner'), ownerController.ledger);
  v1.get('/owner/payouts', requireAuth, requireRole('owner'), ownerController.payouts);
  v1.post('/owner/payouts', requireAuth, requireRole('owner'), ownerController.requestPayout);

  v1.get('/admin/fields', requireAuth, requireRole('admin'), adminController.listFields);
  v1.put('/admin/fields/:id/approve', requireAuth, requireRole('admin'), adminController.approveField);
  v1.put('/admin/fields/:id/reject', requireAuth, requireRole('admin'), adminController.rejectField);

  v1.get('/admin/payouts', requireAuth, requireRole('admin'), adminController.listPayouts);
  v1.put('/admin/payouts/:id/paid', requireAuth, requireRole('admin'), adminController.markPayoutPaid);
  v1.put('/admin/payouts/:id/failed', requireAuth, requireRole('admin'), adminController.markPayoutFailed);

  return v1;
}

module.exports = { buildV1Router };

export { };
