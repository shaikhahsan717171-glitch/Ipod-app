import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'

type Role = 'artist' | 'customer' | 'admin'
type User = { id: string; name: string; email: string; role: Role }
type Artist = {
  userId: string
  artistName: string
  city: string
  bio: string
  specialties: string[]
  startingFee: number
  services: { id: string; name: string; description: string; fee: number }[]
  availabilitySlots: { id: string; date: string; startTime: string; endTime: string }[]
  averageRating: number
  reviewCount: number
  isVerified: boolean
}
type Booking = {
  id: string
  customerUserId: string
  artistUserId: string
  date: string
  startTime: string
  endTime: string
  serviceName: string
  fee: number
  status: 'pending' | 'confirmed' | 'rejected' | 'completed' | 'cancelled'
}

type Profile = {
  bio: string
  city: string
  yearsOfExperience: number
  specialties: string[]
  startingFee: number
  portfolio: string[]
  services: { id: string; name: string; description: string; fee: number }[]
  availabilitySlots: { id: string; date: string; startTime: string; endTime: string }[]
  isVerified: boolean
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

function App() {
  const [token, setToken] = useState<string>(() => localStorage.getItem('token') || '')
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem('user')
    return raw ? JSON.parse(raw) : null
  })
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '', role: 'customer' as Role })
  const [message, setMessage] = useState('')

  const [artists, setArtists] = useState<Artist[]>([])
  const [filters, setFilters] = useState({ city: '', specialty: '', minFee: '', maxFee: '', rating: '' })

  const [customerBookings, setCustomerBookings] = useState<Booking[]>([])
  const [artistBookings, setArtistBookings] = useState<Booking[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)

  const [bookingForm, setBookingForm] = useState({ artistUserId: '', date: '', startTime: '', endTime: '', serviceName: '', fee: '', notes: '' })
  const [serviceForm, setServiceForm] = useState({ name: '', description: '', fee: '' })
  const [availabilityForm, setAvailabilityForm] = useState({ date: '', startTime: '', endTime: '' })

  const [pendingArtists, setPendingArtists] = useState<Artist[]>([])

  const authHeaders = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token])

  const logout = () => {
    setToken('')
    setUser(null)
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }

  const saveSession = (nextToken: string, nextUser: User) => {
    setToken(nextToken)
    setUser(nextUser)
    localStorage.setItem('token', nextToken)
    localStorage.setItem('user', JSON.stringify(nextUser))
  }

  const handleAuth = async (e: FormEvent) => {
    e.preventDefault()
    setMessage('')
    const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register'
    const payload = mode === 'login'
      ? { email: authForm.email, password: authForm.password }
      : authForm

    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const data = await res.json()
    if (!res.ok) return setMessage(data.message || 'Authentication failed')

    saveSession(data.token, data.user)
    setMessage(`Welcome ${data.user.name}`)
  }

  const loadArtists = async () => {
    const params = new URLSearchParams(
      Object.entries(filters).filter(([, value]) => value.trim() !== '') as [string, string][]
    )
    const res = await fetch(`${API_URL}/api/artists?${params.toString()}`)
    const data = await res.json()
    setArtists(data.artists || [])
  }

  const loadRoleData = async () => {
    if (!user || !token) return
    if (user.role === 'customer') {
      const bookingsRes = await fetch(`${API_URL}/api/customers/me/bookings`, { headers: authHeaders })
      const bookingsData = await bookingsRes.json()
      setCustomerBookings(bookingsData.bookings || [])
    }

    if (user.role === 'artist') {
      const [profileRes, bookingsRes] = await Promise.all([
        fetch(`${API_URL}/api/artists/me/profile`, { headers: authHeaders }),
        fetch(`${API_URL}/api/artists/me/bookings`, { headers: authHeaders })
      ])
      const profileData = await profileRes.json()
      const bookingsData = await bookingsRes.json()
      setProfile(profileData.profile)
      setArtistBookings(bookingsData.bookings || [])
    }

    if (user.role === 'admin') {
      const pendingRes = await fetch(`${API_URL}/api/admin/artists/pending`, { headers: authHeaders })
      const pendingData = await pendingRes.json()
      setPendingArtists(pendingData.pending || [])
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadArtists()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (user && token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadRoleData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, token])

  const updateArtistProfile = async (e: FormEvent) => {
    e.preventDefault()
    if (!profile) return

    const res = await fetch(`${API_URL}/api/artists/me/profile`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify(profile)
    })
    const data = await res.json()
    if (!res.ok) return setMessage(data.message || 'Profile update failed')
    setProfile(data.profile)
    setMessage('Artist profile updated')
    loadArtists()
  }

  const addService = async (e: FormEvent) => {
    e.preventDefault()
    const res = await fetch(`${API_URL}/api/artists/me/services`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ ...serviceForm, fee: Number(serviceForm.fee) })
    })
    const data = await res.json()
    if (!res.ok) return setMessage(data.message || 'Service add failed')
    setServiceForm({ name: '', description: '', fee: '' })
    setMessage('Service added')
    loadRoleData()
    loadArtists()
  }

  const addAvailability = async (e: FormEvent) => {
    e.preventDefault()
    const res = await fetch(`${API_URL}/api/artists/me/availability`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(availabilityForm)
    })
    const data = await res.json()
    if (!res.ok) return setMessage(data.message || 'Availability add failed')
    setAvailabilityForm({ date: '', startTime: '', endTime: '' })
    setMessage('Availability updated')
    loadRoleData()
    loadArtists()
  }

  const createBooking = async (e: FormEvent) => {
    e.preventDefault()
    const res = await fetch(`${API_URL}/api/bookings`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ ...bookingForm, fee: Number(bookingForm.fee || 0) })
    })
    const data = await res.json()
    if (!res.ok) return setMessage(data.message || 'Booking failed')
    setMessage('Booking request submitted')
    setBookingForm({ artistUserId: '', date: '', startTime: '', endTime: '', serviceName: '', fee: '', notes: '' })
    loadRoleData()
  }

  const updateBookingStatus = async (bookingId: string, status: Booking['status']) => {
    const res = await fetch(`${API_URL}/api/bookings/${bookingId}/status`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ status })
    })
    const data = await res.json()
    if (!res.ok) return setMessage(data.message || 'Status update failed')
    setMessage('Booking status updated')
    loadRoleData()
  }

  const verifyArtist = async (artistUserId: string) => {
    const res = await fetch(`${API_URL}/api/admin/artists/${artistUserId}/verify`, {
      method: 'PATCH',
      headers: authHeaders
    })
    const data = await res.json()
    if (!res.ok) return setMessage(data.message || 'Verification failed')
    setMessage('Artist verified')
    loadRoleData()
    loadArtists()
  }

  if (!user) {
    return (
      <main className="container">
        <h1>Bridal Booking App</h1>
        <p className="subtitle">A professional marketplace connecting makeup artists and customers.</p>

        <form className="card" onSubmit={handleAuth}>
          <h2>{mode === 'login' ? 'Login' : 'Register'}</h2>
          {mode === 'register' && (
            <input placeholder="Name" value={authForm.name} onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })} required />
          )}
          <input type="email" placeholder="Email" value={authForm.email} onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })} required />
          <input type="password" placeholder="Password" value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} required />
          {mode === 'register' && (
            <select value={authForm.role} onChange={(e) => setAuthForm({ ...authForm, role: e.target.value as Role })}>
              <option value="customer">Customer</option>
              <option value="artist">Makeup Artist</option>
            </select>
          )}
          <button type="submit">{mode === 'login' ? 'Login' : 'Create account'}</button>
          <button type="button" className="ghost" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'New user? Register' : 'Have an account? Login'}
          </button>
          {message && <p className="message">{message}</p>}
        </form>
      </main>
    )
  }

  return (
    <main className="container">
      <header className="header">
        <div>
          <h1>Bridal Booking App</h1>
          <p>{user.name} ({user.role})</p>
        </div>
        <button onClick={logout}>Logout</button>
      </header>

      <section className="card">
        <h2>Find Makeup Artists</h2>
        <div className="grid">
          <input placeholder="City" value={filters.city} onChange={(e) => setFilters({ ...filters, city: e.target.value })} />
          <input placeholder="Specialty" value={filters.specialty} onChange={(e) => setFilters({ ...filters, specialty: e.target.value })} />
          <input placeholder="Min fee" type="number" value={filters.minFee} onChange={(e) => setFilters({ ...filters, minFee: e.target.value })} />
          <input placeholder="Max fee" type="number" value={filters.maxFee} onChange={(e) => setFilters({ ...filters, maxFee: e.target.value })} />
          <input placeholder="Min rating" type="number" min="1" max="5" value={filters.rating} onChange={(e) => setFilters({ ...filters, rating: e.target.value })} />
          <button onClick={loadArtists}>Search</button>
        </div>

        <div className="list">
          {artists.map((artist) => (
            <article key={artist.userId} className="item">
              <h3>{artist.artistName} {artist.isVerified ? '✅' : ''}</h3>
              <p>{artist.city} • Starting ₹{artist.startingFee}</p>
              <p>{artist.specialties.join(', ') || 'No specialties yet'}</p>
              <p>Rating: {artist.averageRating || 0} ({artist.reviewCount})</p>
              <p>{artist.bio || 'No bio yet'}</p>
            </article>
          ))}
        </div>
      </section>

      {user.role === 'customer' && (
        <>
          <form className="card" onSubmit={createBooking}>
            <h2>Book an Artist</h2>
            <input placeholder="Artist User ID" value={bookingForm.artistUserId} onChange={(e) => setBookingForm({ ...bookingForm, artistUserId: e.target.value })} required />
            <input type="date" value={bookingForm.date} onChange={(e) => setBookingForm({ ...bookingForm, date: e.target.value })} required />
            <input type="time" value={bookingForm.startTime} onChange={(e) => setBookingForm({ ...bookingForm, startTime: e.target.value })} required />
            <input type="time" value={bookingForm.endTime} onChange={(e) => setBookingForm({ ...bookingForm, endTime: e.target.value })} required />
            <input placeholder="Service name" value={bookingForm.serviceName} onChange={(e) => setBookingForm({ ...bookingForm, serviceName: e.target.value })} required />
            <input placeholder="Fee" type="number" value={bookingForm.fee} onChange={(e) => setBookingForm({ ...bookingForm, fee: e.target.value })} />
            <textarea placeholder="Notes" value={bookingForm.notes} onChange={(e) => setBookingForm({ ...bookingForm, notes: e.target.value })} />
            <button type="submit">Request Booking</button>
          </form>

          <section className="card">
            <h2>My Bookings</h2>
            <div className="list">
              {customerBookings.map((booking) => (
                <article key={booking.id} className="item">
                  <p>Booking #{booking.id}</p>
                  <p>Artist ID: {booking.artistUserId}</p>
                  <p>{booking.date} {booking.startTime} - {booking.endTime}</p>
                  <p>{booking.serviceName} • ₹{booking.fee}</p>
                  <p>Status: <strong>{booking.status}</strong></p>
                  {['pending', 'confirmed'].includes(booking.status) && (
                    <button onClick={() => updateBookingStatus(booking.id, 'cancelled')}>Cancel</button>
                  )}
                </article>
              ))}
            </div>
          </section>
        </>
      )}

      {user.role === 'artist' && profile && (
        <>
          <form className="card" onSubmit={updateArtistProfile}>
            <h2>Artist Profile Builder</h2>
            <input placeholder="City" value={profile.city} onChange={(e) => setProfile({ ...profile, city: e.target.value })} />
            <input placeholder="Experience (years)" type="number" value={profile.yearsOfExperience} onChange={(e) => setProfile({ ...profile, yearsOfExperience: Number(e.target.value) })} />
            <input placeholder="Starting fee" type="number" value={profile.startingFee} onChange={(e) => setProfile({ ...profile, startingFee: Number(e.target.value) })} />
            <input placeholder="Specialties (comma separated)" value={profile.specialties.join(', ')} onChange={(e) => setProfile({ ...profile, specialties: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
            <textarea placeholder="Bio" value={profile.bio} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} />
            <button type="submit">Save Profile</button>
          </form>

          <form className="card" onSubmit={addService}>
            <h2>Add Service & Pricing</h2>
            <input placeholder="Service name" value={serviceForm.name} onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })} required />
            <input placeholder="Description" value={serviceForm.description} onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })} />
            <input placeholder="Fee" type="number" value={serviceForm.fee} onChange={(e) => setServiceForm({ ...serviceForm, fee: e.target.value })} required />
            <button type="submit">Add Service</button>
          </form>

          <form className="card" onSubmit={addAvailability}>
            <h2>Schedule / Availability</h2>
            <input type="date" value={availabilityForm.date} onChange={(e) => setAvailabilityForm({ ...availabilityForm, date: e.target.value })} required />
            <input type="time" value={availabilityForm.startTime} onChange={(e) => setAvailabilityForm({ ...availabilityForm, startTime: e.target.value })} required />
            <input type="time" value={availabilityForm.endTime} onChange={(e) => setAvailabilityForm({ ...availabilityForm, endTime: e.target.value })} required />
            <button type="submit">Add Slot</button>
          </form>

          <section className="card">
            <h2>Incoming Bookings</h2>
            <div className="list">
              {artistBookings.map((booking) => (
                <article key={booking.id} className="item">
                  <p>Booking #{booking.id}</p>
                  <p>Customer ID: {booking.customerUserId}</p>
                  <p>{booking.date} {booking.startTime} - {booking.endTime}</p>
                  <p>{booking.serviceName} • ₹{booking.fee}</p>
                  <p>Status: <strong>{booking.status}</strong></p>
                  {booking.status === 'pending' && (
                    <div className="row">
                      <button onClick={() => updateBookingStatus(booking.id, 'confirmed')}>Confirm</button>
                      <button onClick={() => updateBookingStatus(booking.id, 'rejected')}>Reject</button>
                    </div>
                  )}
                  {booking.status === 'confirmed' && (
                    <button onClick={() => updateBookingStatus(booking.id, 'completed')}>Mark Completed</button>
                  )}
                </article>
              ))}
            </div>
          </section>
        </>
      )}

      {user.role === 'admin' && (
        <section className="card">
          <h2>Pending Artist Verification</h2>
          <div className="list">
            {pendingArtists.map((artist) => (
              <article key={artist.userId} className="item">
                <p>{artist.artistName || artist.userId}</p>
                <p>{artist.city} • ₹{artist.startingFee}</p>
                <button onClick={() => verifyArtist(artist.userId)}>Verify</button>
              </article>
            ))}
          </div>
        </section>
      )}

      {message && <p className="message">{message}</p>}
    </main>
  )
}

export default App
