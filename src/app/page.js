'use client'

import { useRouter } from 'next/navigation'

export default function LandingPage() {
  const router = useRouter()

  return (
    <div
      className="min-h-screen flex items-center justify-start p-8"
      
    >
      <div className="max-w-[1440px] w-full mx-auto">
        <div className="w-full max-w-md ml-0 sm:ml-0 md:ml-0 lg:ml-16 bg-white bg-opacity-10 backdrop-filter backdrop-blur-lg border border-white border-opacity-20 rounded-xl p-8 shadow-2xl text-white">
          <h1 className="text-3xl md:text-2xl font-bold mb-3 text-[#E4002B]">
            Sliders Project Management 🚀
          </h1>
          <p className="text-[#2b2b2b] text-sm mb-8 max-w-xl">
            Manage tasks, communicate with your team, and stay on top of your projects with a fun, friendly interface!
          </p>

          <div className="flex flex-col sm:flex-row gap-4">
            <button
              className="w-full sm:w-auto bg-[#E4002B] text-white px-6 py-3 rounded-lg text-sm shadow hover:bg-red-700 hover:scale-105 transition-all duration-300"
              onClick={() => router.push('/login')}
            >
              Login
            </button>

            <button
              className="w-full sm:w-auto bg-white text-[#E4002B] px-6 py-3 rounded-lg border border-[#E4002B] text-sm hover:bg-[#ffe5e9] hover:scale-105 transition-all duration-300"
              onClick={() => router.push('/signup')}
            >
              Sign Up
            </button>

            <button
              className="w-full sm:w-auto bg-gray-100 text-gray-800 px-6 py-3 rounded-lg border text-sm hover:bg-gray-200 hover:scale-105 transition-all duration-300"
              onClick={() => window.open('https://sliders.agency', '_blank')}
            >
              Visit Our Site 🌐
            </button>
          </div>

          <footer className="mt-16 text-sm text-gray-400 text-center">
            © {new Date().getFullYear()} Slider PM 💖. All rights reserved.
          </footer>
        </div>
      </div>
    </div>
  )
}