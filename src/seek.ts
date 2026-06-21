require('dotenv').config();

const mongoose = require('mongoose');
const { env } = require('./config/env');
const User = require('./models/User');
const Field = require('./models/Field');
const Review = require('./models/Review');

const UPLOADS = '/uploads';

const schedule = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
  day_of_week: day,
  is_open: true,
  open_time: '08:00',
  close_time: '24:00',
}));

const fields = [
  {
    name: 'ملعب الأهرام',
    city: 'الجيزة',
    area: 'الهرم',
    address: 'شارع الهرم، أمام النادي',
    lat: 29.9792,
    lng: 31.1342,
    sport: 'football',
    surface: 'artificial_grass',
    size: '5v5',
    price_per_hour: 120,
    peak_price_per_hour: 180,
    amenities: ['lighting', 'parking', 'changing_rooms'],
    is_covered: false,
    cover_image_url: `${UPLOADS}/19d751ae511_42ca11841e4ed.webp`,
    photos: [
      { id: 'p1', url: `${UPLOADS}/19d751ae515_e765c25823491.webp` },
      { id: 'p2', url: `${UPLOADS}/19d9122200c_faf5529bab2768.jpg` },
    ],
  },
  {
    name: 'ملعب الزمالك',
    city: 'القاهرة',
    area: 'الزمالك',
    address: 'شارع حسن صبري',
    lat: 30.0626,
    lng: 31.2197,
    sport: 'football',
    surface: 'natural',
    size: '7v7',
    price_per_hour: 200,
    peak_price_per_hour: 300,
    amenities: ['lighting', 'cafe', 'parking'],
    is_covered: true,
    cover_image_url: `${UPLOADS}/19d751ae515_aca5f61214ee4.jpg`,
    photos: [
      { id: 'p1', url: `${UPLOADS}/19d9122200c_d9e02d97499a88.jpg` },
    ],
  },
  {
    name: 'ملعب المعادي بادل',
    city: 'القاهرة',
    area: 'المعادي',
    address: 'شارع 9، المعادي الجديدة',
    lat: 29.9602,
    lng: 31.2569,
    sport: 'padel',
    surface: 'artificial_grass',
    size: '4v4',
    price_per_hour: 250,
    peak_price_per_hour: 350,
    amenities: ['lighting', 'cafe', 'changing_rooms', 'showers'],
    is_covered: true,
    cover_image_url: `${UPLOADS}/19d9122200c_e8b1bb55108078.jpg`,
    photos: [
      { id: 'p1', url: `${UPLOADS}/19d9122200c_faf5529bab2768.jpg` },
      { id: 'p2', url: `${UPLOADS}/19d944cc008_da01ee94c59e88.jpg` },
    ],
  },
  {
    name: 'ملعب النجوم',
    city: 'القاهرة',
    area: 'مدينة نصر',
    address: 'شارع عباس العقاد، بجوار سيتي ستارز',
    lat: 30.0744,
    lng: 31.3394,
    sport: 'football',
    surface: 'artificial_grass',
    size: '11v11',
    price_per_hour: 500,
    peak_price_per_hour: 700,
    amenities: ['lighting', 'parking', 'cafe', 'changing_rooms', 'showers'],
    is_covered: false,
    cover_image_url: `${UPLOADS}/19d912c0e37_6312b48b140bd8.jpg`,
    photos: [
      { id: 'p1', url: `${UPLOADS}/19d912c0e37_a0ca839417d26.jpg` },
      { id: 'p2', url: `${UPLOADS}/19d912c0e38_9b10dcb19114d.jpg` },
    ],
  },
  {
    name: 'أكاديمية التجمع',
    city: 'القاهرة',
    area: 'التجمع الخامس',
    address: 'التسعين الشمالي، بجوار ذا بيفلي هيلز',
    lat: 30.0081,
    lng: 31.4671,
    sport: 'basketball',
    surface: 'concrete',
    size: '5v5',
    price_per_hour: 150,
    peak_price_per_hour: 200,
    amenities: ['lighting', 'parking'],
    is_covered: true,
    cover_image_url: `${UPLOADS}/19d9122200c_d9e02d97499a88.jpg`,
    photos: [
      { id: 'p1', url: `${UPLOADS}/19d751ae511_42ca11841e4ed.webp` },
    ],
  },
  {
    name: 'ملعب السلام',
    city: 'القاهرة',
    area: 'عين شمس',
    address: 'شارع المحور، عين شمس الشرقية',
    lat: 30.1242,
    lng: 31.3386,
    sport: 'football',
    surface: 'artificial_grass',
    size: '5v5',
    price_per_hour: 100,
    peak_price_per_hour: 150,
    amenities: ['lighting', 'changing_rooms'],
    is_covered: false,
    cover_image_url: `${UPLOADS}/19d944cc007_0e32d5414a6ca8.jpg`,
    photos: [
      { id: 'p1', url: `${UPLOADS}/19d944cc008_9e51bc849374e8.jpg` },
    ],
  },
  {
    name: 'ملعب المنيل بادل',
    city: 'القاهرة',
    area: 'المنيل',
    address: 'شارع المنيل، بجوار كوبري المنيل',
    lat: 30.0060,
    lng: 31.2248,
    sport: 'padel',
    surface: 'artificial_grass',
    size: '4v4',
    price_per_hour: 220,
    peak_price_per_hour: 320,
    amenities: ['lighting', 'cafe', 'parking', 'changing_rooms'],
    is_covered: true,
    cover_image_url: `${UPLOADS}/19d944cc008_9e51bc849374e8.jpg`,
    photos: [
      { id: 'p1', url: `${UPLOADS}/19d944cc008_da01ee94c59e88.jpg` },
      { id: 'p2', url: `${UPLOADS}/19d9122200c_e8b1bb55108078.jpg` },
    ],
  },
  {
    name: 'ملعب أكتوبر',
    city: 'الجيزة',
    area: '6 أكتوبر',
    address: 'المحور المركزي، بجوار المول العرب',
    lat: 29.9716,
    lng: 30.9220,
    sport: 'football',
    surface: 'artificial_grass',
    size: '7v7',
    price_per_hour: 160,
    peak_price_per_hour: 230,
    amenities: ['lighting', 'parking', 'cafe'],
    is_covered: false,
    cover_image_url: `${UPLOADS}/19d912c0e38_9b10dcb19114d.jpg`,
    photos: [
      { id: 'p1', url: `${UPLOADS}/19d912c0e37_a0ca839417d26.jpg` },
      { id: 'p2', url: `${UPLOADS}/19d944cc007_0e32d5414a6ca8.jpg` },
    ],
  },
];

async function seek() {
  await mongoose.connect(env.mongoUri);
  console.log('✅ Connected to MongoDB');

  // Drop stale legacy index left from an old schema (tripId/reviewerId no longer exist)
  await mongoose.connection.collection('reviews').dropIndex('tripId_1_reviewerId_1').catch(() => {});


  let owner = await User.findOne({ email: 'mindtechnologya@gmail.com' });
  if (!owner) {
    owner = await User.create({
      phone: '+201100000099',
      role: 'owner',
      first_name: 'مالك',
      last_name: 'الملاعب',
      email: 'owner@seed.com',
      avatar_url: null,
      favorites: [],
      fcm_token: null,
      fcm_tokens: [],
      profile_completed_at: new Date(),
    });
    console.log(`✅ Created seed owner: ${owner.id}`);
  }

  let player = await User.findOne({ email: 'ahmedmegaa1@gmail.com' });
  if (!player) {
    player = await User.create({
      phone: '+201100000098',
      role: 'player',
      first_name: 'لاعب',
      last_name: 'تجريبي',
      email: 'player@seed.com',
      avatar_url: null,
      favorites: [],
      fcm_token: null,
      fcm_tokens: [],
      profile_completed_at: new Date(),
    });
    console.log(`✅ Created seed player: ${player.id}`);
  }

  await Field.deleteMany({ owner_id: owner.id });
  console.log('🗑️  Cleared previous seed fields');

  for (const data of fields) {
    const field = await Field.create({
      owner_id: owner.id,
      status: 'active',
      phone: owner.phone,
      schedule,
      rating_stats: { avg: +(3.5 + Math.random() * 1.5).toFixed(1), count: Math.floor(Math.random() * 40) + 5 },
      ...data,
    });

    await Review.create({
      booking_id: null,
      field_id: field.id,
      user_id: player.id,
      rating: 4 + Math.round(Math.random()),
      comment: 'ملعب ممتاز وخدمة رائعة',
    });

    console.log(`  ✅ ${field.name} (${field.city})`);
  }

  console.log(`\n🎉 Seeded ${fields.length} fields successfully`);
  await mongoose.disconnect();
}

seek().catch((err) => {
  console.error('❌ Seek failed:', err);
  process.exit(1);
});

export {};
