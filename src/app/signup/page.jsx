'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth } from '@/lib/firebase'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export default function SignUp() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('user') // default role
  const [whatsapp, setWhatsapp] = useState('')
  const router = useRouter()

  const handleSignUp = async (e) => {
    e.preventDefault()
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password)
      const user = userCredential.user

      // Save user data in Firestore
      await setDoc(doc(db, 'users', user.uid), {
        email: user.email,
        role: role,
        whatsapp: whatsapp
      })

      router.push('/dashboard')
    } catch (error) {
      alert(error.message)
    }
  }

  return (
    <div className="p-8 max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-4">Sign Up</h2>
      <form onSubmit={handleSignUp} className="space-y-4">
        <input
          className="w-full border p-2"
          type="email"
          placeholder="Email"
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="w-full border p-2"
          type="password"
          placeholder="Password"
          onChange={(e) => setPassword(e.target.value)}
        />
        <input
          className="w-full border p-2"
          type="tel"
          placeholder="WhatsApp Number (e.g., +966123456789)"
          onChange={(e) => setWhatsapp(e.target.value)}
        />
        <select
          className="w-full border p-2"
          onChange={(e) => setRole(e.target.value)}
          value={role}
        >
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>
        <button className="bg-[#E4002B] text-white px-4 py-2 rounded">Sign Up</button>
      </form>
    </div>
  )
}
