import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { JSONFilePreset } from 'lowdb/node'
import { nanoid } from 'nanoid'

const app = express()
const PORT = process.env.PORT || 4000
const JWT_SECRET = process.env.JWT_SECRET || 'bridal-booking-secret'

const defaultData = {
  users: [],
  artistProfiles: [],
  bookings: [],
  reviews: [],
  notifications: [],
  reports: []
}

const db = await JSONFilePreset(new URL('./db.json', import.meta.url).pathname, defaultData)

app.use(cors())
app.use(express.json({ limit: '2mb' }))

const sanitizeUser = (user) => ({ id: user.id, name: user.name, email: user.email, role: user.role })

const issueToken = (user) => jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' })

const authRequired = (req, res, next) => {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ message: 'Unauthorized' })
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET)
    const user = db.data.users.find((u) => u.id === payload.sub)
    if (!user) return res.status(401).json({ message: 'Invalid token' })
    req.user = user
    next()
  } catch {
    return res.status(401).json({ message: 'Invalid token' })
  }
}

const roleRequired = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' })
  next()
}

const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd

const notify = async (toUserId, message, meta = {}) => {
  db.data.notifications.push({ id: nanoid(), toUserId, message, meta, isRead: false, createdAt: new Date().toISOString() })
  await db.write()
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'bridal-booking-api' }))

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, role } = req.body
  if (!name || !email || !password || !role) return res.status(400).json({ message: 'name, email, password and role are required' })
  if (!['artist', 'customer', 'admin'].includes(role)) return res.status(400).json({ message: 'Invalid role' })
  const exists = db.data.users.some((u) => u.email.toLowerCase() === email.toLowerCase())
  if (exists) return res.status(409).json({ message: 'Email already registered' })

  const user = {
    id: nanoid(),
    name,
    email: email.toLowerCase(),
    passwordHash: await bcrypt.hash(password, 10),
    role,
    createdAt: new Date().toISOString()
  }
  db.data.users.push(user)

  if (role === 'artist') {
    db.data.artistProfiles.push({
      id: nanoid(),
      userId: user.id,
      bio: '',
      city: '',
      yearsOfExperience: 0,
      specialties: [],
      startingFee: 0,
      services: [],
      portfolio: [],
      availabilitySlots: [],
      isVerified: false,
      createdAt: new Date().toISOString()
    })
  }

  await db.write()
  return res.status(201).json({ token: issueToken(user), user: sanitizeUser(user) })
})

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body
  const user = db.data.users.find((u) => u.email.toLowerCase() === String(email || '').toLowerCase())
  if (!user) return res.status(401).json({ message: 'Invalid credentials' })
  const ok = await bcrypt.compare(password || '', user.passwordHash)
  if (!ok) return res.status(401).json({ message: 'Invalid credentials' })
  return res.json({ token: issueToken(user), user: sanitizeUser(user) })
})

app.get('/api/me', authRequired, (req, res) => res.json({ user: sanitizeUser(req.user) }))

app.get('/api/artists', (req, res) => {
  const { city, specialty, minFee, maxFee, rating } = req.query
  const artists = db.data.artistProfiles
    .map((profile) => {
      const user = db.data.users.find((u) => u.id === profile.userId)
      const profileReviews = db.data.reviews.filter((r) => r.artistUserId === profile.userId)
      const avgRating = profileReviews.length ? Number((profileReviews.reduce((sum, r) => sum + r.rating, 0) / profileReviews.length).toFixed(1)) : 0
      return {
        ...profile,
        artistName: user?.name || 'Unknown Artist',
        artistEmail: user?.email,
        averageRating: avgRating,
        reviewCount: profileReviews.length
      }
    })
    .filter((artist) => {
      if (city && !artist.city.toLowerCase().includes(String(city).toLowerCase())) return false
      if (specialty && !artist.specialties.some((s) => s.toLowerCase().includes(String(specialty).toLowerCase()))) return false
      if (minFee && artist.startingFee < Number(minFee)) return false
      if (maxFee && artist.startingFee > Number(maxFee)) return false
      if (rating && artist.averageRating < Number(rating)) return false
      return true
    })

  return res.json({ artists })
})

app.get('/api/artists/:artistUserId', (req, res) => {
  const artistUserId = req.params.artistUserId
  const profile = db.data.artistProfiles.find((p) => p.userId === artistUserId)
  if (!profile) return res.status(404).json({ message: 'Artist not found' })
  const user = db.data.users.find((u) => u.id === artistUserId)
  const reviews = db.data.reviews.filter((r) => r.artistUserId === artistUserId)
  return res.json({
    artist: {
      ...profile,
      artistName: user?.name,
      artistEmail: user?.email,
      reviews
    }
  })
})

app.put('/api/artists/me/profile', authRequired, roleRequired('artist'), async (req, res) => {
  const profile = db.data.artistProfiles.find((p) => p.userId === req.user.id)
  if (!profile) return res.status(404).json({ message: 'Profile not found' })

  const { bio, city, yearsOfExperience, specialties, startingFee, portfolio } = req.body
  profile.bio = bio ?? profile.bio
  profile.city = city ?? profile.city
  profile.yearsOfExperience = Number(yearsOfExperience ?? profile.yearsOfExperience)
  profile.specialties = Array.isArray(specialties) ? specialties : profile.specialties
  profile.startingFee = Number(startingFee ?? profile.startingFee)
  profile.portfolio = Array.isArray(portfolio) ? portfolio : profile.portfolio

  await db.write()
  return res.json({ profile })
})

app.get('/api/artists/me/profile', authRequired, roleRequired('artist'), (req, res) => {
  const profile = db.data.artistProfiles.find((p) => p.userId === req.user.id)
  if (!profile) return res.status(404).json({ message: 'Profile not found' })
  return res.json({ profile })
})

app.post('/api/artists/me/services', authRequired, roleRequired('artist'), async (req, res) => {
  const profile = db.data.artistProfiles.find((p) => p.userId === req.user.id)
  if (!profile) return res.status(404).json({ message: 'Profile not found' })
  const { name, description, fee } = req.body
  if (!name || fee === undefined) return res.status(400).json({ message: 'name and fee are required' })

  profile.services.push({ id: nanoid(), name, description: description || '', fee: Number(fee) })
  await db.write()
  return res.status(201).json({ services: profile.services })
})

app.post('/api/artists/me/availability', authRequired, roleRequired('artist'), async (req, res) => {
  const profile = db.data.artistProfiles.find((p) => p.userId === req.user.id)
  if (!profile) return res.status(404).json({ message: 'Profile not found' })
  const { date, startTime, endTime } = req.body
  if (!date || !startTime || !endTime) return res.status(400).json({ message: 'date, startTime and endTime are required' })
  if (startTime >= endTime) return res.status(400).json({ message: 'Invalid time range' })

  const exists = profile.availabilitySlots.some((slot) => slot.date === date && overlaps(slot.startTime, slot.endTime, startTime, endTime))
  if (exists) return res.status(409).json({ message: 'Availability slot overlaps existing slot' })

  profile.availabilitySlots.push({ id: nanoid(), date, startTime, endTime })
  await db.write()
  return res.status(201).json({ availabilitySlots: profile.availabilitySlots })
})

app.get('/api/artists/me/bookings', authRequired, roleRequired('artist'), (req, res) => {
  const bookings = db.data.bookings.filter((b) => b.artistUserId === req.user.id)
  return res.json({ bookings })
})

app.post('/api/bookings', authRequired, roleRequired('customer'), async (req, res) => {
  const { artistUserId, date, startTime, endTime, serviceName, notes, fee } = req.body
  if (!artistUserId || !date || !startTime || !endTime || !serviceName) return res.status(400).json({ message: 'Missing required fields' })
  if (startTime >= endTime) return res.status(400).json({ message: 'Invalid time range' })

  const artistProfile = db.data.artistProfiles.find((p) => p.userId === artistUserId)
  if (!artistProfile) return res.status(404).json({ message: 'Artist not found' })

  const hasAvailability = artistProfile.availabilitySlots.some((slot) => slot.date === date && slot.startTime <= startTime && slot.endTime >= endTime)
  if (!hasAvailability) return res.status(409).json({ message: 'Requested slot is outside artist availability' })

  const conflicts = db.data.bookings.some((b) =>
    b.artistUserId === artistUserId &&
    b.date === date &&
    ['pending', 'confirmed'].includes(b.status) &&
    overlaps(b.startTime, b.endTime, startTime, endTime)
  )
  if (conflicts) return res.status(409).json({ message: 'Artist is already booked for this slot' })

  const booking = {
    id: nanoid(),
    customerUserId: req.user.id,
    artistUserId,
    date,
    startTime,
    endTime,
    serviceName,
    fee: Number(fee || artistProfile.startingFee),
    notes: notes || '',
    status: 'pending',
    createdAt: new Date().toISOString()
  }

  db.data.bookings.push(booking)
  await db.write()
  await notify(artistUserId, `New booking request from ${req.user.name}`, { bookingId: booking.id })

  return res.status(201).json({ booking })
})

app.patch('/api/bookings/:bookingId/status', authRequired, roleRequired('artist', 'customer'), async (req, res) => {
  const { status } = req.body
  const booking = db.data.bookings.find((b) => b.id === req.params.bookingId)
  if (!booking) return res.status(404).json({ message: 'Booking not found' })

  const actorIsArtist = req.user.id === booking.artistUserId
  const actorIsCustomer = req.user.id === booking.customerUserId
  if (!actorIsArtist && !actorIsCustomer) return res.status(403).json({ message: 'Forbidden' })

  const artistAllowed = ['confirmed', 'rejected', 'completed', 'cancelled']
  const customerAllowed = ['cancelled']

  if (actorIsArtist && !artistAllowed.includes(status)) return res.status(400).json({ message: 'Invalid status for artist action' })
  if (actorIsCustomer && !customerAllowed.includes(status)) return res.status(400).json({ message: 'Invalid status for customer action' })

  booking.status = status
  booking.updatedAt = new Date().toISOString()
  await db.write()

  const recipient = actorIsArtist ? booking.customerUserId : booking.artistUserId
  await notify(recipient, `Booking ${booking.id} status changed to ${status}`, { bookingId: booking.id, status })

  return res.json({ booking })
})

app.get('/api/customers/me/bookings', authRequired, roleRequired('customer'), (req, res) => {
  const bookings = db.data.bookings.filter((b) => b.customerUserId === req.user.id)
  return res.json({ bookings })
})

app.post('/api/reviews', authRequired, roleRequired('customer'), async (req, res) => {
  const { artistUserId, rating, comment } = req.body
  if (!artistUserId || !rating) return res.status(400).json({ message: 'artistUserId and rating are required' })
  if (rating < 1 || rating > 5) return res.status(400).json({ message: 'rating must be 1-5' })

  const completedBooking = db.data.bookings.find(
    (b) => b.customerUserId === req.user.id && b.artistUserId === artistUserId && b.status === 'completed'
  )
  if (!completedBooking) return res.status(403).json({ message: 'You can only review artists after a completed booking' })

  db.data.reviews.push({
    id: nanoid(),
    customerUserId: req.user.id,
    artistUserId,
    rating: Number(rating),
    comment: comment || '',
    createdAt: new Date().toISOString()
  })

  await db.write()
  return res.status(201).json({ message: 'Review submitted' })
})

app.get('/api/notifications/me', authRequired, (req, res) => {
  const notifications = db.data.notifications.filter((n) => n.toUserId === req.user.id)
  return res.json({ notifications })
})

app.get('/api/admin/artists/pending', authRequired, roleRequired('admin'), (req, res) => {
  const pending = db.data.artistProfiles
    .filter((p) => !p.isVerified)
    .map((profile) => ({
      ...profile,
      artist: sanitizeUser(db.data.users.find((u) => u.id === profile.userId))
    }))
  return res.json({ pending })
})

app.patch('/api/admin/artists/:artistUserId/verify', authRequired, roleRequired('admin'), async (req, res) => {
  const profile = db.data.artistProfiles.find((p) => p.userId === req.params.artistUserId)
  if (!profile) return res.status(404).json({ message: 'Artist not found' })
  profile.isVerified = true
  profile.verifiedAt = new Date().toISOString()
  await db.write()
  await notify(profile.userId, 'Your artist profile has been verified by admin', { verified: true })
  return res.json({ profile })
})

app.post('/api/admin/reports', authRequired, async (req, res) => {
  const { bookingId, reason } = req.body
  if (!bookingId || !reason) return res.status(400).json({ message: 'bookingId and reason are required' })

  const booking = db.data.bookings.find((b) => b.id === bookingId)
  if (!booking) return res.status(404).json({ message: 'Booking not found' })
  if (![booking.artistUserId, booking.customerUserId].includes(req.user.id)) return res.status(403).json({ message: 'Forbidden' })

  db.data.reports.push({ id: nanoid(), bookingId, raisedBy: req.user.id, reason, status: 'open', createdAt: new Date().toISOString() })
  await db.write()
  return res.status(201).json({ message: 'Report submitted' })
})

app.get('/api/admin/reports', authRequired, roleRequired('admin'), (req, res) => {
  return res.json({ reports: db.data.reports })
})

if (db.data.users.length === 0) {
  const admin = {
    id: nanoid(),
    name: 'Admin',
    email: 'admin@bridalapp.local',
    passwordHash: await bcrypt.hash('admin123', 10),
    role: 'admin',
    createdAt: new Date().toISOString()
  }
  db.data.users.push(admin)
  await db.write()
}

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Bridal Booking API running on port ${PORT}`)
})
