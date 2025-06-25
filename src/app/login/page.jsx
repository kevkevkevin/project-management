'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '@/lib/firebase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const router = useRouter()

  const handleLogin = async (e) => {
    e.preventDefault()
    try {
      await signInWithEmailAndPassword(auth, email, password)
      router.push('/dashboard')
    } catch (error) {
      alert(error.message)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-start p-8">
      <div className="max-w-[1440px] w-full mx-auto">
        <div className="w-full max-w-md ml-0 sm:ml-0 md:ml-0 lg:ml-16 bg-white bg-opacity-10 backdrop-filter backdrop-blur-lg border border-white border-opacity-20 rounded-xl p-8 shadow-2xl text-white">
          <h2 className="text-3xl font-bold mb-6 text-[#E4002B]">Log In</h2>
          <form onSubmit={handleLogin} className="space-y-6">
            <input
              className="w-full bg-[#E4002B] bg-opacity-20 border border-white border-opacity-30 rounded-md p-3 text-white placeholder-white-300 focus:outline-none focus:ring-2 focus:ring-[#E4002B] transition-all"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className="w-full bg-[#E4002B] bg-opacity-20 border border-white border-opacity-30 rounded-md p-3 text-white placeholder-white-300 focus:outline-none focus:ring-2 focus:ring-[#E4002B] transition-all"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-sm text-[#2b2b2b]">
              If you don't have an account, sign up here{' '}
              <span
                onClick={() => router.push('/signup')}
                className="text-[#E4002B] cursor-pointer hover:underline"
              >
                Sign Up 🥳
              </span>
            </p>
            <button
              type="submit"
              className="w-full bg-[#E4002B] text-white px-4 py-3 rounded-md font-medium hover:bg-red-700 hover:scale-105 transition-all duration-300"
            >
              Log In
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}