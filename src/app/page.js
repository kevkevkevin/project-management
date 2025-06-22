'use client'

import { useRouter } from 'next/navigation'


export default function LandingPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-cover bg-center bg-no-repeat flex flex-col items-center justify-center px-4 text-center"
    style={{ backgroundImage: "url('/bg.jpg')" }}>
      <h1 className="text-4xl md:text-5xl font-bold text-[#E4002B] mb-6">
        Sliders Project Management Tool 🚀
      </h1>
      <p className="text-gray-600 text-lg mb-8 max-w-xl">
        Manage tasks, communicate with your team, and stay on top of your projects with a fun, friendly interface!
      </p>

      <div className="flex flex-col sm:flex-row gap-4">
        <button
          className="bg-[#E4002B] text-white px-6 py-3 rounded-lg font-medium shadow hover:bg-[#c40024] transition"
          onClick={() => router.push('/login')}
        >
          Login
        </button>

        <button
          className="bg-white text-[#E4002B] px-6 py-3 rounded-lg border border-[#E4002B] font-medium hover:bg-[#ffe5e9] transition"
          onClick={() => router.push('/signup')}
        >
          Sign Up
        </button>

        <button
          className="bg-gray-100 text-gray-800 px-6 py-3 rounded-lg border font-medium hover:bg-gray-200 transition"
          onClick={() => window.open('https://sliders.agency', '_blank')}
        >
          Visit Our Site 🌐
        </button>
      </div>

      <footer className="mt-16 text-sm text-gray-400">&copy; {new Date().getFullYear()} Slider PM 💖. All rights reserved.</footer>
    </div>
  )
}
