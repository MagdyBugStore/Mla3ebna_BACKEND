const User = require('./models/User');
const Field = require('./models/Field');
const Review = require('./models/Review');
const Notification = require('./models/Notification');

async function seedIfEmpty() {
  const userCount = await User.countDocuments({});
  const fieldCount = await Field.countDocuments({});
  if (userCount > 0 || fieldCount > 0) return;

  const player = await User.create({
    phone: '+201000000001',
    role: 'player',
    first_name: 'أحمد',
    last_name: 'علي',
    email: 'ahmed@example.com',
    avatar_url: null,
    favorites: [],
    fcm_token: null,
    fcm_tokens: [],
    profile_completed_at: new Date()
  });

  const owner = await User.create({
    phone: '+201000000002',
    role: 'owner',
    first_name: 'محمد',
    last_name: 'حسن',
    email: 'owner@example.com',
    avatar_url: null,
    favorites: [],
    fcm_token: null,
    fcm_tokens: [],
    profile_completed_at: new Date()
  });

  await User.create({
    phone: '+201000000003',
    role: 'admin',
    first_name: 'Admin',
    last_name: 'User',
    email: 'admin@example.com',
    avatar_url: null,
    favorites: [],
    fcm_token: null,
    fcm_tokens: [],
    profile_completed_at: new Date()
  });

  const field = await Field.create({
    owner_id: owner.id,
    status: 'active',
    name: 'ملعب النجوم',
    phone: owner.phone,
    city: 'القاهرة',
    area: 'مدينة نصر',
    address: 'شارع عباس العقاد',
    lat: 30.0626,
    lng: 31.3219,
    sport: 'football',
    surface: 'artificial_grass',
    size: '5v5',
    price_per_hour: 150,
    peak_price_per_hour: 200,
    amenities: ['lighting', 'parking', 'cafe'],
    is_covered: true,
    cover_image_url: 'https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1200&q=60',
    photos: [],
    schedule: [
      { day_of_week: 0, is_open: true, open_time: '08:00', close_time: '24:00' },
      { day_of_week: 1, is_open: true, open_time: '08:00', close_time: '24:00' },
      { day_of_week: 2, is_open: true, open_time: '08:00', close_time: '24:00' },
      { day_of_week: 3, is_open: true, open_time: '08:00', close_time: '24:00' },
      { day_of_week: 4, is_open: true, open_time: '08:00', close_time: '24:00' },
      { day_of_week: 5, is_open: false },
      { day_of_week: 6, is_open: true, open_time: '08:00', close_time: '24:00' }
    ]
  });

  await Review.create({
    booking_id: null,
    field_id: field.id,
    user_id: player.id,
    rating: 5,
    comment: 'ملعب ممتاز وخدمة رائعة'
  });

  await Notification.create({
    user_id: player.id,
    type: 'generic',
    title: 'مرحباً بك',
    body: 'تم إنشاء حسابك بنجاح',
    read_at: null
  });

  await Notification.create({
    user_id: owner.id,
    type: 'generic',
    title: 'تم إضافة ملعب',
    body: 'ملعبك جاهز للتفعيل',
    read_at: null
  });
}

module.exports = { seedIfEmpty };

export {};
