function randomToken() {
  return `${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}

function makeBookingReference() {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `ML-${n}`;
}

function makePhotoId() {
  return `photo_${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}

module.exports = { randomToken, makeBookingReference, makePhotoId };

export {};
